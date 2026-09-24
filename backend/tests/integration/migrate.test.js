const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { run, query, resetSchema } = require('../helpers/db');

const TABLES = ['audit_logs', 'charge_points', 'connectors', 'login_throttle', 'roles', 'stations', 'user_roles', 'users'];

async function tables() {
  const r = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'schema_migrations' ORDER BY 1");
  return r.rows.map((x) => x.table_name);
}

describe('S-01 migrate: baseline up/down/up', () => {
  before(resetSchema);
  after(resetSchema);

  it('up tạo đúng 8 bảng trong phạm vi, không seed user, đúng 5 roles, không cột users.role', () => {
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    return (async () => {
      assert.deepStrictEqual(await tables(), TABLES);
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
    for (let i = 0; i < 3; i += 1) {
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
    }
    assert.deepStrictEqual(await tables(), []);
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    assert.deepStrictEqual(await tables(), TABLES);
  });

  it('003: up thêm owner_id, ip, index; down chỉ gỡ đúng phần đó', async () => {
    const has = async (table, column) => (await query('SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [table, column])).rowCount === 1;
    const index = async (name) => (await query('SELECT 1 FROM pg_indexes WHERE indexname = $1', [name])).rowCount === 1;
    assert.ok(await has('stations', 'owner_id') && await has('audit_logs', 'ip'));
    assert.ok(await index('stations_owner_id_idx') && await index('charge_points_station_id_idx'));
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.ok(!await has('stations', 'owner_id') && !await has('audit_logs', 'ip'));
    assert.ok(!await index('stations_owner_id_idx') && !await index('charge_points_station_id_idx'));
    assert.deepStrictEqual(await tables(), TABLES);
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
});
