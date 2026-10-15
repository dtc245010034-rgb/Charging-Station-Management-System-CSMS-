process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
process.env.JWT_SECRET ||= 'z'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../../src/db/pool');
const { runWalletAudit } = require('../../src/modules/wallet/wallet-audit-job');
const { query, resetSchema, run } = require('../helpers/db');

async function createDriver(emailSuffix) {
  const user = await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Test Driver', `wallet-audit-${emailSuffix}@test.invalid`, 'hash']
  );
  return user.rows[0].id;
}

describe('S-41 wallet ledger audit job', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
  });
  after(async () => {
    await resetSchema();
    await pool.end();
  });

  it('AC S-41: khóa và audit đúng ví lệch, lần chạy tiếp không tạo audit lặp', async () => {
    const mismatchedDriver = await createDriver(`bad-${Date.now()}`);
    const balancedDriver = await createDriver(`good-${Date.now()}`);
    await query(
      'INSERT INTO wallets (driver_id, balance_dong) VALUES ($1, 101), ($2, 100)',
      [mismatchedDriver, balancedDriver]
    );
    await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, period_date)
       VALUES ($1, 'TOPUP_MANUAL', 100, 100, CURRENT_DATE), ($2, 'TOPUP_MANUAL', 100, 100, CURRENT_DATE)`,
      [mismatchedDriver, balancedDriver]
    );

    const first = await runWalletAudit(pool);
    const second = await runWalletAudit(pool);
    const wallets = await query(
      'SELECT driver_id, locked, locked_reason FROM wallets WHERE driver_id = ANY($1::bigint[]) ORDER BY driver_id',
      [[mismatchedDriver, balancedDriver]]
    );
    const events = await query(
      `SELECT metadata ->> 'driver_id' AS driver_id
       FROM audit_logs
       WHERE action = 'WALLET_MISMATCH'`,
    );

    assert.deepStrictEqual(first, { checked: 2, mismatches: 1, locked: 1 });
    assert.deepStrictEqual(second, { checked: 2, mismatches: 1, locked: 0 });
    assert.deepStrictEqual(wallets.rows, [
      { driver_id: mismatchedDriver, locked: true, locked_reason: 'LEDGER_MISMATCH' },
      { driver_id: balancedDriver, locked: false, locked_reason: null },
    ]);
    assert.deepStrictEqual(events.rows, [{ driver_id: String(mismatchedDriver) }]);
  });
});
