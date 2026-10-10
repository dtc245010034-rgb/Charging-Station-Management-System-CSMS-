const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, bootChargePoint, sendCall } = require('../helpers/server-process');

const CODE = 'S24-REMOTE-START-CP';

describe('S-24 RemoteStartTransaction acceptance', { concurrency: false }, () => {
  let admin;
  let otherDriver;
  let driverCookie;
  let driverId;
  let chargePointId;
  let connectorIds;
  let client;
  let server;
  let responseMode = 'Accepted';
  const remoteCalls = [];

  async function postStart(cookie, connectorId) {
    return fetch(`http://127.0.0.1:${server.port}/api/connectors/${connectorId}/start`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
  }

  async function getRequest(cookie, requestId) {
    return fetch(`http://127.0.0.1:${server.port}/api/me/remote-start-requests/${requestId}`, {
      headers: { Cookie: cookie },
    });
  }

  function listenForRemoteStart(socket) {
    socket.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[0] !== 2 || frame[2] !== 'RemoteStartTransaction') return;
      remoteCalls.push(frame);
      socket.send(JSON.stringify([3, frame[1], { status: responseMode }]));
    });
  }

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('s24-admin@test.invalid', 'ADMIN');
    otherDriver = await createUser('s24-other@test.invalid', 'DRIVER');
    const station = await postStation(admin, stationBody({ name: 'S-24 test station' }));
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [station.body.id]);
    const point = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id",
      [station.body.id, CODE]
    );
    chargePointId = point.rows[0].id;
    const connectors = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
       VALUES ($1, 1, 'AVAILABLE', 'Available'), ($1, 2, 'RESERVED', 'Reserved')
       RETURNING id, connector_no`,
      [chargePointId]
    );
    connectorIds = connectors.rows.sort((a, b) => a.connector_no - b.connector_no).map((row) => row.id);

    server = await startServerProcess();
    const registered = await fetch(`http://127.0.0.1:${server.port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'S-24 Driver',
        email: 's24-driver@test.invalid',
        password: 'password123',
      }),
    });
    assert.equal(registered.status, 201);
    driverId = (await registered.json()).user.id;
    driverCookie = registered.headers.get('set-cookie').split(';')[0];
    const virtualTags = await query(
      'SELECT tag, is_virtual, status FROM id_tags WHERE user_id = $1',
      [driverId]
    );
    assert.equal(virtualTags.rowCount, 1);
    assert.equal(virtualTags.rows[0].is_virtual, true);
    assert.equal(virtualTags.rows[0].status, 'ACTIVE');
    assert.ok(virtualTags.rows[0].tag.length <= 20);

    client = await bootChargePoint(server.wsUrl, CODE);
    listenForRemoteStart(client);
  });

  after(async () => {
    client?.terminate();
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('Accepted chờ StartTransaction đúng thẻ ảo + đầu nối rồi chuyển sang STARTED', async () => {
    const list = await fetch(`http://127.0.0.1:${server.port}/api/driver/charge-points`, {
      headers: { Cookie: driverCookie },
    });
    assert.equal(list.status, 200);
    const points = await list.json();
    assert.equal(points[0].connectors.length, 2);
    assert.equal(points[0].connectors[0].available, true);
    assert.equal(points[0].connectors[1].ocpp_status, 'Reserved');
    assert.equal(points[0].connectors[1].available, false);

    responseMode = 'Accepted';
    const response = await postStart(driverCookie, connectorIds[0]);
    assert.equal(response.status, 202);
    const request = await response.json();
    assert.equal(request.status, 'PENDING');
    const time = await query(
      'SELECT EXTRACT(EPOCH FROM (deadline - created_at)) AS seconds FROM remote_start_requests WHERE id = $1',
      [request.request_id]
    );
    assert.ok(Number(time.rows[0].seconds) >= 59 && Number(time.rows[0].seconds) <= 60);
    const call = remoteCalls.at(-1);
    assert.equal(call[2], 'RemoteStartTransaction');
    assert.equal(call[3].connectorId, 1);
    const virtualTag = (await query('SELECT tag FROM id_tags WHERE user_id = $1 AND is_virtual', [driverId])).rows[0].tag;
    assert.equal(call[3].idTag, virtualTag);

    const started = await sendCall(client, 's24-start-transaction', 'StartTransaction', {
      connectorId: 1,
      idTag: virtualTag,
      meterStart: 12000,
      timestamp: new Date().toISOString(),
    });
    assert.equal(started[0], 3);
    assert.equal(started[2].idTagInfo.status, 'Accepted');
    const stateResponse = await getRequest(driverCookie, request.request_id);
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.status, 'STARTED');
    assert.equal(state.session_id, started[2].transactionId);
    const session = await query('SELECT driver_id, id_tag_id FROM charging_sessions WHERE id = $1', [state.session_id]);
    assert.equal(String(session.rows[0].driver_id), String(driverId));

    await sendCall(client, 's24-stop-transaction', 'StopTransaction', {
      transactionId: started[2].transactionId,
      meterStop: 12000,
      timestamp: new Date().toISOString(),
      reason: 'Local',
    });
  });

  it('Rejected trả thông báo kiểm tra súng và không tạo phiên', async () => {
    responseMode = 'Rejected';
    const beforeCalls = remoteCalls.length;
    const response = await postStart(driverCookie, connectorIds[0]);
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.match(body.error.message, /kiểm tra súng đã cắm chắc chưa/i);
    assert.equal(remoteCalls.length, beforeCalls + 1);
    const row = await query(
      "SELECT status FROM remote_start_requests WHERE connector_id = $1 ORDER BY id DESC LIMIT 1",
      [connectorIds[0]]
    );
    assert.equal(row.rows[0].status, 'REJECTED');
    assert.equal((await query("SELECT count(*)::int AS n FROM charging_sessions WHERE connector_id = $1 AND status = 'CHARGING'", [connectorIds[0]])).rows[0].n, 0);
  });

  it('đầu nối Charging/Reserved bị chặn ngay, không gửi RemoteStart', async () => {
    const beforeCalls = remoteCalls.length;
    await query("UPDATE connectors SET ocpp_status = 'Charging' WHERE id = $1", [connectorIds[0]]);
    let response = await postStart(driverCookie, connectorIds[0]);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'CONNECTOR_BUSY');
    await query("UPDATE connectors SET ocpp_status = 'Reserved' WHERE id = $1", [connectorIds[0]]);
    response = await postStart(driverCookie, connectorIds[0]);
    assert.equal(response.status, 409);

    response = await postStart(driverCookie, connectorIds[1]);
    assert.equal(response.status, 409);
    assert.equal(remoteCalls.length, beforeCalls);
  });

  it('quá deadline chuyển TIMED_OUT và cho phép thử lại', async () => {
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [connectorIds[0]]);
    responseMode = 'Accepted';
    const response = await postStart(driverCookie, connectorIds[0]);
    assert.equal(response.status, 202);
    const request = await response.json();
    await query("UPDATE remote_start_requests SET deadline = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1", [request.request_id]);
    const timedOutResponse = await getRequest(driverCookie, request.request_id);
    assert.equal((await timedOutResponse.json()).status, 'TIMED_OUT');

    const retry = await postStart(driverCookie, connectorIds[0]);
    assert.equal(retry.status, 202);
    const retryRequest = await retry.json();
    await query("UPDATE remote_start_requests SET deadline = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1", [retryRequest.request_id]);
    await getRequest(driverCookie, retryRequest.request_id);
  });

  it('driver không đọc được yêu cầu của tài khoản khác và người không phải driver không được gọi', async () => {
    const request = await postStart(driverCookie, connectorIds[0]);
    assert.equal(request.status, 202);
    const { request_id: requestId } = await request.json();
    const otherRead = await getRequest(otherDriver.cookie, requestId);
    assert.equal(otherRead.status, 404);
    const adminStart = await postStart(admin.cookie, connectorIds[0]);
    assert.equal(adminStart.status, 403);
    await query("UPDATE remote_start_requests SET deadline = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1", [requestId]);
    await getRequest(driverCookie, requestId);
  });
});
