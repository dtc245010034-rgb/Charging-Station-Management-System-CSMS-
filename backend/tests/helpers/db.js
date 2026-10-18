const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '../..');
const BASE = process.env.TEST_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';

if (!new URL(BASE).pathname.slice(1).endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL phải trỏ tới database có tên kết thúc bằng _test');
}

function env(extra = {}) {
  return { ...process.env, PATH: process.env.PATH, CSMS_SKIP_DOTENV: '1', DATABASE_URL: BASE, JWT_SECRET: 'z'.repeat(40), APP_ORIGIN: 'http://localhost:3000', SANDBOX_GATEWAY: '1', PAYMENT_WEBHOOK_SECRET: 'test-secret-0123456789abcdef0123456789abcd', ...extra };
}

function run(script, args = [], extra = {}) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, env: env(extra), encoding: 'utf8' });
}

async function query(sql, params) {
  const client = new Client({ connectionString: BASE });
  await client.connect();
  try { return await client.query(sql, params); } finally { await client.end(); }
}

async function resetSchema() {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

async function truncateAuditLogs() {
  await query(`
    BEGIN;
    ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_truncate;
    TRUNCATE audit_logs RESTART IDENTITY;
    ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_truncate;
    COMMIT;
  `);
}

async function truncateAll() {
  await query(`
    BEGIN;
    ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_truncate;
    ALTER TABLE partner_share_rates DISABLE TRIGGER partner_share_rates_no_truncate;
    ALTER TABLE tariffs DISABLE TRIGGER tariffs_no_truncate;
    ALTER TABLE tariff_periods DISABLE TRIGGER tariff_periods_no_truncate;
    ALTER TABLE session_invoices DISABLE TRIGGER session_invoices_no_truncate;
    ALTER TABLE invoice_lines DISABLE TRIGGER invoice_lines_no_truncate;
    ALTER TABLE settlement_statements DISABLE TRIGGER settlement_statements_no_truncate;
    ALTER TABLE settlement_lines DISABLE TRIGGER settlement_lines_no_truncate;
    ALTER TABLE wallet_ledger DISABLE TRIGGER wallet_ledger_no_truncate;
    TRUNCATE audit_logs, login_throttle, connectors, charge_points, stations, user_roles, users,
      tariffs, tariff_periods, wallets, wallet_ledger, wallet_topups, notifications, email_outbox,
      partner_share_rates, settlement_statements, settlement_lines RESTART IDENTITY CASCADE;
    ALTER TABLE wallet_ledger ENABLE TRIGGER wallet_ledger_no_truncate;
    ALTER TABLE settlement_lines ENABLE TRIGGER settlement_lines_no_truncate;
    ALTER TABLE settlement_statements ENABLE TRIGGER settlement_statements_no_truncate;
    ALTER TABLE invoice_lines ENABLE TRIGGER invoice_lines_no_truncate;
    ALTER TABLE session_invoices ENABLE TRIGGER session_invoices_no_truncate;
    ALTER TABLE tariff_periods ENABLE TRIGGER tariff_periods_no_truncate;
    ALTER TABLE tariffs ENABLE TRIGGER tariffs_no_truncate;
    ALTER TABLE partner_share_rates ENABLE TRIGGER partner_share_rates_no_truncate;
    ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_truncate;
    COMMIT;
  `);
}

async function rollbackToMigration(version) {
  let latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
  while (latest.rows[0]?.version !== version) {
    if (!latest.rows[0]) throw new Error(`Migration ${version} không nằm trong schema_migrations`);
    const previous = latest.rows[0].version;
    const result = run('src/db/migrate.js', ['down']);
    if (result.status !== 0) throw new Error(result.stderr || `Rollback migration ${previous} thất bại`);
    latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
    if (latest.rows[0]?.version === previous) throw new Error(`Không rollback được migration ${previous}`);
  }
}

module.exports = { BASE, env, run, query, resetSchema, truncateAll, truncateAuditLogs, rollbackToMigration };
