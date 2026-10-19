const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 040: accounting periods [GYM-81]', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
  });
  after(resetSchema);

  it('S-55 AC: creates unique monthly accounting periods and checks closed dates', async () => {
    const month = await query(
      "INSERT INTO accounting_periods (month, status) VALUES ('2026-09-01', 'CLOSED') RETURNING id"
    );
    assert.ok(month.rows[0].id);
    assert.strictEqual((await query("SELECT is_period_closed('2026-09-30'::date) AS closed")).rows[0].closed, true);
    assert.strictEqual((await query("SELECT is_period_closed('2026-10-01'::date) AS closed")).rows[0].closed, false);
    await assert.rejects(
      query("INSERT INTO accounting_periods (month) VALUES ('2026-09-01')"),
      (error) => error.code === '23505'
    );
  });

  it('migration 040 rolls back and reapplies', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0]?.version !== '040_accounting_periods.sql') {
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    const absent = await query(
      "SELECT to_regclass('public.accounting_periods') AS table_name, to_regprocedure('is_period_closed(date)') AS function_name"
    );
    assert.strictEqual(absent.rows[0].table_name, null);
    assert.strictEqual(absent.rows[0].function_name, null);

    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    const present = await query("SELECT to_regclass('public.accounting_periods') AS table_name");
    assert.ok(present.rows[0].table_name);
  });
});
