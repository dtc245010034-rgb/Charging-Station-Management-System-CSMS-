const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema, rollbackToMigration } = require('../helpers/db');

describe('migration 045: permits zero-watt charging profiles [GYM-69]', () => {
  let stationId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
    const user = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Power Test', 'm045-power@test.invalid', 'hash') RETURNING id"
    );
    const station = await query(
      'INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id',
      ['Zero Power Station', 'Test', user.rows[0].id]
    );
    stationId = station.rows[0].id;
  });
  after(resetSchema);

  it('accepts zero, rolls back only when no zero-watt rows remain, and reapplies', async () => {
    await rollbackToMigration('046_reservations.sql');
    await query(
      `INSERT INTO charging_profile_log (
         station_id, transaction_id, limit_w, status, attempt, trigger
       ) VALUES ($1, 1, 0, 'ACCEPTED', 1, 'TEST')`,
      [stationId]
    );
    const reservationDown = run('src/db/migrate.js', ['down']);
    assert.strictEqual(reservationDown.status, 0, reservationDown.stderr);
    const refusedRollback = run('src/db/migrate.js', ['down']);
    assert.notStrictEqual(refusedRollback.status, 0);

    await query('DELETE FROM charging_profile_log WHERE station_id = $1', [stationId]);
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    await assert.rejects(
      query(
        `INSERT INTO charging_profile_log (
           station_id, transaction_id, limit_w, status, attempt, trigger
         ) VALUES ($1, 2, 0, 'ACCEPTED', 1, 'TEST')`,
        [stationId]
      ),
      (error) => error.code === '23514'
    );

    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    await query(
      `INSERT INTO charging_profile_log (
         station_id, transaction_id, limit_w, status, attempt, trigger
       ) VALUES ($1, 3, 0, 'ACCEPTED', 1, 'TEST')`,
      [stationId]
    );
    const latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
    assert.strictEqual(latest.rows[0].version, '056_users_disabled_at.sql');
  });
});
