const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, bootChargePoint } = require('../helpers/server-process');

const CODE = 'MV-TEST-CP-01';

describe('S-19 MeterValues trên WebSocket server thật (GYM-45)', () => {
  let server;
  let client;
  let chargePointId;
  let connectorId;
  let transactionId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();

    const owner = await createUser('owner-mv@test.invalid', 'STATION_OWNER');
    const stationId = (await postStation(owner, stationBody({ name: 'Station Meter Values' }))).body.id;
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [stationId]);

    chargePointId = (await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id",
      [stationId, CODE]
    )).rows[0].id;

    connectorId = (await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
      [chargePointId]
    )).rows[0].id;

    await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 2)',
      [chargePointId]
    );

    transactionId = (await query(
      `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, id_tag_masked, meter_start, started_at, status)
       VALUES ($1, $2, 1, '***0001', 1000, CURRENT_TIMESTAMP, 'CHARGING')
       RETURNING id`,
      [chargePointId, connectorId]
    )).rows[0].id;

    server = await startServerProcess();
    client = await bootChargePoint(server.wsUrl, CODE);
  });

  after(async () => {
    client?.terminate();
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  it('lưu các đại lượng hỗ trợ (Energy, Power, Current) và bỏ qua đại lượng không hỗ trợ (Voltage)', async () => {
    const res = await sendCall(client, 'mv-supported', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: '1250', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
            { value: '22000', measurand: 'Power.Active.Import', unit: 'W' },
            { value: '31.9', measurand: 'Current.Import', unit: 'A' },
            { value: '230', measurand: 'Voltage', unit: 'V' },
          ],
        },
      ],
    });

    assert.deepEqual(res, [3, 'mv-supported', {}]);

    const readings = (await query(
      'SELECT measurand, value, unit FROM meter_values WHERE session_id = $1 ORDER BY id ASC',
      [transactionId]
    )).rows;

    assert.equal(readings.length, 3);
    assert.deepEqual(
      readings.map((r) => r.measurand),
      ['Energy.Active.Import.Register', 'Power.Active.Import', 'Current.Import']
    );
    assert.equal(readings[0].value, '1250');
    assert.equal(readings[0].unit, 'Wh');
  });

  it('lưu L1/L2/L3 cùng mốc mà không bị trùng khóa duy nhất', async () => {
    const timestamp = new Date().toISOString();
    const res = await sendCall(client, 'mv-phases', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [
        {
          timestamp,
          sampledValue: [
            { value: '100', measurand: 'Current.Import', unit: 'A', phase: 'L1', context: 'Sample.Periodic' },
            { value: '200', measurand: 'Current.Import', unit: 'A', phase: 'L2', context: 'Sample.Periodic' },
            { value: '300', measurand: 'Current.Import', unit: 'A', phase: 'L3', context: 'Sample.Periodic' },
          ],
        },
      ],
    });

    assert.deepEqual(res, [3, 'mv-phases', {}]);
    const readings = (await query(
      'SELECT phase, value FROM meter_values WHERE session_id = $1 ORDER BY phase',
      [transactionId]
    )).rows;
    assert.deepEqual(readings, [
      { phase: 'L1', value: '100' },
      { phase: 'L2', value: '200' },
      { phase: 'L3', value: '300' },
    ]);
  });

  it('giữ bản đầu khi cùng mốc, phase và context gửi lại với messageId khác', async () => {
    const timestamp = new Date().toISOString();
    const first = await sendCall(client, 'mv-duplicate-1', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [{ timestamp, sampledValue: [{ value: '500', measurand: 'Energy.Active.Import.Register', unit: 'Wh', context: 'Sample.Periodic' }] }],
    });
    const second = await sendCall(client, 'mv-duplicate-2', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [{ timestamp, sampledValue: [{ value: '999', measurand: 'Energy.Active.Import.Register', unit: 'Wh', context: 'Sample.Periodic' }] }],
    });

    assert.deepEqual(first, [3, 'mv-duplicate-1', {}]);
    assert.deepEqual(second, [3, 'mv-duplicate-2', {}]);
    const readings = (await query(
      'SELECT value, source_message_id FROM meter_values WHERE session_id = $1 AND measurand = $2',
      [transactionId, 'Energy.Active.Import.Register']
    )).rows;
    assert.deepEqual(readings, [{ value: '500', source_message_id: 'mv-duplicate-1' }]);
  });

  it('khớp phiên CHARGING của đầu nối khi MeterValues không gửi transactionId', async () => {
    const res = await sendCall(client, 'mv-no-tx', 'MeterValues', {
      connectorId: 1,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: '1300', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
          ],
        },
      ],
    });

    assert.deepEqual(res, [3, 'mv-no-tx', {}]);

    const reading = (await query(
      `SELECT value FROM meter_values WHERE session_id = $1 AND value = '1300'`,
      [transactionId]
    )).rows;
    assert.equal(reading.length, 1);
  });

  it('cách ly vào orphan_messages với reason NO_ACTIVE_SESSION khi đầu nối không có phiên sạc', async () => {
    const res = await sendCall(client, 'mv-idle', 'MeterValues', {
      connectorId: 2,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: '450', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
          ],
        },
      ],
    });

    assert.deepEqual(res, [3, 'mv-idle', {}]);

    const orphan = (await query(
      `SELECT action, reason, payload FROM orphan_messages WHERE charge_point_id = $1 AND reason = 'NO_ACTIVE_SESSION' ORDER BY id DESC LIMIT 1`,
      [chargePointId]
    )).rows[0];

    assert.ok(orphan);
    assert.equal(orphan.action, 'MeterValues');
    assert.equal(orphan.reason, 'NO_ACTIVE_SESSION');
  });

  it('cách ly vào orphan_messages với reason UNDECLARED_CONNECTOR khi connectorId chưa khai báo hoặc bằng 0', async () => {
    const res = await sendCall(client, 'mv-conn0', 'MeterValues', {
      connectorId: 0,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: '99999', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
          ],
        },
      ],
    });

    assert.deepEqual(res, [3, 'mv-conn0', {}]);

    const orphan = (await query(
      `SELECT action, reason FROM orphan_messages WHERE charge_point_id = $1 AND reason = 'UNDECLARED_CONNECTOR' ORDER BY id DESC LIMIT 1`,
      [chargePointId]
    )).rows[0];

    assert.ok(orphan);
    assert.equal(orphan.reason, 'UNDECLARED_CONNECTOR');
  });

  it('áp dụng D6: mốc thời gian lệch quá 24h được thay bằng giờ server và bật needs_review trên charging_sessions', async () => {
    const skewedTime = '1970-01-01T00:00:00.000Z';
    const beforeCall = Date.now();

    const res = await sendCall(client, 'mv-skewed', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [
        {
          timestamp: skewedTime,
          sampledValue: [
            { value: '1400', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
          ],
        },
      ],
    });

    assert.deepEqual(res, [3, 'mv-skewed', {}]);

    const reading = (await query(
      `SELECT sampled_at FROM meter_values WHERE session_id = $1 AND value = '1400'`,
      [transactionId]
    )).rows[0];

    assert.ok(reading);
    const recordedMs = new Date(reading.sampled_at).getTime();
    assert.ok(Math.abs(recordedMs - beforeCall) < 10000, 'sampled_at phải dùng giờ nhận của server thay vì 1970');

    const session = (await query(
      `SELECT needs_review, review_reason FROM charging_sessions WHERE id = $1`,
      [transactionId]
    )).rows[0];

    assert.equal(session.needs_review, true);
    assert.match(session.review_reason, /CLOCK_SKEW/);
  });

  it('ghi đồng bộ vào database trước khi trả lời CALLRESULT (D5)', async () => {
    const uniqueValue = '1888';
    const res = await sendCall(client, 'mv-sync-d5', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: uniqueValue, measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
          ],
        },
      ],
    });

    assert.deepEqual(res, [3, 'mv-sync-d5', {}]);

    // Ngay khi sendCall nhận CALLRESULT, dữ liệu phải có sẵn trong DB (không chờ setImmediate)
    const checkDb = (await query(
      `SELECT id, value FROM meter_values WHERE session_id = $1 AND value = $2`,
      [transactionId, uniqueValue]
    )).rows;

    assert.equal(checkDb.length, 1, 'Dữ liệu số đo phải được ghi đồng bộ trong DB trước khi nhận CALLRESULT');
  });

  it('từ chối payload sai định dạng hoặc vượt quá giới hạn mảng', async () => {
    const errNegativeConn = await sendCall(client, 'mv-err-conn', 'MeterValues', {
      connectorId: -1,
      meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: '10' }] }],
    });
    assert.equal(errNegativeConn[0], 4);
    assert.equal(errNegativeConn[2], 'PropertyConstraintViolation');

    const errEmpty = await sendCall(client, 'mv-err-empty', 'MeterValues', {
      connectorId: 1,
      meterValue: [],
    });
    assert.equal(errEmpty[0], 4);
    assert.equal(errEmpty[2], 'PropertyConstraintViolation');
  });
});
