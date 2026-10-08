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
      'SELECT measurand, value, unit FROM meter_values WHERE session_id = $1 AND source_message_id = $2 ORDER BY id ASC',
      [transactionId, 'mv-supported']
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
      'SELECT phase, value FROM meter_values WHERE session_id = $1 AND source_message_id = $2 ORDER BY phase',
      [transactionId, 'mv-phases']
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
      'SELECT value, source_message_id FROM meter_values WHERE session_id = $1 AND source_message_id IN ($2, $3)',
      [transactionId, 'mv-duplicate-1', 'mv-duplicate-2']
    )).rows;
    assert.deepEqual(readings, [{ value: '500', source_message_id: 'mv-duplicate-1' }]);
  });

  it('gửi hai lần cùng mốc, measurand và NULL phase/context thì chỉ lưu một dòng', async () => {
    const timestamp = new Date().toISOString();
    const first = await sendCall(client, 'mv-null-duplicate-1', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [{ timestamp, sampledValue: [{ value: '600', measurand: 'Energy.Active.Import.Register', unit: 'Wh', phase: null, context: null }] }],
    });
    const second = await sendCall(client, 'mv-null-duplicate-2', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [{ timestamp, sampledValue: [{ value: '999', measurand: 'Energy.Active.Import.Register', unit: 'Wh', phase: null, context: null }] }],
    });

    assert.deepEqual(first, [3, 'mv-null-duplicate-1', {}]);
    assert.deepEqual(second, [3, 'mv-null-duplicate-2', {}]);
    const readings = (await query(
      'SELECT value, phase, context, source_message_id FROM meter_values WHERE session_id = $1 AND source_message_id IN ($2, $3)',
      [transactionId, 'mv-null-duplicate-1', 'mv-null-duplicate-2']
    )).rows;
    assert.deepEqual(readings, [{
      value: '600',
      phase: '',
      context: '',
      source_message_id: 'mv-null-duplicate-1',
    }]);
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

  it('S-20 bỏ qua số đo cũ/trùng, giữ số đo cùng mốc đầu tiên và đánh dấu số đo năng lượng lùi', async () => {
    const baseTime = Date.now() - 5000;
    const timestamp = (offset) => new Date(baseTime + offset).toISOString();
    const sendEnergy = (messageId, sampledAt, value) => sendCall(client, messageId, 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [{
        timestamp: sampledAt,
        sampledValue: [{
          value: String(value),
          measurand: 'Energy.Active.Import.Register',
          unit: 'Wh',
          context: 'S-20.Integration',
        }],
      }],
    });

    assert.deepEqual(await sendEnergy('s20-first', timestamp(0), 2000), [3, 's20-first', {}]);
    assert.deepEqual(await sendEnergy('s20-older', timestamp(-1000), 1900), [3, 's20-older', {}]);
    assert.deepEqual(await sendEnergy('s20-duplicate', timestamp(0), 2000), [3, 's20-duplicate', {}]);
    assert.deepEqual(await sendEnergy('s20-conflict', timestamp(0), 2100), [3, 's20-conflict', {}]);
    assert.deepEqual(await sendEnergy('s20-lower', timestamp(1000), 1999), [3, 's20-lower', {}]);

    const readings = (await query(
      `SELECT source_message_id, value
       FROM meter_values
       WHERE session_id = $1 AND context = 'S-20.Integration'
       ORDER BY reported_at`,
      [transactionId]
    )).rows;
    assert.deepEqual(readings, [
      { source_message_id: 's20-first', value: '2000' },
      { source_message_id: 's20-lower', value: '1999' },
    ]);

    const session = (await query(
      'SELECT needs_review, review_reason FROM charging_sessions WHERE id = $1',
      [transactionId]
    )).rows[0];
    assert.equal(session.needs_review, true);
    assert.match(session.review_reason, /METER_VALUE_DECREASE/);
  });

  it('sắp xếp số đo đến không theo thứ tự thời gian trước khi áp dụng quy tắc S-20', async () => {
    const baseTime = Date.now() - 5000;
    const timestamp = (offset) => new Date(baseTime + offset).toISOString();
    const res = await sendCall(client, 's20-out-of-order-batch', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [
        {
          timestamp: timestamp(3000),
          sampledValue: [{
            value: '1300',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.OutOfOrder',
          }],
        },
        {
          timestamp: timestamp(1000),
          sampledValue: [{
            value: '1000',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.OutOfOrder',
          }],
        },
        {
          timestamp: timestamp(2000),
          sampledValue: [{
            value: '1100',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.OutOfOrder',
          }],
        },
      ],
    });
    assert.deepEqual(res, [3, 's20-out-of-order-batch', {}]);

    const readings = (await query(
      `SELECT value
       FROM meter_values
       WHERE session_id = $1 AND context = 'S-20.OutOfOrder'
       ORDER BY sampled_at`,
      [transactionId]
    )).rows;
    assert.deepEqual(readings.map((reading) => reading.value), ['1000', '1100', '1300']);
  });

  it('rejects extreme values and continues processing after legacy NUMERIC outliers', async () => {
    const baseTime = Date.now() - 5000;
    const streams = [
      { context: 'S-20.LegacyHuge', value: '1e200' },
      { context: 'S-20.LegacyTiny', value: '1e-130' },
    ];

    for (const { context, value } of streams) {
      await query(
        `INSERT INTO meter_values (
           session_id, reported_at, sampled_at, measurand, value, unit, raw_unit, phase, context
         ) VALUES ($1, $2, $2, 'Energy.Active.Import.Register', $3, 'Wh', 'Wh', '', $4)`,
        [transactionId, new Date(baseTime).toISOString(), value, context]
      );

      const rejected = await sendCall(client, `s20-reject-${context}`, 'MeterValues', {
        connectorId: 1,
        transactionId,
        meterValue: [{
          timestamp: new Date(baseTime + 1000).toISOString(),
          sampledValue: [{
            value,
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context,
          }],
        }],
      });
      assert.equal(rejected[0], 4);
      assert.equal(rejected[2], 'PropertyConstraintViolation');

      for (const [index, normalValue] of ['1000', '1100'].entries()) {
        const messageId = `s20-after-outlier-${context}-${index}`;
        assert.deepEqual(await sendCall(client, messageId, 'MeterValues', {
          connectorId: 1,
          transactionId,
          meterValue: [{
            timestamp: new Date(baseTime + (index + 2) * 1000).toISOString(),
            sampledValue: [{
              value: normalValue,
              measurand: 'Energy.Active.Import.Register',
              unit: 'Wh',
              context,
            }],
          }],
        }), [3, messageId, {}]);
      }
    }

    for (const { context } of streams) {
      const readings = (await query(
        `SELECT value
         FROM meter_values
         WHERE session_id = $1 AND context = $2
         ORDER BY sampled_at DESC
         LIMIT 2`,
        [transactionId, context]
      )).rows;
      assert.deepEqual(readings.map((reading) => reading.value), ['1100', '1000']);
    }
  });

  it('giữ đủ các mẫu khác thời điểm gốc khi đồng hồ trụ lệch quá 24 giờ', async () => {
    const res = await sendCall(client, 's20-skewed-batch', 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [
        {
          timestamp: '1970-01-01T00:00:00.000Z',
          sampledValue: [{
            value: '3000',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.ClockSkew',
          }],
        },
        {
          timestamp: '1970-01-01T00:00:10.000Z',
          sampledValue: [{
            value: '3010',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.ClockSkew',
          }],
        },
      ],
    });
    assert.deepEqual(res, [3, 's20-skewed-batch', {}]);

    const readings = (await query(
      `SELECT value, reported_at, sampled_at
       FROM meter_values
       WHERE session_id = $1 AND context = 'S-20.ClockSkew'
       ORDER BY reported_at`,
      [transactionId]
    )).rows;
    assert.deepEqual(readings.map((reading) => reading.value), ['3000', '3010']);
    assert.equal(readings[0].sampled_at.getTime(), readings[1].sampled_at.getTime());
  });

  it('không đánh dấu needs_review khi Power hoặc Current giảm tại mốc mới hơn', async () => {
    const connector2Id = (await query(
      'SELECT id FROM connectors WHERE charge_point_id = $1 AND connector_no = 2',
      [chargePointId]
    )).rows[0].id;
    const session2Id = (await query(
      `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, id_tag_masked, meter_start, started_at, status)
       VALUES ($1, $2, 2, '***0002', 1000, CURRENT_TIMESTAMP, 'CHARGING')
       RETURNING id`,
      [chargePointId, connector2Id]
    )).rows[0].id;
    const timestamp = new Date(Date.now() - 3000).toISOString();
    for (const [measurand, unit, firstValue, lowerValue] of [
      ['Power.Active.Import', 'W', '5000', '4000'],
      ['Current.Import', 'A', '32', '30'],
    ]) {
      assert.deepEqual(await sendCall(client, `s20-${measurand}-first`, 'MeterValues', {
        connectorId: 2,
        transactionId: session2Id,
        meterValue: [{
          timestamp,
          sampledValue: [{ value: firstValue, measurand, unit, context: `S-20.${measurand}` }],
        }],
      }), [3, `s20-${measurand}-first`, {}]);
      assert.deepEqual(await sendCall(client, `s20-${measurand}-lower`, 'MeterValues', {
        connectorId: 2,
        transactionId: session2Id,
        meterValue: [{
          timestamp: new Date(Date.parse(timestamp) + 1000).toISOString(),
          sampledValue: [{ value: lowerValue, measurand, unit, context: `S-20.${measurand}` }],
        }],
      }), [3, `s20-${measurand}-lower`, {}]);
    }

    const readings = (await query(
      'SELECT measurand, value FROM meter_values WHERE session_id = $1 ORDER BY measurand, sampled_at',
      [session2Id]
    )).rows;
    assert.deepEqual(readings, [
      { measurand: 'Current.Import', value: '32' },
      { measurand: 'Current.Import', value: '30' },
      { measurand: 'Power.Active.Import', value: '5000' },
      { measurand: 'Power.Active.Import', value: '4000' },
    ]);
    const session = (await query(
      'SELECT needs_review, review_reason FROM charging_sessions WHERE id = $1',
      [session2Id]
    )).rows[0];
    assert.equal(session.needs_review, false);
    assert.doesNotMatch(session.review_reason || '', /METER_VALUE_DECREASE/);
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
