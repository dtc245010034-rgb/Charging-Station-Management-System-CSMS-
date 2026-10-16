const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 043: station and connector power limits [GYM-68]', () => {
  let stationId;
  let connectorId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
    const user = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Power Test', 'm043-power@test.invalid', 'hash') RETURNING id"
    );
    const station = await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Power Station', 'Test', $1) RETURNING id",
      [user.rows[0].id]
    );
    stationId = station.rows[0].id;
    const point = await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'PWR-043') RETURNING id",
      [stationId]
    );
    const connector = await query(
      "INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id",
      [point.rows[0].id]
    );
    connectorId = connector.rows[0].id;
  });
  after(resetSchema);

  it('S-42 AC: stores nullable positive integer watt limits for stations and connectors', async () => {
    await query(
      'UPDATE stations SET power_limit_w = 22000 WHERE id = $1',
      [stationId]
    );
    await query(
      'UPDATE connectors SET rated_power_w = 7400 WHERE id = $1',
      [connectorId]
    );
    const values = await query(
      `SELECT s.power_limit_w, c.rated_power_w
       FROM stations s
       JOIN charge_points cp ON cp.station_id = s.id
       JOIN connectors c ON c.charge_point_id = cp.id
       WHERE s.id = $1 AND c.id = $2`,
      [stationId, connectorId]
    );
    assert.deepStrictEqual(values.rows[0], { power_limit_w: 22000, rated_power_w: 7400 });
    await query('UPDATE stations SET power_limit_w = NULL WHERE id = $1', [stationId]);
    await query('UPDATE connectors SET rated_power_w = NULL WHERE id = $1', [connectorId]);
    await assert.rejects(
      query('UPDATE stations SET power_limit_w = 0 WHERE id = $1', [stationId]),
      (error) => error.code === '23514'
    );
    await assert.rejects(
      query('UPDATE connectors SET rated_power_w = -1 WHERE id = $1', [connectorId]),
      (error) => error.code === '23514'
    );
  });

  it('migration 043 rolls back and reapplies', async () => {
    let latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
    while (latest.rows[0]?.version !== '043_station_power_limits.sql') {
      const rollback = run('src/db/migrate.js', ['down']);
      assert.strictEqual(rollback.status, 0, rollback.stderr);
      latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    const absent = await query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE (table_name, column_name) IN (('stations', 'power_limit_w'), ('connectors', 'rated_power_w'))`
    );
    assert.strictEqual(absent.rowCount, 0);
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    const present = await query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE (table_name, column_name) IN (('stations', 'power_limit_w'), ('connectors', 'rated_power_w'))`
    );
    assert.strictEqual(present.rowCount, 2);
  });
});
