const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const table = async () => (await query("SELECT to_regclass('public.charging_sessions') AS t")).rows[0].t;
let chargePointId;
let connectorId;

describe('migration 017: charging_sessions', () => {
  before(async () => {
    await resetSchema();
    const migration = run('src/db/migrate.js');
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
    const user = await query("INSERT INTO users (name, email, password_hash) VALUES ('Migration Test', 'migration-017@test.local', 'hash') RETURNING id");
    const station = await query("INSERT INTO stations (name, address, latitude, longitude, owner_id) VALUES ('Migration Test', 'Test', 21, 105, $1) RETURNING id", [user.rows[0].id]);
    const chargePoint = await query("INSERT INTO charge_points (station_id, code) VALUES ($1, 'CP-MIGRATION-017') RETURNING id", [station.rows[0].id]);
    chargePointId = chargePoint.rows[0].id;
    const connector = await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id', [chargePointId]);
    connectorId = connector.rows[0].id;
  });
  after(resetSchema);

  it('up creates integer transaction IDs, explicit states, and one-open-session index', async () => {
    assert.ok(await table());
    const indexes = await query("SELECT indexdef FROM pg_indexes WHERE tablename = 'charging_sessions'");
    const activeConnectorIndex = indexes.rows.find((row) => row.indexdef.includes('charging_sessions_one_open_per_connector'));
    assert.ok(activeConnectorIndex);
    assert.match(activeConnectorIndex.indexdef, /WHERE \(status = ANY \(ARRAY\['CHARGING'.*'NEEDS_REVIEW'/);

    const columns = await query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'charging_sessions' AND column_name = 'id'"
    );
    assert.equal(columns.rows[0].data_type, 'integer');

    await query(
      `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, id_tag_masked, meter_start, started_at, status)
       VALUES ($1, $2, 1, '****1730', 10, now(), 'CHARGING')`,
      [chargePointId, connectorId]
    );
    await assert.rejects(query(
      `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, id_tag_masked, meter_start, started_at, status)
       VALUES ($1, $2, 1, '****1730', 11, now(), 'NEEDS_REVIEW')`,
      [chargePointId, connectorId]
    ), /duplicate key/);
  });

  it('down removes the table and up reapplies it cleanly', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0].version !== '017_charging_sessions.sql') {
      const rollback = run('src/db/migrate.js', ['down']);
      assert.equal(rollback.status, 0, `${rollback.stdout}\n${rollback.stderr}`);
    }
    const rollback = run('src/db/migrate.js', ['down']);
    assert.equal(rollback.status, 0, `${rollback.stdout}\n${rollback.stderr}`);
    assert.equal(await table(), null);
    const migration = run('src/db/migrate.js');
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
    assert.ok(await table());
  });
});