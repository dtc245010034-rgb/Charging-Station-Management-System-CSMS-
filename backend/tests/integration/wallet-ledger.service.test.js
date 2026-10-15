process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
process.env.JWT_SECRET ||= 'z'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { withTransaction } = require('../../src/db/tx');
const { WalletLockedError, InsufficientBalanceError, postEntry } = require('../../src/modules/wallet/ledger.service');
const { query, resetSchema, run } = require('../helpers/db');

async function createDriver() {
  const user = await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Test Driver', `wallet-ledger-${Date.now()}-${Math.random()}@test.invalid`, 'hash']
  );
  return user.rows[0].id;
}

async function createSession(driverId) {
  const owner = await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Test Owner', `wallet-session-owner-${Date.now()}-${Math.random()}@test.invalid`, 'hash']
  );
  const station = await query(
    `INSERT INTO stations (name, address, latitude, longitude, owner_id)
     VALUES ('Test station', 'Test address', 21, 105, $1) RETURNING id`,
    [owner.rows[0].id]
  );
  const point = await query(
    'INSERT INTO charge_points (station_id, code) VALUES ($1, $2) RETURNING id',
    [station.rows[0].id, `WALLET-S-${Date.now()}-${Math.random()}`]
  );
  const connector = await query(
    'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
    [point.rows[0].id]
  );
  const session = await query(
    `INSERT INTO charging_sessions (
       charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
       meter_start, started_at, status
     ) VALUES ($1, $2, 1, $3, 'TAG', 0, CURRENT_TIMESTAMP, 'COMPLETED')
     RETURNING id`,
    [point.rows[0].id, connector.rows[0].id, driverId]
  );
  return session.rows[0].id;
}

async function post(input) {
  return withTransaction((client) => postEntry(client, input));
}

describe('S-41 postEntry ledger service', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
  });
  after(resetSchema);

  it('AC S-41: cộng và trừ số dư bằng các dòng ledger signed', async () => {
    const driverId = await createDriver();
    const credit = await post({ driverId, entryType: 'TOPUP_MANUAL', amountDong: 500000, receiptCode: 'PT-TEST-01' });
    const debit = await post({ driverId, entryType: 'ADJUSTMENT', amountDong: -40000, reason: 'Test debit' });

    assert.equal(credit.wallet.balance_dong, '500000');
    assert.equal(debit.wallet.balance_dong, '460000');
    assert.equal(debit.entry.amount_dong, '-40000');
    const ledger = await query('SELECT amount_dong, balance_after_dong FROM wallet_ledger WHERE driver_id = $1 ORDER BY id', [driverId]);
    assert.deepStrictEqual(ledger.rows, [
      { amount_dong: '500000', balance_after_dong: '500000' },
      { amount_dong: '-40000', balance_after_dong: '460000' },
    ]);
  });

  it('AC S-37: SESSION_DEBIT được phép đưa ví xuống âm', async () => {
    const driverId = await createDriver();
    const sessionId = await createSession(driverId);
    const entry = await post({
      driverId,
      entryType: 'SESSION_DEBIT',
      amountDong: -40000,
      sessionId,
      allowLocked: true,
    });

    assert.equal(entry.wallet.balance_dong, '-40000');
    assert.equal(entry.entry.balance_after_dong, '-40000');
  });

  it('AC S-41: bút toán SESSION_DEBIT trùng khóa idempotency không đổi số dư lần hai', async () => {
    const driverId = await createDriver();
    const sessionId = await createSession(driverId);
    const first = await post({ driverId, entryType: 'SESSION_DEBIT', amountDong: -40000, sessionId, allowLocked: true });
    const duplicate = await post({ driverId, entryType: 'SESSION_DEBIT', amountDong: -40000, sessionId, allowLocked: true });
    const count = await query('SELECT COUNT(*)::int AS count FROM wallet_ledger WHERE session_id = $1', [sessionId]);
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverId]);

    assert.equal(first.duplicated, false);
    assert.deepStrictEqual(duplicate, { duplicated: true });
    assert.equal(count.rows[0].count, 1);
    assert.equal(wallet.rows[0].balance_dong, '-40000');
  });

  it('AC S-41: điều chỉnh làm âm bị từ chối với InsufficientBalanceError', async () => {
    const driverId = await createDriver();
    await assert.rejects(
      post({ driverId, entryType: 'ADJUSTMENT', amountDong: -1, reason: 'Test debit' }),
      (error) => error instanceof InsufficientBalanceError && error.status === 409 && error.code === 'INSUFFICIENT_BALANCE'
    );
    assert.equal((await query('SELECT 1 FROM wallet_ledger WHERE driver_id = $1', [driverId])).rowCount, 0);
  });

  it('AC S-41: ví khóa từ chối ghi thường nhưng cho phép allowLocked', async () => {
    const driverId = await createDriver();
    await query('INSERT INTO wallets (driver_id, locked, locked_reason) VALUES ($1, TRUE, $2)', [driverId, 'LEDGER_MISMATCH']);

    await assert.rejects(
      post({ driverId, entryType: 'TOPUP_GATEWAY', amountDong: 1000, topupId: 1 }),
      (error) => error instanceof WalletLockedError && error.status === 409 && error.code === 'WALLET_LOCKED'
    );
    const allowed = await post({ driverId, entryType: 'TOPUP_GATEWAY', amountDong: 1000, topupId: 1, allowLocked: true });
    assert.equal(allowed.wallet.balance_dong, '1000');
    assert.equal(allowed.wallet.locked, true);
  });
});
