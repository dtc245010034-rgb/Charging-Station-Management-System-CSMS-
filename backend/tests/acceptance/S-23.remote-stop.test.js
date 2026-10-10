const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, bootChargePoint, sendCall } = require('../helpers/server-process');

const CODE = 'S23-REMOTE-STOP-CP';

describe('S-23 RemoteStopTransaction acceptance', { concurrency: false }, () => {
  let admin;
  let operator;
  let owner;
  let driver;
  let chargePointId;
  let client;
  let server;
  let responseMode = 'Accepted';
  let holdNextResponse = false;
  let heldCall;
  const remoteCalls = [];

  async function sendStop(cookie, sessionId) {
    return fetch(`http://127.0.0.1:${server.port}/api/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
  }

  async function waitUntil(check, timeoutMs = 9000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await check();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }

  async function startSession(messageId) {
    const reply = await sendCall(client, messageId, 'StartTransaction', {
      connectorId: 1,
      idTag: 'S23-TAG',
      meterStart: 10000,
      timestamp: new Date().toISOString(),
    });
    assert.equal(reply[0], 3);
    assert.equal(reply[2].idTagInfo.status, 'Accepted');
    return reply[2].transactionId;
  }

  async function finishSession(transactionId, meterStop = 16000, reason = 'Local') {
    const reply = await sendCall(client, `finish-${transactionId}-${Date.now()}`, 'StopTransaction', {
      transactionId,
      meterStop,
      timestamp: new Date().toISOString(),
      reason,
    });
    assert.equal(reply[0], 3);
  }

  function listenForRemoteStop(socket) {
    socket.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[0] !== 2 || frame[2] !== 'RemoteStopTransaction') return;
      remoteCalls.push(frame);
      if (responseMode === 'silent') return;
      if (holdNextResponse) {
        holdNextResponse = false;
        heldCall = frame;
        return;
      }
      socket.send(JSON.stringify([3, frame[1], { status: responseMode }]));
    });
  }

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('s23-admin@test.invalid', 'ADMIN');
    operator = await createUser('s23-operator@test.invalid', 'OPERATOR');
    owner = await createUser('s23-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('s23-driver@test.invalid', 'DRIVER');
    const station = await postStation(admin, stationBody({ name: 'S-23 test station' }));
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [station.body.id]);
    const point = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id",
      [station.body.id, CODE]
    );
    chargePointId = point.rows[0].id;
    await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status) VALUES ($1, 1, 'AVAILABLE')",
      [chargePointId]
    );
    await query("INSERT INTO id_tags (tag, user_id, status) VALUES ('S23-TAG', $1, 'ACTIVE')", [driver.id]);

    server = await startServerProcess({ OCPP_COMMAND_TIMEOUT_SECONDS: '1', REMOTE_STOP_WAIT_SECONDS: '1' });
    client = await bootChargePoint(server.wsUrl, CODE);
    listenForRemoteStop(client);
  });

  after(async () => {
    client?.terminate();
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('Accepted không đóng phiên; StopTransaction thực tế chốt đúng reason, meter và kWh một lần', async () => {
    const sessionId = await startSession('s23-start-accepted');
    responseMode = 'Accepted';
    const response = await sendStop(operator.cookie, sessionId);
    assert.equal(response.status, 202);
    const accepted = await response.json();
    assert.equal(accepted.status, 'Accepted');
    assert.ok(Date.parse(accepted.deadline) > Date.now());
    assert.deepEqual(remoteCalls.at(-1).slice(2), ['RemoteStopTransaction', { transactionId: sessionId }]);

    let session = await query('SELECT status, remote_stop_status FROM charging_sessions WHERE id = $1', [sessionId]);
    assert.equal(session.rows[0].status, 'CHARGING');
    assert.equal(session.rows[0].remote_stop_status, 'ACCEPTED');

    await finishSession(sessionId, 16000, 'Remote');
    await finishSession(sessionId, 17000, 'Local');
    session = await query('SELECT status, meter_stop, stop_reason, remote_stop_status FROM charging_sessions WHERE id = $1', [sessionId]);
    assert.deepEqual(session.rows[0], { status: 'COMPLETED', meter_stop: '16000', stop_reason: 'Remote', remote_stop_status: 'STOPPED' });

    const detail = await fetch(`http://127.0.0.1:${server.port}/api/sessions/${sessionId}`, { headers: { Cookie: operator.cookie } });
    assert.equal((await detail.json()).current_kwh, 6);
    const audit = await query("SELECT metadata FROM audit_logs WHERE action = 'REMOTE_STOP' AND entity_id = $1", [sessionId]);
    assert.ok(audit.rowCount >= 2);
  });

  it('Rejected giữ phiên hoạt động; chỉ Operator/Admin có quyền dừng', async () => {
    const sessionId = await startSession('s23-start-rejected');
    const beforeCalls = remoteCalls.length;
    for (const user of [owner, driver]) assert.equal((await sendStop(user.cookie, sessionId)).status, 403);
    assert.equal(remoteCalls.length, beforeCalls);

    responseMode = 'Rejected';
    const rejected = await sendStop(operator.cookie, sessionId);
    assert.equal(rejected.status, 422);
    const row = await query('SELECT status, remote_stop_status FROM charging_sessions WHERE id = $1', [sessionId]);
    assert.deepEqual(row.rows[0], { status: 'CHARGING', remote_stop_status: 'REJECTED' });
    await finishSession(sessionId);
  });

  it('hai yêu cầu đồng thời chỉ gửi một CALL; lần hai nhận 409', async () => {
    const sessionId = await startSession('s23-start-concurrent');
    responseMode = 'Accepted';
    holdNextResponse = true;
    const callCount = remoteCalls.length;
    const firstPromise = sendStop(operator.cookie, sessionId);
    await waitUntil(async () => heldCall);
    const second = await sendStop(admin.cookie, sessionId);
    assert.equal(second.status, 409);
    assert.equal(remoteCalls.length, callCount + 1);
    client.send(JSON.stringify([3, heldCall[1], { status: 'Accepted' }]));
    assert.equal((await firstPromise).status, 202);
    await finishSession(sessionId);
  });

  it('Accepted không có StopTransaction được đánh dấu cần xem xét, không tự đóng', async () => {
    const sessionId = await startSession('s23-start-timeout');
    responseMode = 'Accepted';
    assert.equal((await sendStop(operator.cookie, sessionId)).status, 202);
    const closed = once(client, 'close');
    client.terminate();
    await closed;
    await stopServerProcess(server);
    server = await startServerProcess({ OCPP_COMMAND_TIMEOUT_SECONDS: '1', REMOTE_STOP_WAIT_SECONDS: '1' });
    client = await bootChargePoint(server.wsUrl, CODE);
    listenForRemoteStop(client);

    const row = await waitUntil(async () => {
      const result = await query('SELECT status, needs_review, remote_stop_status FROM charging_sessions WHERE id = $1', [sessionId]);
      return result.rows[0].remote_stop_status === 'TIMED_OUT' ? result.rows[0] : null;
    });
    assert.equal(row.status, 'CHARGING');
    assert.equal(row.needs_review, true);
    await finishSession(sessionId, 16000, 'Other');
    const ended = await query('SELECT status, stop_reason, needs_review, review_reason FROM charging_sessions WHERE id = $1', [sessionId]);
    assert.deepEqual(ended.rows[0], { status: 'COMPLETED', stop_reason: 'Other', needs_review: false, review_reason: null });
  });

  it('CALL timeout cho kết quả chưa rõ; StopTransaction đến muộn vẫn hoàn tất lệnh và gỡ review tạm thời', async () => {
    const sessionId = await startSession('s23-start-call-timeout');
    responseMode = 'silent';
    const response = await sendStop(operator.cookie, sessionId);
    assert.equal(response.status, 504);
    let session = await query('SELECT status, needs_review, remote_stop_status FROM charging_sessions WHERE id = $1', [sessionId]);
    assert.deepEqual(session.rows[0], { status: 'CHARGING', needs_review: true, remote_stop_status: 'ERROR' });

    await finishSession(sessionId, 16000, 'Remote');
    session = await query('SELECT status, needs_review, review_reason, remote_stop_status FROM charging_sessions WHERE id = $1', [sessionId]);
    assert.deepEqual(session.rows[0], { status: 'COMPLETED', needs_review: false, review_reason: null, remote_stop_status: 'STOPPED' });
  });

  it('phiên không tồn tại/đã kết thúc và trụ ngoại tuyến trả lỗi phù hợp', async () => {
    assert.equal((await sendStop(operator.cookie, 99999999)).status, 404);
    const sessionId = await startSession('s23-start-offline');
    await finishSession(sessionId);
    assert.equal((await sendStop(operator.cookie, sessionId)).status, 409);

    const activeId = await startSession('s23-start-point-offline');
    const closed = once(client, 'close');
    client.terminate();
    await closed;
    const callCount = remoteCalls.length;
    const started = Date.now();
    const response = await sendStop(operator.cookie, activeId);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'CHARGE_POINT_OFFLINE');
    assert.ok(Date.now() - started < 300);
    assert.equal(remoteCalls.length, callCount);
  });
});
