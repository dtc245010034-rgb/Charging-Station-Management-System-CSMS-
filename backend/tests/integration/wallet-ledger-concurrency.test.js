process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
process.env.JWT_SECRET ||= 'z'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { query, resetSchema, run } = require('../helpers/db');

describe('S-41 concurrent wallet ledger writes', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
  });
  after(resetSchema);

  it('AC S-41: 20 giao dịch đồng thời cùng ví không mất dòng hoặc sai balance_after', async () => {
    const driver = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      ['Test Driver', `wallet-concurrent-${Date.now()}@test.invalid`, 'hash']
    );
    const driverId = driver.rows[0].id;

    await withTransaction((client) => postEntry(client, {
      driverId,
      entryType: 'TOPUP_MANUAL',
      amountDong: 100000,
      receiptCode: 'PT-CONCURRENT-01',
    }));
    await Promise.all(Array.from({ length: 20 }, (_, index) => withTransaction((client) => postEntry(client, {
      driverId,
      entryType: 'ADJUSTMENT',
      amountDong: 1,
      reason: `Concurrent entry ${index}`,
    }))));

    const entries = await query(
      'SELECT amount_dong, balance_after_dong FROM wallet_ledger WHERE driver_id = $1 ORDER BY id',
      [driverId]
    );
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverId]);

    assert.equal(entries.rowCount, 21);
    assert.equal(entries.rows.reduce((sum, entry) => sum + BigInt(entry.amount_dong), 0n), 100020n);
    assert.equal(wallet.rows[0].balance_dong, '100020');
    assert.equal(entries.rows.at(-1).balance_after_dong, '100020');
    assert.equal(new Set(entries.rows.map((entry) => entry.balance_after_dong)).size, 21);
  });
});
