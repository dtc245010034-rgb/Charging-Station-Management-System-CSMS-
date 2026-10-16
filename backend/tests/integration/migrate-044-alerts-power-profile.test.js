const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 044: alerts and charging profile log [GYM-69]', () => {
  let stationId;
  let chargePointId;
  let connectorId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
    const user = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Alert Test', 'm044-alert@test.invalid', 'hash') RETURNING id"
    );
    const station = await query(
      'INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id',
      ['Alert Station', 'Test', user.rows[0].id]
    );
    stationId = station.rows[0].id;
    const point = await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'ALERT-044') RETURNING id",
      [stationId]
    );
    chargePointId = point.rows[0].id;
    const connector = await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
      [chargePointId]
    );
    connectorId = connector.rows[0].id;
  });
  after(resetSchema);

  it('stores allowed alert and profile statuses, and deduplicates only open alerts', async () => {
    const alert = await query(
      `INSERT INTO alerts (kind, severity, station_id, charge_point_id, connector_id, message, dedup_key)
       VALUES ('POWER_PROFILE_REJECTED', 'WARNING', $1, $2, $3, 'Profile rejected', 'session:1')
       RETURNING id`,
      [stationId, chargePointId, connectorId]
    );
    await assert.rejects(
      query(
        `INSERT INTO alerts (kind, severity, station_id, message, dedup_key)
         VALUES ('POWER_PROFILE_REJECTED', 'WARNING', $1, 'Duplicate', 'session:1')`,
        [stationId]
      ),
      (error) => error.code === '23505'
    );
    await query(
      "UPDATE alerts SET closed_at = CURRENT_TIMESTAMP WHERE id = $1",
      [alert.rows[0].id]
    );
    await query(
      `INSERT INTO alerts (kind, severity, station_id, message, dedup_key)
       VALUES ('POWER_PROFILE_REJECTED', 'WARNING', $1, 'Reopened', 'session:1')`,
      [stationId]
    );
    await query(
      `INSERT INTO charging_profile_log (
         station_id, charge_point_id, connector_id, transaction_id, limit_w, status, attempt, trigger
       ) VALUES ($1, $2, $3, 7, 7300, 'ACCEPTED', 1, 'START_TRANSACTION')`,
      [stationId, chargePointId, connectorId]
    );
    await assert.rejects(
      query(
        `INSERT INTO charging_profile_log (
           station_id, charge_point_id, connector_id, transaction_id, limit_w, status, attempt, trigger
         ) VALUES ($1, $2, $3, 8, 7300, 'UNKNOWN', 1, 'START_TRANSACTION')`,
        [stationId, chargePointId, connectorId]
      ),
      (error) => error.code === '23514'
    );
    await query('DELETE FROM charge_points WHERE id = $1', [chargePointId]);
    const retainedLog = await query(
      'SELECT charge_point_id, connector_id, status FROM charging_profile_log WHERE station_id = $1',
      [stationId]
    );
    assert.deepStrictEqual(retainedLog.rows[0], { charge_point_id: null, connector_id: null, status: 'ACCEPTED' });
  });

  it('migration 044 rolls back and reapplies', async () => {
    let latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
    while (latest.rows[0]?.version !== '044_alerts_power_profile_log.sql') {
      const rollback = run('src/db/migrate.js', ['down']);
      assert.strictEqual(rollback.status, 0, rollback.stderr);
      latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    const absent = await query(
      "SELECT to_regclass('public.alerts') AS alerts, to_regclass('public.charging_profile_log') AS profile_log"
    );
    assert.deepStrictEqual(absent.rows[0], { alerts: null, profile_log: null });
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    const present = await query(
      "SELECT to_regclass('public.alerts') AS alerts, to_regclass('public.charging_profile_log') AS profile_log"
    );
    assert.ok(present.rows[0].alerts && present.rows[0].profile_log);
  });
});
