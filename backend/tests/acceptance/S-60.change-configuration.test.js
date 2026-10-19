const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, bootChargePoint } = require('../helpers/server-process');

const CODE = 'CONFIG-AC-CP-01';

describe('S-60 ChangeConfiguration', () => {
  let admin;
  let operator;
  let owner;
  let driver;
  let chargePointId;
  let client;
  let server;
  let changeStatus = 'Accepted';
  const configuration = { HeartbeatInterval: '60', MeterValueSampleInterval: '10' };
  const calls = [];

  async function sendConfiguration(cookie, key, value) {
    return fetch(`http://127.0.0.1:${server.port}/api/charge-points/${chargePointId}/configuration`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
  }

  async function readConfiguration(cookie, key) {
    return fetch(`http://127.0.0.1:${server.port}/api/charge-points/${chargePointId}/configuration?key=${encodeURIComponent(key)}`, {
      headers: { Cookie: cookie },
    });
  }

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();

    admin = await createUser('config-admin@test.invalid', 'ADMIN');
    operator = await createUser('config-operator@test.invalid', 'OPERATOR');
    owner = await createUser('config-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('config-driver@test.invalid', 'DRIVER');
    const station = await postStation(admin, stationBody({ name: 'Configuration station' }));
    const point = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id",
      [station.body.id, CODE]
    );
    chargePointId = point.rows[0].id;

    server = await startServerProcess({ OCPP_COMMAND_TIMEOUT_SECONDS: '1' });
    client = await bootChargePoint(server.wsUrl, CODE);
    client.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[0] !== 2) return;
      const [, messageId, action, payload] = frame;
      calls.push({ action, payload });
      if (action === 'GetConfiguration') {
        const keys = payload.key || Object.keys(configuration);
        const configurationKey = keys
          .filter((key) => Object.hasOwn(configuration, key))
          .map((key) => ({ key, value: configuration[key], readonly: false }));
        const unknownKey = keys.filter((key) => !Object.hasOwn(configuration, key));
        client.send(JSON.stringify([3, messageId, { configurationKey, unknownKey }]));
      } else if (action === 'ChangeConfiguration') {
        if (changeStatus === 'Accepted' || changeStatus === 'RebootRequired') configuration[payload.key] = payload.value;
        client.send(JSON.stringify([3, messageId, { status: changeStatus }]));
      } else {
        client.send(JSON.stringify([4, messageId, 'NotImplemented', `Unsupported ${action}`, {}]));
      }
    });
  });

  after(async () => {
    client?.terminate();
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('ADMIN và OPERATOR được phép đổi cấu hình; các vai trò khác bị từ chối', async () => {
    for (const user of [owner, driver]) {
      const response = await sendConfiguration(user.cookie, 'HeartbeatInterval', '45');
      assert.equal(response.status, 403);
    }

    for (const user of [operator, admin]) {
      const response = await sendConfiguration(user.cookie, 'HeartbeatInterval', '45');
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: 'Accepted' });
    }
    assert.equal(calls.filter((call) => call.action === 'ChangeConfiguration').length, 2);
  });

  it('Accepted cập nhật heartbeat_interval và audit ghi mã trụ cùng kết quả', async () => {
    const point = await query('SELECT heartbeat_interval FROM charge_points WHERE id = $1', [chargePointId]);
    assert.equal(point.rows[0].heartbeat_interval, 45);

    const audit = await query(
      `SELECT action, entity, entity_id, metadata, result
       FROM audit_logs WHERE action = 'CHANGE_CONFIGURATION' AND entity_id = $1 ORDER BY id`,
      [chargePointId]
    );
    assert.equal(audit.rowCount, 2);
    assert.deepEqual(audit.rows[0].metadata, {
      charge_point_code: CODE,
      key: 'HeartbeatInterval',
      old_value: '60',
      new_value: '45',
    });
    assert.equal(audit.rows[0].result, 'Accepted');
  });

  it('GetConfiguration trả giá trị trụ đang giữ và thuộc tính readonly', async () => {
    const response = await readConfiguration(admin.cookie, 'HeartbeatInterval');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      key: 'HeartbeatInterval',
      value: '45',
      readonly: false,
    });
  });

  it('Accepted cho phép đổi MeterValueSampleInterval và đọc lại đúng giá trị', async () => {
    const response = await sendConfiguration(operator.cookie, 'MeterValueSampleInterval', '30');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'Accepted' });

    const current = await readConfiguration(operator.cookie, 'MeterValueSampleInterval');
    assert.equal(current.status, 200);
    assert.deepEqual(await current.json(), {
      key: 'MeterValueSampleInterval',
      value: '30',
      readonly: false,
    });
  });

  it('giữ nguyên trạng thái Accepted, Rejected, RebootRequired và NotSupported', async () => {
    const resetCallsBefore = calls.filter((call) => call.action === 'Reset').length;
    for (const status of ['RebootRequired', 'Rejected', 'NotSupported']) {
      changeStatus = status;
      const response = await sendConfiguration(admin.cookie, 'MeterValueSampleInterval', '30');
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status });
    }
    assert.equal(calls.filter((call) => call.action === 'Reset').length, resetCallsBefore);
    changeStatus = 'Accepted';
  });

  it('khóa ngoài danh sách và giá trị ngoài giới hạn trả 400 mà không gửi lệnh', async () => {
    const before = calls.length;
    for (const [key, value] of [
      ['UnsupportedKey', '1'],
      ['HeartbeatInterval', '9'],
      ['HeartbeatInterval', '86401'],
      ['HeartbeatInterval', '45.5'],
      ['MeterValueSampleInterval', '-1'],
      ['MeterValueSampleInterval', '3601'],
    ]) {
      const response = await sendConfiguration(admin.cookie, key, value);
      assert.equal(response.status, 400);
    }
    assert.equal(calls.length, before);
    assert.equal((await readConfiguration(admin.cookie, 'UnknownKey')).status, 400);
  });

  it('trụ ngoại tuyến trả 409', async () => {
    client.terminate();
    await once(client, 'close');
    const response = await sendConfiguration(admin.cookie, 'HeartbeatInterval', '90');
    assert.equal(response.status, 409);
  });
});
