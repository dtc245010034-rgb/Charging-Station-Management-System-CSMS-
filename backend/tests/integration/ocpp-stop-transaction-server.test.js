const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, bootChargePoint } = require('../helpers/server-process');

const CODE = 'STOP-TX-CP-01';

describe('S-18 StopTransaction trên WebSocket server thật', () => {
  let server;
  let client;
  let chargePointId;
  let connectorId;
  let secondConnectorId;
  let transactionId;
  let reviewTransactionId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();

    const owner = await createUser('owner-stop-tx@test.invalid', 'STATION_OWNER');
    const stationId = (await postStation(owner, stationBody({ name: 'Station Stop Transaction' }))).body.id;
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [stationId]);
    chargePointId = (await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id",
      [stationId, CODE]
    )).rows[0].id;
    connectorId = (await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
      [chargePointId]
    )).rows[0].id;
    secondConnectorId = (await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 2) RETURNING id',
      [chargePointId]
    )).rows[0].id;

    transactionId = (await query(
      `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, meter_start, started_at, status)
       VALUES ($1, $2, 1, 1000, CURRENT_TIMESTAMP, 'CHARGING')
       RETURNING id`,
      [chargePointId, connectorId]
    )).rows[0].id;
    reviewTransactionId = (await query(
      `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, meter_start, started_at, status)
       VALUES ($1, $2, 2, 1000, CURRENT_TIMESTAMP, 'CHARGING')
       RETURNING id`,
      [chargePointId, secondConnectorId]
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

  it('chốt phiên với số đo, thời điểm, lý do và trạng thái; gọi lại không ghi đè', async () => {
    const timestamp = new Date().toISOString();
    const first = await sendCall(client, 'stop-tx-first', 'StopTransaction', {
      transactionId,
      meterStop: 1250,
      timestamp,
      reason: 'Remote',
    });
    assert.deepEqual(first, [3, 'stop-tx-first', {}]);

    const second = await sendCall(client, 'stop-tx-second', 'StopTransaction', {
      transactionId,
      meterStop: 1400,
      timestamp: new Date(Date.now() + 1000).toISOString(),
      reason: 'Local',
    });
    assert.deepEqual(second, [3, 'stop-tx-second', {}]);

    const session = (await query(
      'SELECT meter_stop, stopped_at, stop_reason, status, needs_review FROM charging_sessions WHERE id = $1',
      [transactionId]
    )).rows[0];
    assert.equal(Number(session.meter_stop), 1250);
    assert.equal(new Date(session.stopped_at).toISOString(), timestamp);
    assert.equal(session.stop_reason, 'Remote');
    assert.equal(session.status, 'COMPLETED');
    assert.equal(session.needs_review, false);
  });

  it('số đo cuối thấp hơn số đầu đóng phiên nhưng bật needs_review', async () => {
    const response = await sendCall(client, 'stop-tx-meter-reversal', 'StopTransaction', {
      transactionId: reviewTransactionId,
      meterStop: 900,
      timestamp: new Date().toISOString(),
      reason: 'PowerLoss',
    });
    assert.deepEqual(response, [3, 'stop-tx-meter-reversal', {}]);

    const session = (await query(
      'SELECT status, needs_review, review_reason FROM charging_sessions WHERE id = $1',
      [reviewTransactionId]
    )).rows[0];
    assert.equal(session.status, 'COMPLETED');
    assert.equal(session.needs_review, true);
    assert.match(session.review_reason, /METER_STOP_BELOW_START/);
  });

  it('transactionId không tồn tại trả CALLRESULT và lưu orphan với idTag đã che', async () => {
    const idTag = 'SENSITIVE-TAG-1234';
    const response = await sendCall(client, 'stop-tx-unknown', 'StopTransaction', {
      transactionId: 2147483647,
      meterStop: 10,
      timestamp: new Date().toISOString(),
      idTag,
    });
    assert.deepEqual(response, [3, 'stop-tx-unknown', {}]);

    const orphan = (await query(
      `SELECT action, payload, reason
       FROM orphan_messages
       WHERE charge_point_id = $1 AND action = 'StopTransaction'
       ORDER BY id DESC LIMIT 1`,
      [chargePointId]
    )).rows[0];
    assert.equal(orphan.reason, 'UNKNOWN_TRANSACTION');
    assert.equal(orphan.action, 'StopTransaction');
    assert.equal(orphan.payload.idTag, `${'*'.repeat(idTag.length - 4)}${idTag.slice(-4)}`);
    assert.ok(!JSON.stringify(orphan.payload).includes(idTag));
  });

  it('reason ngoài đặc tả trả CALLERROR PropertyConstraintViolation', async () => {
    const response = await sendCall(client, 'stop-tx-invalid-reason', 'StopTransaction', {
      transactionId,
      meterStop: 1300,
      timestamp: new Date().toISOString(),
      reason: 'InvalidReason',
    });
    assert.equal(response[0], 4);
    assert.equal(response[2], 'PropertyConstraintViolation');
  });
});
