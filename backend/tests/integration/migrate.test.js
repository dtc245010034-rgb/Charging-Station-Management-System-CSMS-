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
    })();
  });

  it('down về rỗng, rồi up lại sạch', async () => {
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.deepStrictEqual(await tables(), []);
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    assert.deepStrictEqual(await tables(), TABLES);
  });
});
