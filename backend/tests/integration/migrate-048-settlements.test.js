const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 048: settlement_statements & settlement_lines append-only', () => {
  let adminId;
  let ownerId;
  let rateId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);

    const admin = await query("INSERT INTO users (name, email, password_hash) VALUES ('Admin', 'admin-m048@test.invalid', 'h') RETURNING id");
    adminId = admin.rows[0].id;
    const owner = await query("INSERT INTO users (name, email, password_hash) VALUES ('Owner', 'owner-m048@test.invalid', 'h') RETURNING id");
    ownerId = owner.rows[0].id;

    const rate = await query(
      "INSERT INTO partner_share_rates (owner_id, share_bp, include_idle, effective_from) VALUES ($1, 7000, true, '2026-01-01') RETURNING id",
      [ownerId]
    );
    rateId = rate.rows[0].id;
  });

  after(resetSchema);

  it('tạo statement và line thành công', async () => {
    const stmt = await query(
      `INSERT INTO settlement_statements (month, version, period_closed_at, reconciliation_issue_count, revenue_dong, share_dong, platform_dong, generated_by)
       VALUES ('2026-10-01', 1, CURRENT_TIMESTAMP, 0, 100000, 70000, 30000, $1) RETURNING id`,
      [adminId]
    );
    const stmtId = stmt.rows[0].id;

    const line = await query(
      `INSERT INTO settlement_lines (statement_id, owner_id, rate_id, share_bp, include_idle, from_date, to_date, sessions, energy_dong, idle_dong, base_dong, share_dong)
       VALUES ($1, $2, $3, 7000, true, '2026-10-01', '2026-10-31', 5, 100000, 0, 100000, 70000) RETURNING id`,
      [stmtId, ownerId, rateId]
    );
    assert.ok(line.rows[0].id);
  });

  it('chặn UPDATE, DELETE, TRUNCATE trên settlement_statements và settlement_lines', async () => {
    await assert.rejects(
      query("UPDATE settlement_statements SET revenue_dong = 200000"),
      (err) => err.code === '55000'
    );
    await assert.rejects(
      query("DELETE FROM settlement_statements"),
      (err) => err.code === '55000'
    );
    await assert.rejects(
      query("TRUNCATE TABLE settlement_statements, settlement_lines"),
      (err) => err.code === '55000'
    );

    await assert.rejects(
      query("UPDATE settlement_lines SET share_dong = 80000"),
      (err) => err.code === '55000'
    );
    await assert.rejects(
      query("DELETE FROM settlement_lines"),
      (err) => err.code === '55000'
    );
    await assert.rejects(
      query("TRUNCATE TABLE settlement_lines"),
      (err) => err.code === '55000'
    );
  });

  it('migration 048 rolls back and reapplies', async () => {
    for (const expectedLast of [
      '050_health_minutes.sql',
      '049_alerts_notified_at.sql',
      '048_settlement_statements.sql',
      '047_partner_share_rates.sql',
    ]) {
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
      const last = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
      assert.equal(last.rows[0].version, expectedLast);
    }
    const absent = await query("SELECT to_regclass('public.settlement_statements') AS t");
    assert.equal(absent.rows[0].t, null);

    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    const present = await query("SELECT to_regclass('public.settlement_statements') AS t");
    assert.equal(present.rows[0].t, 'settlement_statements');
  });
});
