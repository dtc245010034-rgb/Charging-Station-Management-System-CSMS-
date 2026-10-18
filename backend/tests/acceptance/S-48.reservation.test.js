const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { failStalePendingReservations } = require('../../src/modules/reservations/pending-cleanup-job');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, bootChargePoint, sendCall } = require('../helpers/server-process');

const CHARGE_POINT_CODE = 'S48-RESERVATION-CP';
const ID_TAG = 'S48-TAG-01';

describe('S-48: tạo reservation và gửi ReserveNow', { concurrency: false }, () => {
  let driver;
  let secondDriver;
  let cleanupDriver;
  let lowBalanceDriver;
  let connectorId;
  let secondConnectorId;
  let thirdConnectorId;
  let chargePoint;
  let server;
  let reservationCalls;
  let reserveResponse = 'Accepted';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

  async function createReservation(key, body = { connectorId: String(connectorId), arriveInMinutes: 30 }, user = driver) {
    return fetch(`http://127.0.0.1:${server.port}/api/reservations`, {
      method: 'POST',
      headers: { Cookie: user.cookie, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body),
    });
  }

  async function waitFor(check, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('s48-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('s48-driver@test.invalid', 'DRIVER');
    secondDriver = await createUser('s48-driver-two@test.invalid', 'DRIVER');
    cleanupDriver = await createUser('s48-driver-cleanup@test.invalid', 'DRIVER');
    lowBalanceDriver = await createUser('s48-driver-low-balance@test.invalid', 'DRIVER');
    const station = await postStation(owner, stationBody({ name: 'S-48 reservation station' }));
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [station.body.id]);
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
       VALUES ($1, 1, $2::date, 15, 1000) RETURNING id`,
      [station.body.id, today]
    );
    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong)
       VALUES ($1, 0, 1440, 4000)`,
      [tariff.rows[0].id]
    );
    const point = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id",
      [station.body.id, CHARGE_POINT_CODE]
    );
    const connector = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
      VALUES ($1, 1, 'AVAILABLE', 'Available'), ($1, 2, 'AVAILABLE', 'Available'),
        ($1, 3, 'AVAILABLE', 'Available') RETURNING id, connector_no`,
      [point.rows[0].id]
    );
    connectorId = connector.rows.find((row) => row.connector_no === 1).id;
    secondConnectorId = connector.rows.find((row) => row.connector_no === 2).id;
    thirdConnectorId = connector.rows.find((row) => row.connector_no === 3).id;
    await query("INSERT INTO id_tags (tag, user_id, status) VALUES ($1, $2, 'ACTIVE')", [ID_TAG, driver.id]);
    await query("INSERT INTO id_tags (tag, user_id, status) VALUES ('S48-TAG-02', $1, 'ACTIVE')", [secondDriver.id]);
    await query("INSERT INTO id_tags (tag, user_id, status) VALUES ('S48-TAG-CLEANUP', $1, 'ACTIVE')", [cleanupDriver.id]);
    await query("INSERT INTO id_tags (tag, user_id, status) VALUES ('S48-TAG-LOW', $1, 'ACTIVE')", [lowBalanceDriver.id]);
    await withTransaction((client) => postEntry(client, {
      driverId: driver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 100000,
      receiptCode: `S48-TOPUP-${Date.now()}`,
    }));
    await withTransaction((client) => postEntry(client, {
      driverId: secondDriver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 100000,
      receiptCode: `S48-TOPUP-2-${Date.now()}`,
    }));
    await withTransaction((client) => postEntry(client, {
      driverId: cleanupDriver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 100000,
      receiptCode: `S48-TOPUP-CLEANUP-${Date.now()}`,
    }));
    await withTransaction((client) => postEntry(client, {
      driverId: lowBalanceDriver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 19999,
      receiptCode: `S48-TOPUP-LOW-${Date.now()}`,
    }));

    server = await startServerProcess();
    chargePoint = await bootChargePoint(server.wsUrl, CHARGE_POINT_CODE);
    reservationCalls = [];
    chargePoint.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[0] !== 2 || frame[2] !== 'ReserveNow') return;
      reservationCalls.push(frame);
      if (reserveResponse === 'Timeout') return;
      chargePoint.send(JSON.stringify([3, frame[1], { status: reserveResponse }]));
      if (reserveResponse === 'Accepted') setImmediate(() => chargePoint.send(JSON.stringify([2, `s48-reserved-${frame[1]}`, 'StatusNotification', {
        connectorId: frame[3].connectorId,
        status: 'Reserved',
        errorCode: 'NoError',
        timestamp: new Date().toISOString(),
      }])));
    });
  });

  after(async () => {
    chargePoint?.terminate();
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('H05: tạo PENDING trước ReserveNow, Accepted lưu hạn +45 phút và connector Reserved', async () => {
    const key = `s48-reservation-${Date.now()}`;
    const response = await createReservation(key);
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.status, 'ACCEPTED');
    assert.equal(body.arriveInMinutes, 30);
    assert.equal(reservationCalls.length, 1);

    const stored = await query(
      `SELECT id, ocpp_reservation_id, status, starts_at, expires_at,
              EXTRACT(EPOCH FROM (expires_at - starts_at)) AS duration_seconds
       FROM reservations WHERE id = $1`,
      [body.id]
    );
    assert.equal(stored.rows[0].status, 'ACCEPTED');
    assert.ok(Math.abs(Number(stored.rows[0].duration_seconds) - 2700) < 0.01);
    assert.equal(reservationCalls[0][3].connectorId, 1);
    assert.equal(reservationCalls[0][3].reservationId, stored.rows[0].ocpp_reservation_id);
    assert.equal(reservationCalls[0][3].idTag, ID_TAG);
    assert.equal(Date.parse(reservationCalls[0][3].expiryDate), new Date(stored.rows[0].expires_at).getTime());

    const auditRows = await query(
      "SELECT action, metadata FROM audit_logs WHERE action = 'RESERVATION_CREATED' AND entity_id = $1",
      [body.id]
    );
    assert.equal(auditRows.rowCount, 1);
    assert.equal(auditRows.rows[0].action, 'RESERVATION_CREATED');
    assert.equal(JSON.stringify(auditRows.rows[0].metadata).includes(ID_TAG), false);

    await waitFor(async () => {
      const result = await query('SELECT ocpp_status FROM connectors WHERE id = $1', [connectorId]);
      return result.rows[0].ocpp_status === 'Reserved';
    });

    const replay = await createReservation(key);
    assert.equal(replay.status, 201);
    assert.equal((await replay.json()).id, body.id);
    assert.equal(reservationCalls.length, 1);

    const ownReservations = await fetch(`http://127.0.0.1:${server.port}/api/me/reservations`, {
      headers: { Cookie: driver.cookie },
    });
    assert.equal(ownReservations.status, 200);
    assert.deepStrictEqual((await ownReservations.json()).map((item) => item.id), [body.id]);
    const otherReservations = await fetch(`http://127.0.0.1:${server.port}/api/me/reservations`, {
      headers: { Cookie: secondDriver.cookie },
    });
    assert.deepStrictEqual(await otherReservations.json(), []);
  });

  it('StartTransaction mang reservationId đúng thẻ chuyển reservation thành FULFILLED sau commit', async () => {
    const reservation = await query(
      "SELECT id, ocpp_reservation_id FROM reservations WHERE driver_id = $1 AND status = 'ACCEPTED'",
      [driver.id]
    );
    const started = await sendCall(chargePoint, 's48-start-fulfilled', 'StartTransaction', {
      connectorId: 1,
      idTag: ID_TAG,
      meterStart: 10000,
      timestamp: new Date().toISOString(),
      reservationId: reservation.rows[0].ocpp_reservation_id,
    });
    assert.equal(started[0], 3);
    assert.equal(started[2].idTagInfo.status, 'Accepted');
    const fulfilled = await query('SELECT status FROM reservations WHERE id = $1', [reservation.rows[0].id]);
    assert.equal(fulfilled.rows[0].status, 'FULFILLED');

    const stopped = await sendCall(chargePoint, 's48-stop-fulfilled', 'StopTransaction', {
      transactionId: started[2].transactionId,
      meterStop: 12000,
      timestamp: new Date().toISOString(),
      reason: 'Local',
    });
    assert.equal(stopped[0], 3);
  });

  it('H07: Occupied trả 409 ngay, giải phóng hold để tài xế đặt lại được', async () => {
    reserveResponse = 'Occupied';
    const rejected = await createReservation(`s48-occupied-${Date.now()}`, {
      connectorId: String(secondConnectorId),
      arriveInMinutes: 30,
    }, secondDriver);
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).error.code, 'RESERVATION_OCCUPIED');
    const failed = await query(
      "SELECT status, reject_reason FROM reservations WHERE driver_id = $1 ORDER BY id DESC LIMIT 1",
      [secondDriver.id]
    );
    assert.deepStrictEqual(failed.rows[0], { status: 'REJECTED', reject_reason: 'Occupied' });
    assert.equal((await query("SELECT count(*)::int AS count FROM reservations WHERE driver_id = $1 AND status IN ('PENDING', 'ACCEPTED')", [secondDriver.id])).rows[0].count, 0);

    reserveResponse = 'Accepted';
    const retry = await createReservation(`s48-retry-${Date.now()}`, {
      connectorId: String(secondConnectorId),
      arriveInMinutes: 15,
    }, secondDriver);
    assert.equal(retry.status, 201);
    assert.equal((await retry.json()).status, 'ACCEPTED');
  });

  it('Faulted/Unavailable/Rejected trả thông báo riêng, REJECTED giải phóng hold; timeout chuyển FAILED', async () => {
    const outcomes = [
      ['Faulted', 'RESERVATION_FAULTED'],
      ['Unavailable', 'RESERVATION_UNAVAILABLE'],
      ['Rejected', 'RESERVATION_REJECTED'],
    ];
    for (const [status, code] of outcomes) {
      await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [thirdConnectorId]);
      reserveResponse = status;
      const response = await createReservation(`s48-${status}-${Date.now()}`, {
        connectorId: String(thirdConnectorId), arriveInMinutes: 20,
      }, cleanupDriver);
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, code);
      const rejected = await query(
        "SELECT status, reject_reason FROM reservations WHERE driver_id = $1 ORDER BY id DESC LIMIT 1",
        [cleanupDriver.id]
      );
      assert.deepStrictEqual(rejected.rows[0], { status: 'REJECTED', reject_reason: status });
    }

    await query("UPDATE connectors SET status = 'AVAILABLE', ocpp_status = 'Available' WHERE id = $1", [thirdConnectorId]);
    reserveResponse = 'Timeout';
    const timeout = await createReservation(`s48-timeout-${Date.now()}`, {
      connectorId: String(thirdConnectorId), arriveInMinutes: 20,
    }, cleanupDriver);
    assert.equal(timeout.status, 504);
    assert.equal((await timeout.json()).error.code, 'OCPP_CALL_TIMEOUT');
    const failed = await query(
      "SELECT status, reject_reason FROM reservations WHERE driver_id = $1 ORDER BY id DESC LIMIT 1",
      [cleanupDriver.id]
    );
    assert.equal(failed.rows[0].status, 'FAILED');
    assert.equal((await query("SELECT count(*)::int AS count FROM reservations WHERE driver_id = $1 AND status IN ('PENDING', 'ACCEPTED')", [cleanupDriver.id])).rows[0].count, 0);
    reserveResponse = 'Accepted';
  });

  it('job cleanup quét một lần chuyển PENDING quá 60 giây thành FAILED và idempotent', async () => {
    const pending = await query(
      `INSERT INTO reservations (driver_id, connector_id, id_tag_id, starts_at, expires_at, status, created_at)
             VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1),
               CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP - INTERVAL '1 hour',
               'PENDING', CURRENT_TIMESTAMP - INTERVAL '70 seconds') RETURNING id`,
      [cleanupDriver.id, secondConnectorId]
    );
    const firstScan = await failStalePendingReservations({ query });
    assert.equal(firstScan.rowCount, 1);
    const state = await query('SELECT status, reject_reason FROM reservations WHERE id = $1', [pending.rows[0].id]);
    assert.deepStrictEqual(state.rows[0], { status: 'FAILED', reject_reason: 'PENDING_TIMEOUT' });
    assert.equal((await failStalePendingReservations({ query })).rowCount, 0);
  });

  it('H09: ví dưới ngưỡng trả WALLET_BELOW_MIN và không tạo reservation hoặc gửi ReserveNow', async () => {
    const countBefore = await query('SELECT count(*)::int AS count FROM reservations');
    const callsBefore = reservationCalls.length;
    const response = await createReservation(`s48-wallet-low-${Date.now()}`, {
      connectorId: String(thirdConnectorId),
      arriveInMinutes: 30,
    }, lowBalanceDriver);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'WALLET_BELOW_MIN');
    assert.equal((await query('SELECT count(*)::int AS count FROM reservations')).rows[0].count, countBefore.rows[0].count);
    assert.equal(reservationCalls.length, callsBefore);
  });
});
