const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { run, query, resetSchema } = require('../helpers/db');

const TABLES = ['audit_logs', 'charge_points', 'charging_sessions', 'connector_errors', 'connectors', 'id_tags', 'idempotency_keys', 'login_throttle', 'meter_values', 'ocpp_messages', 'orphan_messages', 'roles', 'stations', 'user_roles', 'users'];

async function tables() {
  const r = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'schema_migrations' ORDER BY 1");
  return r.rows.map((x) => x.table_name);
}

async function rollbackThrough(version) {
  const applied = await query('SELECT version FROM schema_migrations ORDER BY id DESC');
  const count = applied.rows.findIndex((row) => row.version === version) + 1;
  assert.ok(count > 0, `${version} phải đang được áp dụng`);
  for (let index = 0; index < count; index += 1) {
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
  }
}

describe('S-01 migrate: baseline up/down/up', () => {
  before(resetSchema);
  after(resetSchema);

  it('up tạo đúng các bảng trong phạm vi, không seed user, đúng 5 roles, không cột users.role', () => {
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    return (async () => {
      assert.deepStrictEqual(await tables(), TABLES);
      assert.strictEqual((await query("SELECT 1 FROM information_schema.columns WHERE table_name = 'charge_points' AND column_name = 'heartbeat_interval'")).rowCount, 1);
      assert.strictEqual((await query("SELECT 1 FROM information_schema.columns WHERE table_name = 'connectors' AND column_name = 'ocpp_status'")).rowCount, 1);
      assert.strictEqual((await query("SELECT 1 FROM information_schema.columns WHERE table_name = 'connector_errors' AND column_name = 'vendor_error_code'")).rowCount, 1);
      const errorIndex = await query("SELECT indexdef FROM pg_indexes WHERE indexname = 'connector_errors_connector_time_idx'");
      assert.match(errorIndex.rows[0].indexdef, /\(connector_id, occurred_at\)/);
      assert.strictEqual((await query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0);
      const roles = await query('SELECT code FROM roles ORDER BY code');
      assert.deepStrictEqual(roles.rows.map((r) => r.code), ['ACCOUNTANT', 'ADMIN', 'DRIVER', 'OPERATOR', 'STATION_OWNER']);
      const col = await query("SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role'");
      assert.strictEqual(col.rowCount, 0);
      const lock = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('failed_attempts', 'locked_until')");
      assert.strictEqual(lock.rowCount, 0);
    })();
  });

  it('down về rỗng, rồi up lại sạch', async () => {
    const applied = await query('SELECT count(*)::int AS count FROM schema_migrations');
    for (let i = 0; i < applied.rows[0].count; i += 1) {
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
    }
    assert.deepStrictEqual(await tables(), []);
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    assert.deepStrictEqual(await tables(), TABLES);
  });

  it('004: tọa độ chính xác, index, idempotency và rollback; 003 vẫn rollback độc lập', async () => {
    const has = async (table, column) => (await query('SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [table, column])).rowCount === 1;
    const index = async (name) => (await query('SELECT 1 FROM pg_indexes WHERE indexname = $1', [name])).rowCount === 1;
    // Bỏ các migration sau 004 để cách ly các khẳng định dưới đây với 004.
    await rollbackThrough('005_charge_point_code_upper.sql');
    assert.ok(await has('stations', 'owner_id') && await has('audit_logs', 'ip'));
    assert.ok(await index('stations_owner_id_idx') && await index('charge_points_station_id_idx'));
    assert.ok(await has('idempotency_keys', 'response_body') && await index('stations_coordinates_idx'));
    const coordinates = await query("SELECT column_name, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = 'stations' AND column_name IN ('latitude', 'longitude') ORDER BY column_name");
    assert.deepStrictEqual(coordinates.rows, [
      { column_name: 'latitude', numeric_precision: 10, numeric_scale: 8 },
      { column_name: 'longitude', numeric_precision: 11, numeric_scale: 8 },
    ]);
    const ownerDeleteRule = await query("SELECT confdeltype FROM pg_constraint WHERE conname = 'stations_owner_id_fkey'");
    assert.strictEqual(ownerDeleteRule.rows[0].confdeltype, 'r');
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.ok(!await has('idempotency_keys', 'response_body') && !await index('stations_coordinates_idx'));
    assert.ok(await has('stations', 'owner_id') && await has('audit_logs', 'ip'));
    assert.strictEqual(run('src/db/migrate.js').status, 0); // up áp lại các migration
    await rollbackThrough('005_charge_point_code_upper.sql');
    assert.strictEqual(run('src/db/migrate.js', ['down']).status, 0); // bỏ 004
    const downOwner = run('src/db/migrate.js', ['down']);
    assert.strictEqual(downOwner.status, 0, downOwner.stderr);
    assert.ok(!await has('stations', 'owner_id') && !await has('audit_logs', 'ip'));
    assert.ok(!await index('stations_owner_id_idx') && !await index('charge_points_station_id_idx'));
    assert.deepStrictEqual(
      await tables(),
      TABLES.filter((table) => !['charging_sessions', 'connector_errors', 'id_tags', 'idempotency_keys', 'meter_values', 'ocpp_messages', 'orphan_messages'].includes(table))
    );
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
});
