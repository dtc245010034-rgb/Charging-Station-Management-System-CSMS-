const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 048: settlement statements and lines are append-only', () => {
  let ownerId;
  let statementId;
  let lineId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
    const owner = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Settlement Owner', 'settlement-owner-048@test.invalid', 'hash') RETURNING id"
    );
    ownerId = owner.rows[0].id;
    const rate = await query(
      `INSERT INTO partner_share_rates (owner_id, share_bp, effective_from)
       VALUES ($1, 7000, '2026-01-01') RETURNING id`,
      [ownerId]
    );
    const statement = await query(
      `INSERT INTO settlement_statements (
         month, version, period_closed_at, reconciliation_issue_count,
         revenue_dong, share_dong, platform_dong, generated_by
       ) VALUES ('2026-10-01', 1, CURRENT_TIMESTAMP, 0, 100, 70, 30, $1)
       RETURNING id`,
      [ownerId]
    );
    statementId = statement.rows[0].id;
    const line = await query(
      `INSERT INTO settlement_lines (
         statement_id, owner_id, rate_id, share_bp, include_idle, from_date, to_date,
         sessions, energy_dong, idle_dong, base_dong, share_dong
       ) VALUES ($1, $2, $3, 7000, TRUE, '2026-10-01', '2026-10-31', 1, 100, 0, 100, 70)
       RETURNING id`,
      [statementId, ownerId, rate.rows[0].id]
    );
    lineId = line.rows[0].id;
  });

  after(resetSchema);

  it('creates statement and line tables with unique month versions and generated line references', async () => {
    const tables = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('settlement_statements', 'settlement_lines')
       ORDER BY table_name`
    );
    assert.deepStrictEqual(tables.rows.map((row) => row.table_name), ['settlement_lines', 'settlement_statements']);
    const duplicate = await query(
      `INSERT INTO settlement_statements (
         month, version, period_closed_at, reconciliation_issue_count,
         revenue_dong, share_dong, platform_dong
       ) VALUES ('2026-10-01', 1, CURRENT_TIMESTAMP, 0, 100, 70, 30)`
    ).catch((error) => error);
    assert.equal(duplicate.code, '23505');
  });

  it('rejects UPDATE, DELETE, and TRUNCATE on both append-only tables', async () => {
    for (const sql of [
      'UPDATE settlement_statements SET share_dong = 71 WHERE id = $1',
      'DELETE FROM settlement_statements WHERE id = $1',
      'TRUNCATE settlement_statements CASCADE',
      'UPDATE settlement_lines SET share_dong = 71 WHERE id = $1',
      'DELETE FROM settlement_lines WHERE id = $1',
      'TRUNCATE settlement_lines',
    ]) {
      const id = sql.includes('settlement_lines') ? lineId : statementId;
      await assert.rejects(
        query(sql, sql.includes('$1') ? [id] : []),
        (error) => error.code === '55000'
      );
    }
  });

  it('rolls migration 048 back and reapplies it', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0]?.version !== '048_settlement_statements.sql') {
      const laterDown = run('src/db/migrate.js', ['down']);
      assert.strictEqual(laterDown.status, 0, laterDown.stderr);
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    const absent = await query(
      "SELECT to_regclass('public.settlement_statements') AS statement, to_regclass('public.settlement_lines') AS line"
    );
    assert.equal(absent.rows[0].statement, null);
    assert.equal(absent.rows[0].line, null);

    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    const present = await query("SELECT to_regclass('public.settlement_statements') AS table_name");
    assert.equal(present.rows[0].table_name, 'settlement_statements');
    const latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
    assert.equal(latest.rows[0].version, '049_user_account_management.sql');
  });
});
