process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
process.env.JWT_SECRET ||= 'z'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { finalizeSession, registerAfterInvoice } = require('../../src/modules/billing/finalize-session');
const { createApp } = require('../../src/app');
const { query, resetSchema, run } = require('../helpers/db');
const handCases = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../fixtures/billing/hand-cases.json'),
  'utf8'
));

async function createDriver() {
  const result = await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Test Driver', `wallet-invoice-${Date.now()}-${Math.random()}@test.invalid`, 'hash']
  );
  return result.rows[0].id;
}

async function seedWallet(driverId, amountDong, receiptCode) {
  return withTransaction((client) => postEntry(client, {
    driverId,
    entryType: 'TOPUP_MANUAL',
    amountDong,
    receiptCode,
  }));
}

async function createCompletedSession(input, driverId) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Test Owner', `wallet-invoice-owner-${suffix}@test.invalid`, 'hash']
  );
  const station = await query(
    `INSERT INTO stations (name, address, latitude, longitude, owner_id, timezone)
     VALUES ($1, 'Test address', 21, 105, $2, $3) RETURNING id`,
    [`Wallet Test Station ${suffix}`, owner.rows[0].id, input.timezone]
  );
  const point = await query(
    'INSERT INTO charge_points (station_id, code) VALUES ($1, $2) RETURNING id',
    [station.rows[0].id, `WALLET-${suffix.toUpperCase()}`]
  );
  const connector = await query(
    'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
    [point.rows[0].id]
  );
  const tariff = await query(
    `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
     VALUES ($1, 1, '2026-10-01', $2, $3) RETURNING id`,
    [station.rows[0].id, input.tariff.idle.graceMin, input.tariff.idle.perMinDong]
  );
  for (const period of input.tariff.periods) {
    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, $2, $3, $4, $5)`,
      [tariff.rows[0].id, period.startMin, period.endMin, period.pricePerKwh, period.label || null]
    );
  }
  const session = await query(
    `INSERT INTO charging_sessions (
       charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
       status, meter_start, meter_stop, started_at, stopped_at
     ) VALUES ($1, $2, 1, $3, 'WALLET', 'COMPLETED', $4, $5, $6, $7)
     RETURNING id`,
    [
      point.rows[0].id,
      connector.rows[0].id,
      driverId,
      input.meterStartWh,
      input.meterStopWh,
      input.startedAt,
      input.stoppedAt,
    ]
  );
  for (const sample of input.samples) {
    await query(
      `INSERT INTO meter_values (
         session_id, reported_at, sampled_at, measurand, value, unit, raw_unit, phase, context
       ) VALUES ($1, $2, $2, 'Energy.Active.Import.Register', $3, 'Wh', 'Wh', '', 'Sample.Periodic')`,
      [session.rows[0].id, sample.at, sample.wh]
    );
  }
  if (input.idleInterval) {
    await query(
      `INSERT INTO connector_status_events (charge_point_id, connector_id, connector_no, ocpp_status, occurred_at)
       VALUES ($1, $2, 1, 'Finishing', $3), ($1, $2, 1, 'Available', $4)`,
      [point.rows[0].id, connector.rows[0].id, input.idleInterval.from, input.idleInterval.to]
    );
  }
  return session.rows[0].id;
}

function fixture(caseId) {
  return handCases.find((testCase) => testCase.id === caseId);
}

describe('S-37 wallet debit after invoice finalization', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
    createApp();
    createApp();
  });
  after(resetSchema);

  it('V01 / S-37 AC1: C01 trừ đúng 40.000 đồng trong một ledger entry', async () => {
    const driverId = await createDriver();
    await seedWallet(driverId, 500000, `PT-V01-${Date.now()}`);
    const sessionId = await createCompletedSession(fixture('C01').input, driverId);

    const result = await finalizeSession(sessionId);
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverId]);
    const debit = await query(
      `SELECT amount_dong, balance_after_dong, session_id
       FROM wallet_ledger WHERE session_id = $1 AND entry_type = 'SESSION_DEBIT'`,
      [sessionId]
    );

    assert.equal(result.status, 'FINAL');
    assert.equal(String(result.invoice.totalDong), '40000');
    assert.equal(wallet.rows[0].balance_dong, '460000');
    assert.deepStrictEqual(debit.rows, [{
      amount_dong: '-40000',
      balance_after_dong: '460000',
      session_id: sessionId,
    }]);
    assert.equal(Object.hasOwn(result.invoice, 'wallet'), false);
  });

  it('V02 / S-37 AC2: hai phiên đồng thời của cùng tài xế trừ tổng hai hóa đơn', async () => {
    const driverId = await createDriver();
    await seedWallet(driverId, 500000, `PT-V02-${Date.now()}`);
    const firstSessionId = await createCompletedSession(fixture('C14').input, driverId);
    const secondSessionId = await createCompletedSession(fixture('C01').input, driverId);

    const results = await Promise.all([
      finalizeSession(firstSessionId),
      finalizeSession(secondSessionId),
    ]);
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverId]);
    const debits = await query(
      `SELECT amount_dong FROM wallet_ledger
       WHERE entry_type = 'SESSION_DEBIT' AND session_id = ANY($1::int[])`,
      [[firstSessionId, secondSessionId]]
    );

    assert.deepStrictEqual(results.map((result) => result.status), ['FINAL', 'FINAL']);
    assert.deepStrictEqual(debits.rows.map((entry) => entry.amount_dong).sort(), ['-40000', '-78000']);
    assert.equal(wallet.rows[0].balance_dong, '382000');
  });

  it('V04 / S-37 AC1: gọi finalizeSession hai lần chỉ ghi một SESSION_DEBIT', async () => {
    const driverId = await createDriver();
    await seedWallet(driverId, 500000, `PT-V04-${Date.now()}`);
    const sessionId = await createCompletedSession(fixture('C01').input, driverId);

    const first = await finalizeSession(sessionId);
    const second = await finalizeSession(sessionId);
    const count = await query(
      `SELECT COUNT(*)::int AS count FROM wallet_ledger
       WHERE session_id = $1 AND entry_type = 'SESSION_DEBIT'`,
      [sessionId]
    );

    assert.equal(first.status, 'FINAL');
    assert.equal(second.status, 'FINAL');
    assert.equal(count.rows[0].count, 1);
  });

  it('V07 / S-37 AC1: hóa đơn 0 đồng vẫn tạo một SESSION_DEBIT 0', async () => {
    const driverId = await createDriver();
    await seedWallet(driverId, 500000, `PT-V07-${Date.now()}`);
    const sessionId = await createCompletedSession(fixture('C17').input, driverId);

    const result = await finalizeSession(sessionId);
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverId]);
    const debit = await query(
      `SELECT amount_dong, balance_after_dong
       FROM wallet_ledger WHERE session_id = $1 AND entry_type = 'SESSION_DEBIT'`,
      [sessionId]
    );

    assert.equal(result.status, 'FINAL');
    assert.equal(String(result.invoice.totalDong), '0');
    assert.equal(wallet.rows[0].balance_dong, '500000');
    assert.deepStrictEqual(debit.rows, [{ amount_dong: '0', balance_after_dong: '500000' }]);
  });

  it('S-37 AC3: chốt hóa đơn cho phép số dư âm khi ví không đủ', async () => {
    const driverId = await createDriver();
    await seedWallet(driverId, 30000, `PT-DEBT-${Date.now()}`);
    const sessionId = await createCompletedSession(fixture('C01').input, driverId);

    const result = await finalizeSession(sessionId);
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverId]);
    const debit = await query(
      `SELECT amount_dong, balance_after_dong
       FROM wallet_ledger WHERE session_id = $1 AND entry_type = 'SESSION_DEBIT'`,
      [sessionId]
    );

    assert.equal(result.status, 'FINAL');
    assert.equal(String(result.invoice.totalDong), '40000');
    assert.equal(wallet.rows[0].balance_dong, '-10000');
    assert.deepStrictEqual(debit.rows, [{ amount_dong: '-40000', balance_after_dong: '-10000' }]);
  });

  it('S-37 AC3: hook lỗi hoàn tác hóa đơn và bút toán debit', async () => {
    const driverId = await createDriver();
    await seedWallet(driverId, 30000, `PT-ROLLBACK-${Date.now()}`);
    const sessionId = await createCompletedSession(fixture('C01').input, driverId);
    const unregister = registerAfterInvoice(async () => {
      throw new Error('test hook failure');
    });
    let result;
    try {
      result = await finalizeSession(sessionId, { logError: () => {} });
    } finally {
      unregister();
    }

    assert.equal(result.status, 'ERROR');
    assert.equal((await query('SELECT 1 FROM session_invoices WHERE session_id = $1', [sessionId])).rowCount, 0);
    assert.equal((await query('SELECT 1 FROM wallet_ledger WHERE session_id = $1', [sessionId])).rowCount, 0);
    assert.equal((await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverId])).rows[0].balance_dong, '30000');
  });
});
