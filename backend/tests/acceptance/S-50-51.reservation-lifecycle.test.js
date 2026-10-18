'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { startReservationPendingCleanupJob } = require('../../src/modules/reservations/pending-cleanup-job');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');

describe('S-50/S-51: reservation expiry and cancellation', { concurrency: false }, () => {
  let driver;
  let otherDrivers;
  let connectorIds;
  let failCancelCommand = false;
  const commandErrors = [];
  const commandCalls = [];
  const commandSender = {
    async send(code, action, payload) {
      commandCalls.push({ code, action, payload });
      if (failCancelCommand) throw new Error('OCPP call timed out: CancelReservation');
      return { status: 'Accepted' };
    },
  };

  async function insertAcceptedReservation(expiresAt, connectorId, reservationDriver = driver) {
    const result = await query(
      `INSERT INTO reservations (driver_id, connector_id, id_tag_id, status, starts_at, expires_at)
       SELECT $1, $2, id, 'ACCEPTED', CURRENT_TIMESTAMP - INTERVAL '1 hour', $3::timestamptz
       FROM id_tags WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1
       RETURNING id, ocpp_reservation_id`,
      [reservationDriver.id, connectorId, expiresAt]
    );
    return result.rows[0];
  }

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('s50-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('s50-driver@test.invalid', 'DRIVER');
    otherDrivers = await Promise.all([
      createUser('s50-driver-two@test.invalid', 'DRIVER'),
      createUser('s50-driver-three@test.invalid', 'DRIVER'),
      createUser('s50-driver-four@test.invalid', 'DRIVER'),
    ]);
    const station = await postStation(owner, stationBody({ name: 'S-50 reservation lifecycle station' }));
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [station.body.id]);
    const point = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'S50-LIFECYCLE-CP', 'UNKNOWN') RETURNING id",
      [station.body.id]
    );
    const connector = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
       VALUES ($1, 1, 'AVAILABLE', 'Available'), ($1, 2, 'AVAILABLE', 'Available'),
         ($1, 3, 'AVAILABLE', 'Available') RETURNING id, connector_no`,
       [point.rows[0].id]
    );
    connectorIds = connector.rows.sort((left, right) => left.connector_no - right.connector_no).map((row) => row.id);
    await query(
      "INSERT INTO id_tags (tag, user_id, status) VALUES ('S50-LIFECYCLE-TAG', $1, 'ACTIVE')",
      [driver.id]
    );
    await Promise.all(otherDrivers.map((otherDriver, index) => query(
      "INSERT INTO id_tags (tag, user_id, status) VALUES ($1, $2, 'ACTIVE')",
      [`S50-LIFECYCLE-TAG-${index + 2}`, otherDriver.id]
    )));
    await withTransaction((client) => postEntry(client, {
      driverId: driver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 100000,
      receiptCode: `S50-TOPUP-${Date.now()}`,
    }));
    app.locals.commandSender = commandSender;
  });

  after(async () => {
    app.locals.commandSender = undefined;
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('S-50 AC: expires a no-show, sends CancelReservation, and charges the 20,000 VND fee once', async () => {
    commandCalls.length = 0;
    commandErrors.length = 0;
    failCancelCommand = true;
    const reservation = await insertAcceptedReservation(new Date(Date.now() - 1000).toISOString(), connectorIds[0]);
    const job = startReservationPendingCleanupJob({
      db: require('../../src/db/pool').pool,
      commandSender,
      logInfo: () => {},
      logError: (message, detail) => commandErrors.push([message, detail]),
    });
    try {
      await job.run();
      await query(
        'UPDATE reservation_cancellation_queue SET next_attempt_at = CURRENT_TIMESTAMP - INTERVAL \'1 second\' WHERE reservation_id = $1',
        [reservation.id]
      );
      failCancelCommand = false;
      await job.run();
    } finally {
      job.stop();
    }

    const stored = await query('SELECT status FROM reservations WHERE id = $1', [reservation.id]);
    const fee = await query(
      "SELECT amount_dong FROM wallet_ledger WHERE entry_type = 'RESERVATION_FEE' AND reservation_id = $1",
      [reservation.id]
    );
    assert.equal(stored.rows[0].status, 'EXPIRED');
    assert.equal(fee.rowCount, 1);
    assert.equal(fee.rows[0].amount_dong, '-20000');
    assert.equal(commandCalls.length, 2);
    assert.equal(commandCalls[0].action, 'CancelReservation');
    assert.deepEqual(commandCalls[0].payload, { reservationId: reservation.ocpp_reservation_id });
    assert.equal(commandErrors.length, 1);
    const queue = await query(
      'SELECT status, attempts FROM reservation_cancellation_queue WHERE reservation_id = $1',
      [reservation.id]
    );
    assert.equal(queue.rows[0].status, 'SENT');
    assert.equal(queue.rows[0].attempts, 2);
    failCancelCommand = false;
  });

  it('S-51 AC: the driver can cancel before expiry without a fee and the connector is released', async () => {
    commandCalls.length = 0;
    const reservation = await insertAcceptedReservation(
      new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      connectorIds[1],
      otherDrivers[0]
    );
    const response = await request(app)
      .delete(`/api/me/reservations/${reservation.id}`)
      .set('Cookie', otherDrivers[0].cookie)
      .send({});

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.status, 'CANCELLED');
    const stored = await query('SELECT status FROM reservations WHERE id = $1', [reservation.id]);
    const fees = await query(
      "SELECT id FROM wallet_ledger WHERE entry_type = 'RESERVATION_FEE' AND reservation_id = $1",
      [reservation.id]
    );
    assert.equal(stored.rows[0].status, 'CANCELLED');
    assert.equal(fees.rowCount, 0);
    assert.equal(commandCalls.length, 1);
    assert.equal(commandCalls[0].action, 'CancelReservation');
    const releasedForAnotherDriver = await insertAcceptedReservation(
      new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      connectorIds[1],
      otherDrivers[1]
    );
    assert.ok(releasedForAnotherDriver);
  });

  it('S-51 AC: an expired reservation cannot win cancellation against the no-show transition', async () => {
    commandCalls.length = 0;
    const reservation = await insertAcceptedReservation(
      new Date(Date.now() - 1000).toISOString(),
      connectorIds[2],
      otherDrivers[2]
    );
    const [response] = await Promise.all([
      request(app).delete(`/api/me/reservations/${reservation.id}`).set('Cookie', otherDrivers[2].cookie).send({}),
      (async () => {
        const job = startReservationPendingCleanupJob({
          db: require('../../src/db/pool').pool,
          commandSender,
          logInfo: () => {},
          logError: (message, detail) => { throw new Error(`${message} ${detail || ''}`); },
        });
        try { await job.run(); } finally { job.stop(); }
        return null;
      })(),
    ]);
    const final = await query('SELECT status FROM reservations WHERE id = $1', [reservation.id]);
    const fee = await query(
      "SELECT amount_dong FROM wallet_ledger WHERE entry_type = 'RESERVATION_FEE' AND reservation_id = $1",
      [reservation.id]
    );
    assert.equal(response.status, 409);
    assert.equal(final.rows[0].status, 'EXPIRED');
    assert.equal(fee.rowCount, 1);
    assert.equal(fee.rows[0].amount_dong, '-20000');
  });
});
