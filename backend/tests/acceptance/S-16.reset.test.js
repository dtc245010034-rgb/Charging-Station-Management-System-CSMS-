const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, bootChargePoint } = require('../helpers/server-process');

const CODE = 'RESET-AC-CP-01';

describe('S-16 Reset từ xa', () => {
  let admin;
  let operator;
  let owner;
  let driver;
  let chargePointId;
  let client;
  let server;
  let autoRespond = true;
  let resetStatus = 'Accepted';
  let rebootOnReset = false;
  const resetCalls = [];

  async function sendReset(cookie, type = 'Soft') {
    return fetch(`http://127.0.0.1:${server.port}/api/charge-points/${chargePointId}/reset`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
  }

  async function waitForServerOutput(pattern) {
    const deadline = Date.now() + 1000;
    while (!pattern.test(server.child.output) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.match(server.child.output, pattern);
  }

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();

    admin = await createUser('reset-admin@test.invalid', 'ADMIN');
    operator = await createUser('reset-operator@test.invalid', 'OPERATOR');
    owner = await createUser('reset-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('reset-driver@test.invalid', 'DRIVER');
    const station = await postStation(admin, stationBody({ name: 'Reset station' }));
    const point = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id",
      [station.body.id, CODE]
    );
    chargePointId = point.rows[0].id;

    server = await startServerProcess({ OCPP_COMMAND_TIMEOUT_SECONDS: '1' });
    client = await bootChargePoint(server.wsUrl, CODE);
    listenForReset(client);
  });

  function listenForReset(chargePoint) {
    chargePoint.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[0] !== 2 || frame[2] !== 'Reset') return;
      resetCalls.push(frame);
      if (!autoRespond) return;
      chargePoint.send(JSON.stringify([3, frame[1], { status: resetStatus }]), () => {
        if (rebootOnReset) chargePoint.close();
      });
    });
  }

  after(async () => {
    client?.terminate();
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('chỉ ADMIN và OPERATOR được gọi Reset; vai trò khác bị từ chối', async () => {
    for (const user of [owner, driver]) {
      const response = await sendReset(user.cookie);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'FORBIDDEN');
    }
    assert.equal(resetCalls.length, 0);
  });

  it('ADMIN và OPERATOR gửi Reset Soft, ghép CALLRESULT và ghi nhật ký ứng dụng', async () => {
    for (const user of [operator, admin]) {
      const response = await sendReset(user.cookie);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: 'Accepted' });
    }
    assert.equal(resetCalls.length, 2);
    for (const call of resetCalls) {
      assert.equal(call[0], 2);
      assert.match(call[1], /^[0-9a-f-]{36}$/i);
      assert.deepEqual(call.slice(2), ['Reset', { type: 'Soft' }]);
    }

    await waitForServerOutput(/Remote Reset requested.*type: Soft/);
  });

  it('trụ ảo khởi động lại sau Reset, chuyển ngoại tuyến rồi trực tuyến khi Boot lại', async () => {
    rebootOnReset = true;
    const closed = once(client, 'close');
    const response = await sendReset(admin.cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'Accepted' });
    await closed;

    const offlineDeadline = Date.now() + 2000;
    let point;
    do {
      point = await query('SELECT status FROM charge_points WHERE id = $1', [chargePointId]);
      if (point.rows[0].status === 'UNKNOWN') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    } while (Date.now() < offlineDeadline);
    assert.equal(point.rows[0].status, 'UNKNOWN');

    client = await bootChargePoint(server.wsUrl, CODE);
    listenForReset(client);
    const online = await query('SELECT status FROM charge_points WHERE id = $1', [chargePointId]);
    assert.equal(online.rows[0].status, 'ONLINE');
    rebootOnReset = false;
  });

  it('CALLRESULT Reset có status Rejected trả HTTP 422', async () => {
    resetStatus = 'Rejected';
    const response = await sendReset(admin.cookie);
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'CHARGE_POINT_REJECTED');
    resetStatus = 'Accepted';
  });

  it('trụ không trả lời thì hết thời gian theo cấu hình, nhưng vẫn xử lý Heartbeat', async () => {
    autoRespond = false;
    const resetReceived = new Promise((resolve) => {
      const onMessage = (raw) => {
        const frame = JSON.parse(raw.toString());
        if (frame[0] === 2 && frame[2] === 'Reset') {
          client.off('message', onMessage);
          resolve(frame);
        }
      };
      client.on('message', onMessage);
    });
    const startedAt = Date.now();
    const resetResponsePromise = sendReset(admin.cookie);
    const resetCall = await resetReceived;

    assert.equal(resetCall[2], 'Reset');
    const heartbeatResult = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Heartbeat did not receive CALLRESULT')), 500);
        client.once('message', (raw) => {
          clearTimeout(timer);
          resolve(JSON.parse(raw.toString()));
        });
        client.send(JSON.stringify([2, 'heartbeat-during-reset', 'Heartbeat', {}]));
      });
    assert.equal(heartbeatResult[0], 3);
    assert.equal(heartbeatResult[1], 'heartbeat-during-reset');
    assert.ok(Number.isFinite(Date.parse(heartbeatResult[2].currentTime)));

    const response = await resetResponsePromise;
    const elapsedMs = Date.now() - startedAt;
    assert.equal(response.status, 504);
    assert.ok(elapsedMs >= 900 && elapsedMs < 3000, `expected ~1 second timeout, got ${elapsedMs}ms`);
    assert.equal((await response.json()).error.code, 'OCPP_CALL_TIMEOUT');
  });

  it('trụ ngoại tuyến trả lỗi ngay', async () => {
    client.terminate();
    await once(client, 'close');
    const sentCallsBefore = resetCalls.length;
    const startedAt = Date.now();
    const response = await sendReset(admin.cookie);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'CONFLICT');
    assert.ok(Date.now() - startedAt < 300);
    assert.equal(resetCalls.length, sentCallsBefore);
  });
});
