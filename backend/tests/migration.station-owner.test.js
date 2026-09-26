const assert = require('node:assert');
const { env } = require('./helpers/db');

Object.assign(process.env, env());

const { migrate, rollbackLastMigration } = require('../src/db/migrate');
const { pool } = require('../src/db/pool');

async function run() {
  await migrate();

  const columns = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'stations' ORDER BY ordinal_position"
  );
  const columnMap = Object.fromEntries(columns.rows.map((row) => [row.column_name, row.data_type]));
  const latitudeType = String(columnMap.latitude || '').toLowerCase();
  const longitudeType = String(columnMap.longitude || '').toLowerCase();

  assert.ok(columnMap.owner_id, 'stations.owner_id should exist after migration');
  assert.ok(columnMap.is_active, 'stations.is_active should exist after migration');
  assert.ok(['real', 'double precision'].includes(latitudeType), 'latitude should be a floating-point REAL-like type');
  assert.ok(['real', 'double precision'].includes(longitudeType), 'longitude should be a floating-point REAL-like type');

  const userId = (await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ('Owner', 'owner@test.com', 'hash') RETURNING id"
  )).rows[0].id;
  await pool.query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'STATION_OWNER'", [userId]);

  const stationId = (await pool.query(
    "INSERT INTO stations (name, address, latitude, longitude, owner_id, is_active) VALUES ('Station A', 'Addr', 12.34, 56.78, $1, true) RETURNING id",
    [userId]
  )).rows[0].id;

  assert.ok(stationId, 'station insert should succeed when owner exists');

  await pool.query("UPDATE stations SET status = 'INACTIVE', is_active = true WHERE id = $1", [stationId]);
  const inactive = (await pool.query('SELECT status, is_active FROM stations WHERE id = $1', [stationId])).rows[0];
  assert.strictEqual(inactive.is_active, false, 'INACTIVE station should always be inactive');

  await pool.query("UPDATE stations SET status = 'MAINTENANCE', is_active = false WHERE id = $1", [stationId]);
  const maintenance = (await pool.query('SELECT status, is_active FROM stations WHERE id = $1', [stationId])).rows[0];
  assert.strictEqual(maintenance.is_active, true, 'MAINTENANCE station should remain active');

  await assert.rejects(
    () => pool.query('DELETE FROM users WHERE id = $1', [userId]),
    /foreign key|fk_stations_owner|violat/i,
    'deleting a user who still owns stations should be blocked by the FK restriction'
  );

  await pool.query('DELETE FROM stations WHERE id = $1', [stationId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);

  const rolledBack = await rollbackLastMigration();
  assert.strictEqual(rolledBack, true, 'down migration should roll back the last migration');

  console.log('✅ Migration regression checks passed: owner FK restriction, REAL coordinates, and rollback behavior are working.');
}

run().catch((error) => {
  console.error('❌ Migration regression test failed:', error);
  process.exit(1);
}).finally(() => pool.end());
