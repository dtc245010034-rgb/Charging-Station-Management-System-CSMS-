const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, bootChargePoint } = require('../helpers/server-process');

const CODE = 'F8-SRV-CP-01';

describe('S-14 trên server thật: messageId đã hoàn tất tiếp tục được bảo vệ sau restart', () => {
  let server;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('owner-f8@test.invalid', 'STATION_OWNER');
    const stationId = (await postStation(owner, stationBody({ name: 'Station F8' }))).body.id;
    const cp = await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id", [stationId, CODE]);
    await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1)', [cp.rows[0].id]);
    server = await startServerProcess();
  });

  after(async () => {
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  const ocppStatus = async () => (await query(
    'SELECT c.ocpp_status FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = $1 AND c.connector_no = 1',
    [CODE]
  )).rows[0].ocpp_status;

  it('trùng ID khác nội dung sau khi trụ kết nối lại nhận câu trả lời cũ và không cập nhật nghiệp vụ', async () => {
    let client = await bootChargePoint(server.wsUrl, CODE);
    const first = await sendCall(client, '7', 'StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });
    assert.equal(first[0], 3);
    assert.equal(await ocppStatus(), 'Available');
    client.terminate();

    client = await bootChargePoint(server.wsUrl, CODE);
    const second = await sendCall(client, '7', 'StatusNotification', { connectorId: 1, status: 'Faulted', errorCode: 'GroundFailure' });
    assert.equal(second[0], 3);
    assert.deepEqual(second[2], first[2]);
    assert.equal(await ocppStatus(), 'Available');
    client.terminate();
  });

  it('gửi lại y hệt tin đã xử lý (cùng nội dung) không chạy lại handler, kể cả sau khi tiến trình khởi động lại', async () => {
    let client = await bootChargePoint(server.wsUrl, CODE);
    await sendCall(client, 'same-1', 'StatusNotification', { connectorId: 1, status: 'Charging', errorCode: 'NoError' });
    await query("UPDATE connectors SET ocpp_status = 'Marker' WHERE ocpp_status = 'Charging'");
    client.terminate();
    await stopServerProcess(server);
    server = await startServerProcess();
    client = await bootChargePoint(server.wsUrl, CODE);
    const again = await sendCall(client, 'same-1', 'StatusNotification', { connectorId: 1, status: 'Charging', errorCode: 'NoError' });
    assert.equal(again[0], 3);
    assert.equal(await ocppStatus(), 'Marker');
    client.terminate();
  });
});
