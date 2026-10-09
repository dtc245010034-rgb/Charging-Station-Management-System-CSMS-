const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, bootChargePoint } = require('../helpers/server-process');

const CODE = 'N4-LIFE-CP-01';

describe('N4/F3/N8: vòng đời kết nối của trụ trên server thật', () => {
  let stationId;
  let chargePointId;
  let server;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('owner-n4@test.invalid', 'STATION_OWNER');
    stationId = (await postStation(owner, stationBody({ name: 'Station N4' }))).body.id;
  });

  beforeEach(async () => {
    await query('DELETE FROM charge_points');
    await query('DELETE FROM ocpp_messages');
    chargePointId = (await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id", [stationId, CODE])).rows[0].id;
    await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1), ($1, 2)', [chargePointId]);
  });

  afterEach(async () => {
    await stopServerProcess(server);
    server = null;
  });

  after(async () => {
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  const cpStatus = async () => (await query('SELECT status FROM charge_points WHERE id = $1', [chargePointId])).rows[0].status;
  const connectorRows = async () => (await query('SELECT connector_no, status, ocpp_status FROM connectors WHERE charge_point_id = $1 ORDER BY connector_no', [chargePointId])).rows;
  async function eventually(read, expected, ms = 3000) {
    const deadline = Date.now() + ms;
    let value = await read();
    while (JSON.stringify(value) !== JSON.stringify(expected) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      value = await read();
    }
    return value;
  }

  for (const signal of ['SIGTERM', 'SIGINT']) it(`N4: ${signal} khi trụ đang kết nối → client nhận close 1001, DB về UNKNOWN, tiến trình thoát 0`, { timeout: 60000 }, async (t) => {
    if (process.platform === 'win32') {
      t.skip('Windows không gửi tín hiệu POSIX tới tiến trình con (kill() ngắt ngay, không chạy handler); chạy ở job Linux.');
      return;
    }
    server = await startServerProcess();
    const client = await bootChargePoint(server.wsUrl, CODE);
    await sendCall(client, 'st-1', 'StatusNotification', { connectorId: 1, status: 'Charging', errorCode: 'NoError' });
    assert.equal(await cpStatus(), 'ONLINE');

    const closed = once(client, 'close');
    server.child.kill(signal);
    const [closeCode] = await closed;
    const exit = await server.exited;

    assert.equal(closeCode, 1001);
    assert.equal(exit.code, 0, `tiến trình phải thoát sạch:\n${server.child.output}`);
    assert.equal(await cpStatus(), 'UNKNOWN');
    assert.deepEqual(await connectorRows(), [
      { connector_no: 1, status: 'UNKNOWN', ocpp_status: 'Charging' },
      { connector_no: 2, status: 'UNKNOWN', ocpp_status: null },
    ]);
  });

  it('N4: khởi động lại dọn trụ ONLINE mồ côi và đầu nối của nó trước khi mở cổng', { timeout: 60000 }, async () => {
    await query("UPDATE charge_points SET status = 'ONLINE' WHERE id = $1", [chargePointId]);
    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE charge_point_id = $1", [chargePointId]);

    server = await startServerProcess();

    assert.equal(await cpStatus(), 'UNKNOWN');
    assert.deepEqual((await connectorRows()).map((row) => [row.status, row.ocpp_status]), [['UNKNOWN', 'Available'], ['UNKNOWN', 'Available']]);
  });

  it('F3: trụ ngắt kết nối thì cả đầu nối về UNKNOWN, ocpp_status giữ nguyên', { timeout: 60000 }, async () => {
    server = await startServerProcess();
    const client = await bootChargePoint(server.wsUrl, CODE);
    await sendCall(client, 'st-1', 'StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });
    await sendCall(client, 'st-2', 'StatusNotification', { connectorId: 2, status: 'Charging', errorCode: 'NoError' });
    assert.deepEqual((await connectorRows()).map((row) => row.status), ['AVAILABLE', 'OCCUPIED']);

    client.terminate();

    const rows = await eventually(async () => (await connectorRows()).map((row) => [row.status, row.ocpp_status]), [['UNKNOWN', 'Available'], ['UNKNOWN', 'Charging']]);
    assert.deepEqual(rows, [['UNKNOWN', 'Available'], ['UNKNOWN', 'Charging']]);
    assert.equal(await cpStatus(), 'UNKNOWN');
  });

  it('T-26: nối lại báo Charging tiếp tục phiên cũ và MeterValues khớp transactionId cũ', { timeout: 60000 }, async () => {
    const connectorId = (await query(
      'SELECT id FROM connectors WHERE charge_point_id = $1 AND connector_no = 1',
      [chargePointId]
    )).rows[0].id;
    const transactionId = (await query(
      `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, id_tag_masked, meter_start, started_at, status)
       VALUES ($1, $2, 1, '***0026', 1000, CURRENT_TIMESTAMP, 'CHARGING')
       RETURNING id`,
      [chargePointId, connectorId]
    )).rows[0].id;

    server = await startServerProcess();
    const first = await bootChargePoint(server.wsUrl, CODE);
    await sendCall(first, 'charging-before-disconnect', 'StatusNotification', {
      connectorId: 1,
      status: 'Charging',
      errorCode: 'NoError',
    });
    first.terminate();
    assert.equal(await eventually(cpStatus, 'UNKNOWN'), 'UNKNOWN');
    assert.equal((await query('SELECT status FROM charging_sessions WHERE id = $1', [transactionId])).rows[0].status, 'CHARGING');

    const reconnected = await bootChargePoint(server.wsUrl, CODE);
    await sendCall(reconnected, 'charging-after-reconnect', 'StatusNotification', {
      connectorId: 1,
      status: 'Charging',
      errorCode: 'NoError',
    });
    const timestamp = new Date().toISOString();
    const meterReply = await sendCall(reconnected, 'meter-after-reconnect', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [{
        timestamp,
        sampledValue: [{ value: '1010', measurand: 'Energy.Active.Import.Register', unit: 'Wh' }],
      }],
    });

    assert.deepEqual(meterReply, [3, 'meter-after-reconnect', {}]);
    assert.equal((await query('SELECT count(*)::int AS count FROM charging_sessions WHERE charge_point_id = $1', [chargePointId])).rows[0].count, 1);
    assert.deepEqual((await query('SELECT status, needs_review FROM charging_sessions WHERE id = $1', [transactionId])).rows[0], {
      status: 'CHARGING',
      needs_review: false,
    });
    assert.equal((await query('SELECT session_id FROM meter_values WHERE session_id = $1', [transactionId])).rows[0].session_id, transactionId);
    reconnected.terminate();
  });

  it('T-26: nối lại báo Available giữ phiên CHARGING nhưng bật needs_review', { timeout: 60000 }, async () => {
    const connectorId = (await query(
      'SELECT id FROM connectors WHERE charge_point_id = $1 AND connector_no = 2',
      [chargePointId]
    )).rows[0].id;
    const transactionId = (await query(
      `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, id_tag_masked, meter_start, started_at, status)
       VALUES ($1, $2, 2, '***0027', 1000, CURRENT_TIMESTAMP, 'CHARGING')
       RETURNING id`,
      [chargePointId, connectorId]
    )).rows[0].id;

    server = await startServerProcess();
    const first = await bootChargePoint(server.wsUrl, CODE);
    await sendCall(first, 'charging-before-available-reconnect', 'StatusNotification', {
      connectorId: 2,
      status: 'Charging',
      errorCode: 'NoError',
    });
    first.terminate();
    assert.equal(await eventually(cpStatus, 'UNKNOWN'), 'UNKNOWN');

    const reconnected = await bootChargePoint(server.wsUrl, CODE);
    await sendCall(reconnected, 'available-after-reconnect', 'StatusNotification', {
      connectorId: 2,
      status: 'Available',
      errorCode: 'NoError',
    });

    const session = (await query(
      'SELECT status, needs_review, review_reason FROM charging_sessions WHERE id = $1',
      [transactionId]
    )).rows[0];
    assert.equal(session.status, 'CHARGING');
    assert.equal(session.needs_review, true);
    assert.match(session.review_reason, /CONNECTOR_AVAILABLE_WITH_OPEN_SESSION/);
    assert.equal((await query('SELECT count(*)::int AS count FROM charging_sessions WHERE charge_point_id = $1', [chargePointId])).rows[0].count, 1);
    reconnected.terminate();
  });

  it('heartbeat tiếp theo khôi phục ONLINE sau khi job đánh dấu trụ ngoại tuyến', { timeout: 60000 }, async () => {
    server = await startServerProcess();
    const client = await bootChargePoint(server.wsUrl, CODE);
    await query(
      "UPDATE charge_points SET status = 'OFFLINE', last_seen_at = CURRENT_TIMESTAMP - INTERVAL '3 minutes' WHERE id = $1",
      [chargePointId],
    );

    const heartbeat = await sendCall(client, 'hb-after-offline', 'Heartbeat', {});

    assert.equal(heartbeat[0], 3);
    assert.equal(await cpStatus(), 'ONLINE');
    assert.ok((await query('SELECT last_seen_at FROM charge_points WHERE id = $1', [chargePointId])).rows[0].last_seen_at);
    client.terminate();
  });

  it('F3: kết nối bị S-13 thay thế không làm đầu nối của kết nối mới về UNKNOWN', { timeout: 60000 }, async () => {
    server = await startServerProcess();
    const first = await bootChargePoint(server.wsUrl, CODE);
    await sendCall(first, 'st-1', 'StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });
    const firstClosed = once(first, 'close');
    const second = await bootChargePoint(server.wsUrl, CODE);
    await sendCall(second, 'st-2', 'StatusNotification', { connectorId: 1, status: 'Charging', errorCode: 'NoError' });
    await firstClosed;
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(await cpStatus(), 'ONLINE');
    assert.equal((await connectorRows())[0].status, 'OCCUPIED');
    second.terminate();
  });

  it('N8: Boot lần sau thiếu serial/firmware giữ giá trị cũ; có giá trị mới thì ghi đè', { timeout: 60000 }, async () => {
    server = await startServerProcess();
    const full = { chargePointVendor: 'VendorX', chargePointModel: 'ModelY', chargePointSerialNumber: 'SN-KEEP', firmwareVersion: '1.0.0' };
    const client = await bootChargePoint(server.wsUrl, CODE, full);
    const stored = async () => (await query('SELECT vendor, model, serial_number, firmware_version FROM charge_points WHERE id = $1', [chargePointId])).rows[0];
    assert.equal((await stored()).serial_number, 'SN-KEEP');

    await sendCall(client, 'boot-2', 'BootNotification', { chargePointVendor: 'VendorX', chargePointModel: 'ModelZ' });
    assert.deepEqual(await stored(), { vendor: 'VendorX', model: 'ModelZ', serial_number: 'SN-KEEP', firmware_version: '1.0.0' });

    await sendCall(client, 'boot-3', 'BootNotification', { chargePointVendor: 'VendorX', chargePointModel: 'ModelZ', firmwareVersion: '2.0.0' });
    assert.deepEqual(await stored(), { vendor: 'VendorX', model: 'ModelZ', serial_number: 'SN-KEEP', firmware_version: '2.0.0' });
    client.terminate();
  });

  it('N8: trụ chưa từng báo serial/firmware vẫn lưu chuỗi rỗng như S-08', { timeout: 60000 }, async () => {
    server = await startServerProcess();
    const client = await bootChargePoint(server.wsUrl, CODE);
    const row = (await query('SELECT serial_number, firmware_version FROM charge_points WHERE id = $1', [chargePointId])).rows[0];
    assert.deepEqual(row, { serial_number: '', firmware_version: '' });
    client.terminate();
  });
});
