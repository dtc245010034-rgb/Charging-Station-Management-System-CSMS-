'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema, rollbackToMigration } = require('../helpers/db');

describe('migration 053: reservation cancellation queue', () => {
  let reservationId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.equal(migrated.status, 0, migrated.stderr);
    const driver = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Queue driver', 'm053-driver@test.invalid', 'hash') RETURNING id"
    );
    const owner = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Queue owner', 'm053-owner@test.invalid', 'hash') RETURNING id"
    );
    const station = await query(
      'INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id',
      ['Queue station', 'Test', owner.rows[0].id]
    );
    const point = await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'M053-CP') RETURNING id",
      [station.rows[0].id]
    );
    const connector = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id",
      [point.rows[0].id]
    );
    const tag = await query(
      "INSERT INTO id_tags (tag, user_id, status) VALUES ('M053-TAG', $1, 'ACTIVE') RETURNING id",
      [driver.rows[0].id]
    );
    const reservation = await query(
      `INSERT INTO reservations (driver_id, connector_id, id_tag_id, status, starts_at, expires_at)
       VALUES ($1, $2, $3, 'ACCEPTED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour')
       RETURNING id`,
      [driver.rows[0].id, connector.rows[0].id, tag.rows[0].id]
    );
    reservationId = reservation.rows[0].id;
  });

  after(resetSchema);

  it('S-50/S-51 AC: queues each reservation once and constrains delivery state', async () => {
    await query('INSERT INTO reservation_cancellation_queue (reservation_id) VALUES ($1)', [reservationId]);
    await assert.rejects(
      query('INSERT INTO reservation_cancellation_queue (reservation_id) VALUES ($1)', [reservationId]),
      (error) => error.code === '23505'
    );
    await assert.rejects(
      query(
        "UPDATE reservation_cancellation_queue SET status = 'UNKNOWN' WHERE reservation_id = $1",
        [reservationId]
      ),
      (error) => error.code === '23514'
    );
  });

  it('S-50/S-51 AC: migration 053 rolls back and reapplies', async () => {
    await rollbackToMigration('053_reservation_cancellation_queue.sql');
    const down = run('src/db/migrate.js', ['down']);
    assert.equal(down.status, 0, down.stderr);
    const absent = await query("SELECT to_regclass('public.reservation_cancellation_queue') AS table_name");
    assert.equal(absent.rows[0].table_name, null);

    const up = run('src/db/migrate.js');
    assert.equal(up.status, 0, up.stderr);
    const present = await query("SELECT to_regclass('public.reservation_cancellation_queue') AS table_name");
    assert.equal(present.rows[0].table_name, 'reservation_cancellation_queue');
  });
});
