const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 046: reservation holds and PostgreSQL overlap constraint', () => {
  let driverId;
  let secondDriverId;
  let stationId;
  let connectorIds;
  let tagId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
    const user = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Reservation Test', 'm046-reservation@test.invalid', 'hash') RETURNING id"
    );
    driverId = user.rows[0].id;
    const secondDriver = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Reservation Test Two', 'm046-reservation-two@test.invalid', 'hash') RETURNING id"
    );
    secondDriverId = secondDriver.rows[0].id;
    const station = await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Reservation Station', 'Test', $1) RETURNING id",
      [driverId]
    );
    stationId = station.rows[0].id;
    const point = await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'RSV-046') RETURNING id",
      [stationId]
    );
    const firstConnector = await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
      [point.rows[0].id]
    );
    const secondConnector = await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 2) RETURNING id',
      [point.rows[0].id]
    );
    connectorIds = [firstConnector.rows[0].id, secondConnector.rows[0].id];
    const tag = await query(
      "INSERT INTO id_tags (tag, user_id, status) VALUES ('RSV-TAG-046', $1, 'ACTIVE') RETURNING id",
      [driverId]
    );
    tagId = tag.rows[0].id;
  });

  after(resetSchema);

  it('creates extension, sequence and reservations with half-open EXCLUDE and one active hold per driver', async () => {
    const extension = await query("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'");
    assert.equal(extension.rowCount, 1);
    const sequence = await query("SELECT to_regclass('reservations_ocpp_reservation_id_seq') AS name");
    assert.equal(sequence.rows[0].name, 'reservations_ocpp_reservation_id_seq');

    const times = await query(
      `INSERT INTO reservations (driver_id, connector_id, id_tag_id, starts_at, expires_at)
       VALUES ($1, $2, $3, '2026-10-17T10:00:00Z', '2026-10-17T10:45:00Z') RETURNING ocpp_reservation_id`,
      [driverId, connectorIds[0], tagId]
    );
    assert.ok(Number(times.rows[0].ocpp_reservation_id) > 0);

    await assert.rejects(
      query(
        `INSERT INTO reservations (driver_id, connector_id, id_tag_id, starts_at, expires_at)
         VALUES ($1, $2, $3, '2026-10-17T10:44:59Z', '2026-10-17T11:00:00Z')`,
        [secondDriverId, connectorIds[0], tagId]
      ),
      (error) => error.code === '23P01'
    );

    await query(
      `INSERT INTO reservations (driver_id, connector_id, id_tag_id, starts_at, expires_at)
       VALUES ($1, $2, $3, '2026-10-17T10:45:00Z', '2026-10-17T11:30:00Z')`,
      [secondDriverId, connectorIds[0], tagId]
    );
    await assert.rejects(
      query(
        `INSERT INTO reservations (driver_id, connector_id, id_tag_id, starts_at, expires_at)
         VALUES ($1, $2, $3, '2026-10-17T11:30:00Z', '2026-10-17T12:00:00Z')`,
        [driverId, connectorIds[1], tagId]
      ),
      (error) => error.code === '23505'
    );

    await query("UPDATE reservations SET status = 'REJECTED' WHERE driver_id = $1", [driverId]);
    await query(
      `INSERT INTO reservations (driver_id, connector_id, id_tag_id, starts_at, expires_at)
       VALUES ($1, $2, $3, '2026-10-17T11:30:00Z', '2026-10-17T12:00:00Z')`,
      [driverId, connectorIds[1], tagId]
    );
  });

  it('migration 046 rolls back and reapplies', async () => {
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    const absent = await query("SELECT to_regclass('public.reservations') AS table_name");
    assert.equal(absent.rows[0].table_name, null);

    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    const present = await query("SELECT to_regclass('public.reservations') AS table_name");
    assert.equal(present.rows[0].table_name, 'reservations');
  });
});
