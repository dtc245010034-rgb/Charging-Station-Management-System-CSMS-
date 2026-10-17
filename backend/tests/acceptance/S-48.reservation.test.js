const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, bootChargePoint } = require('../helpers/server-process');

const CHARGE_POINT_CODE = 'S48-RESERVATION-CP';
const ID_TAG = 'S48-TAG-01';

describe('S-48: tạo reservation và gửi ReserveNow', { concurrency: false }, () => {
  let driver;
  let connectorId;
  let chargePoint;
  let server;
  let reservationCalls;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

  async function createReservation(key, body = { connectorId: String(connectorId), arriveInMinutes: 30 }) {
    return fetch(`http://127.0.0.1:${server.port}/api/reservations`, {
      method: 'POST',
      headers: { Cookie: driver.cookie, 'Content-Type': 'application/json', 'Idempotency-Key': key },
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
       VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id`,
      [point.rows[0].id]
    );
    connectorId = connector.rows[0].id;
    await query("INSERT INTO id_tags (tag, user_id, status) VALUES ($1, $2, 'ACTIVE')", [ID_TAG, driver.id]);
    await withTransaction((client) => postEntry(client, {
      driverId: driver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 100000,
      receiptCode: `S48-TOPUP-${Date.now()}`,
    }));

    server = await startServerProcess();
    chargePoint = await bootChargePoint(server.wsUrl, CHARGE_POINT_CODE);
    reservationCalls = [];
    chargePoint.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[0] !== 2 || frame[2] !== 'ReserveNow') return;
      reservationCalls.push(frame);
      chargePoint.send(JSON.stringify([3, frame[1], { status: 'Accepted' }]));
      setImmediate(() => chargePoint.send(JSON.stringify([2, `s48-reserved-${frame[1]}`, 'StatusNotification', {
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
  });
});
