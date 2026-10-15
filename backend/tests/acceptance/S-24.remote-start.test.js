const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, bootChargePoint, sendCall } = require('../helpers/server-process');
const remoteStartService = require('../../src/modules/connectors/remote-start.service');
const { OcppCommandError } = require('../../src/modules/ocpp/commands');
const auditRepository = require('../../src/modules/audit/audit.repository');

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

  async function getPendingRequest(cookie) {
    return fetch(`http://127.0.0.1:${server.port}/api/me/remote-start-requests/pending`, {
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
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
       SELECT id, 1, (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date, 0, 0
       FROM stations WHERE id = $1 RETURNING id`,
      [station.body.id]
    );
    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong)
       VALUES ($1, 0, 1440, 1000)`,
      [tariff.rows[0].id]
    );
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
    await withTransaction((client) => postEntry(client, {
      driverId,
      entryType: 'TOPUP_MANUAL',
      amountDong: 100000,
      receiptCode: `S24-DRIVER-TOPUP-${Date.now()}`,
    }));
    await withTransaction((client) => postEntry(client, {
      driverId: otherDriver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 4999,
      receiptCode: `S24-OTHER-TOPUP-${Date.now()}`,
    }));
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
    await query("UPDATE connectors SET status = 'OCCUPIED', ocpp_status = 'Preparing' WHERE id = $1", [connectorIds[0]]);
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
    const pendingResponse = await getPendingRequest(driverCookie);
    assert.equal(pendingResponse.status, 200);
    assert.equal((await pendingResponse.json()).request_id, request.request_id);
    assert.equal(await (await getPendingRequest(otherDriver.cookie)).json(), null);
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
    assert.equal(await (await getPendingRequest(driverCookie)).json(), null);
    const session = await query('SELECT driver_id, id_tag_id FROM charging_sessions WHERE id = $1', [state.session_id]);
    assert.equal(String(session.rows[0].driver_id), String(driverId));

    await sendCall(client, 's24-stop-transaction', 'StopTransaction', {
      transactionId: started[2].transactionId,
      meterStop: 12000,
      timestamp: new Date().toISOString(),
      reason: 'Local',
    });
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [connectorIds[0]]);
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

  it('chặn một tài xế spam yêu cầu sạc đồng thời trên nhiều đầu nối khác nhau (chống chiếm trạm)', async () => {
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id IN ($1, $2)", [connectorIds[0], connectorIds[1]]);
    responseMode = 'Accepted';
    const firstReq = await postStart(driverCookie, connectorIds[0]);
    assert.equal(firstReq.status, 202);
    const { request_id: firstId } = await firstReq.json();

    // Thử gửi tiếp sang connector thứ hai khi đang có request PENDING
    const secondReq = await postStart(driverCookie, connectorIds[1]);
    assert.equal(secondReq.status, 409);
    const errBody = await secondReq.json();
    assert.equal(errBody.error.code, 'DRIVER_BUSY');

    // Dọn dẹp
    await query("UPDATE remote_start_requests SET deadline = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1", [firstId]);
    await getRequest(driverCookie, firstId);
  });

  it('chỉ một trong hai yêu cầu đồng thời của cùng tài xế được chấp nhận', async () => {
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id IN ($1, $2)", [connectorIds[0], connectorIds[1]]);
    responseMode = 'Accepted';
    const beforeCalls = remoteCalls.length;
    const responses = await Promise.all(connectorIds.map((connectorId) => postStart(driverCookie, connectorId)));
    assert.deepEqual(responses.map((response) => response.status).sort(), [202, 409]);
    assert.equal(remoteCalls.length, beforeCalls + 1);

    const conflict = responses.find((response) => response.status === 409);
    assert.equal((await conflict.json()).error.code, 'DRIVER_BUSY');
    const accepted = await responses.find((response) => response.status === 202).json();
    await query("UPDATE remote_start_requests SET deadline = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1", [accepted.request_id]);
    await getRequest(driverCookie, accepted.request_id);
  });

  it('tài xế đang có phiên CHARGING không được bắt đầu thêm phiên thứ hai và không gửi lệnh xuống trụ', async () => {
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [connectorIds[0]]);
    const virtualTag = (await query('SELECT tag FROM id_tags WHERE user_id = $1 AND is_virtual', [driverId])).rows[0].tag;
    const started = await sendCall(client, 's24-active-session-start', 'StartTransaction', {
      connectorId: 2,
      idTag: virtualTag,
      meterStart: 500,
      timestamp: new Date().toISOString(),
    });
    assert.equal(started[0], 3);

    const beforeCalls = remoteCalls.length;
    const response = await postStart(driverCookie, connectorIds[0]);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'DRIVER_HAS_ACTIVE_SESSION');
    assert.equal(remoteCalls.length, beforeCalls);
    const requests = await query("SELECT 1 FROM remote_start_requests WHERE driver_id = $1 AND status = 'PENDING'", [driverId]);
    assert.equal(requests.rowCount, 0);

    await sendCall(client, 's24-active-session-stop', 'StopTransaction', {
      transactionId: started[2].transactionId,
      meterStop: 500,
      timestamp: new Date().toISOString(),
      reason: 'Local',
    });
  });

  it('lỗi ngoại tuyến và gateway timeout đóng yêu cầu, ghi audit để tài xế thử lại', async () => {
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [connectorIds[0]]);
    const beforeCalls = remoteCalls.length;
    await assert.rejects(
      remoteStartService.requestRemoteStart(
        { id: driverId },
        connectorIds[0],
        { commandSender: { send: async () => { throw new OcppCommandError('OFFLINE', 'offline'); } }, ip: '127.0.0.1' }
      ),
      (error) => error.status === 409 && error.code === 'CHARGE_POINT_OFFLINE'
    );
    assert.equal(remoteCalls.length, beforeCalls);

    let latest = await query(
      "SELECT id, status FROM remote_start_requests WHERE driver_id = $1 ORDER BY id DESC LIMIT 1",
      [driverId]
    );
    assert.equal(latest.rows[0].status, 'ERROR');
    await assert.rejects(
      remoteStartService.requestRemoteStart(
        { id: driverId },
        connectorIds[0],
        { commandSender: { send: async () => { throw new Error('OCPP call timed out: RemoteStartTransaction'); } }, ip: '127.0.0.1' }
      ),
      (error) => error.status === 504 && error.code === 'OCPP_CALL_TIMEOUT'
    );
    latest = await query(
      "SELECT id, status FROM remote_start_requests WHERE driver_id = $1 ORDER BY id DESC LIMIT 1",
      [driverId]
    );
    assert.equal(latest.rows[0].status, 'ERROR');
    const auditRows = await query(
      "SELECT result, metadata->>'result' AS metadata_result FROM audit_logs WHERE action = 'REMOTE_START' AND entity_id = $1 ORDER BY id DESC LIMIT 2",
      [connectorIds[0]]
    );
    assert.deepEqual(auditRows.rows, [
      { result: 'ERROR', metadata_result: 'ERROR' },
      { result: 'ERROR', metadata_result: 'ERROR' },
    ]);

    const retry = await remoteStartService.requestRemoteStart(
      { id: driverId },
      connectorIds[0],
      { commandSender: { send: async () => ({ status: 'Accepted' }) }, ip: '127.0.0.1' }
    );
    assert.equal(retry.status, 'PENDING');
    await query("UPDATE remote_start_requests SET deadline = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1", [retry.request_id]);
    await getRequest(driverCookie, retry.request_id);
  });

  it('lỗi ghi audit sau khi trụ chấp nhận không biến yêu cầu đang chờ thành thất bại', async () => {
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [connectorIds[0]]);
    const recordAudit = auditRepository.record;
    auditRepository.record = async () => { throw new Error('audit database unavailable'); };
    try {
      await assert.rejects(
        remoteStartService.requestRemoteStart(
          { id: driverId },
          connectorIds[0],
          { commandSender: { send: async () => ({ status: 'Accepted' }) } }
        ),
        /audit database unavailable/
      );
    } finally {
      auditRepository.record = recordAudit;
    }

    const pending = await query(
      "SELECT id, status FROM remote_start_requests WHERE driver_id = $1 AND status = 'PENDING'",
      [driverId]
    );
    assert.equal(pending.rowCount, 1);
    assert.equal(pending.rows[0].status, 'PENDING');
    await query("UPDATE remote_start_requests SET deadline = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1", [pending.rows[0].id]);
    await getRequest(driverCookie, pending.rows[0].id);
  });

  it('đầu nối bị bảo trì (connectors.status != AVAILABLE) bị từ chối ngay dù ocpp_status là Available', async () => {
    await query("UPDATE connectors SET status = 'UNAVAILABLE', ocpp_status = 'Available' WHERE id = $1", [connectorIds[0]]);
    const response = await postStart(driverCookie, connectorIds[0]);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'CONNECTOR_UNAVAILABLE');
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [connectorIds[0]]);
  });

  it('lệnh RemoteStartTransaction ghi nhận đúng nhật ký vào audit_logs', async () => {
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [connectorIds[0]]);
    responseMode = 'Accepted';
    const response = await postStart(driverCookie, connectorIds[0]);
    assert.equal(response.status, 202);
    const { request_id: reqId } = await response.json();

    const auditRow = await query(
      "SELECT action, entity, entity_id, result, metadata FROM audit_logs WHERE action = 'REMOTE_START' AND entity_id = $1 ORDER BY id DESC LIMIT 1",
      [connectorIds[0]]
    );
    assert.equal(auditRow.rowCount, 1);
    assert.equal(auditRow.rows[0].action, 'REMOTE_START');
    assert.equal(auditRow.rows[0].result, 'ACCEPTED');
    assert.equal(auditRow.rows[0].metadata.result, 'ACCEPTED');

    await query("UPDATE remote_start_requests SET deadline = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1", [reqId]);
    await getRequest(driverCookie, reqId);
  });

  it('ví dưới ngưỡng bị từ chối trước khi tạo yêu cầu hoặc gửi RemoteStart', async () => {
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [connectorIds[1]]);
    const beforeCalls = remoteCalls.length;
    const response = await postStart(otherDriver.cookie, connectorIds[1]);

    assert.equal(response.status, 409);
    const error = (await response.json()).error;
    assert.equal(error.code, 'WALLET_BELOW_MIN');
    assert.deepEqual(error.details, { balanceDong: '4999', minBalanceDong: '5000' });
    assert.equal(remoteCalls.length, beforeCalls);
    assert.equal((await query(
      'SELECT COUNT(*)::int AS count FROM remote_start_requests WHERE driver_id = $1',
      [otherDriver.id]
    )).rows[0].count, 0);
    await query("UPDATE connectors SET status = 'RESERVED', ocpp_status = 'Reserved' WHERE id = $1", [connectorIds[1]]);
  });

  it('ví đang khóa bị từ chối trước khi tạo yêu cầu hoặc gửi RemoteStart', async () => {
    await query(
      `UPDATE wallets
       SET locked = TRUE, locked_reason = 'LEDGER_MISMATCH', locked_at = CURRENT_TIMESTAMP
       WHERE driver_id = $1`,
      [otherDriver.id]
    );
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [connectorIds[1]]);
    const beforeCalls = remoteCalls.length;
    try {
      const response = await postStart(otherDriver.cookie, connectorIds[1]);
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, 'WALLET_LOCKED');
      assert.equal(remoteCalls.length, beforeCalls);
      assert.equal((await query(
        'SELECT COUNT(*)::int AS count FROM remote_start_requests WHERE driver_id = $1',
        [otherDriver.id]
      )).rows[0].count, 0);
    } finally {
      await query(
        'UPDATE wallets SET locked = FALSE, locked_reason = NULL, locked_at = NULL WHERE driver_id = $1',
        [otherDriver.id]
      );
      await query("UPDATE connectors SET status = 'RESERVED', ocpp_status = 'Reserved' WHERE id = $1", [connectorIds[1]]);
    }
  });
});
