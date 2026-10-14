const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const auditRepository = require('../../src/modules/audit/audit.repository');

describe('S-36 manual wallet top-ups', { concurrency: false }, () => {
  let admin;
  let accountant;
  let driver;

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('wallet-topup-admin@test.invalid', 'ADMIN');
    accountant = await createUser('wallet-topup-accountant@test.invalid', 'ACCOUNTANT');
    driver = await createUser('wallet-topup-driver@test.invalid', 'DRIVER');
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('S-36 AC: admin nạp tay ghi số dư, phiếu thu, người thực hiện và audit cùng thao tác', async () => {
    const response = await request(app)
      .post(`/api/admin/wallets/${driver.id}/manual-topups`)
      .set('Cookie', admin.cookie)
      .send({ amountDong: 25000, receiptCode: 'PT-0001', note: 'Thu tiền mặt' });

    assert.equal(response.status, 201);
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id]);
    assert.equal(wallet.rows[0].balance_dong, '25000');
    const ledger = await query(
      `SELECT entry_type, amount_dong, balance_after_dong, receipt_code, reason, created_by
       FROM wallet_ledger WHERE driver_id = $1`,
      [driver.id]
    );
    assert.deepEqual(ledger.rows, [{
      entry_type: 'TOPUP_MANUAL',
      amount_dong: '25000',
      balance_after_dong: '25000',
      receipt_code: 'PT-0001',
      reason: 'Thu tiền mặt',
      created_by: admin.id,
    }]);
    const audit = await query(
      `SELECT action, user_id, metadata
       FROM audit_logs
       WHERE action = 'WALLET_TOPUP_MANUAL' AND entity = 'wallet' AND entity_id = $1`,
      [driver.id]
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].user_id, admin.id);
    assert.deepEqual(audit.rows[0].metadata, {
      driver_id: Number(driver.id),
      amount_dong: '25000',
      reason: 'Thu tiền mặt',
      receipt_code: 'PT-0001',
    });
  });

  it('V05 / S-36 AC: dùng lại PT-0001 trả 409 và không đổi số dư hoặc thêm dòng', async () => {
    const response = await request(app)
      .post(`/api/admin/wallets/${driver.id}/manual-topups`)
      .set('Cookie', admin.cookie)
      .send({ amountDong: 25000, receiptCode: 'PT-0001' });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'RECEIPT_ALREADY_USED');
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id]);
    const entries = await query(
      `SELECT COUNT(*)::int AS count FROM wallet_ledger
       WHERE driver_id = $1 AND entry_type = 'TOPUP_MANUAL' AND receipt_code = 'PT-0001'`,
      [driver.id]
    );
    assert.equal(wallet.rows[0].balance_dong, '25000');
    assert.equal(entries.rows[0].count, 1);
  });

  it('S-36 security: chỉ ADMIN được nạp tay', async () => {
    const response = await request(app)
      .post(`/api/admin/wallets/${driver.id}/manual-topups`)
      .set('Cookie', accountant.cookie)
      .send({ amountDong: 100, receiptCode: 'PT-ACCOUNTANT' });

    assert.equal(response.status, 403);
  });

  it('S-36 transaction: lỗi ghi audit hoàn tác cả dòng nạp và số dư', async () => {
    const rollbackDriver = await createUser('wallet-topup-rollback@test.invalid', 'DRIVER');
    const originalRecord = auditRepository.record;
    const originalConsoleError = console.error;
    auditRepository.record = async () => { throw new Error('test audit failure'); };
    console.error = () => {};
    try {
      const response = await request(app)
        .post(`/api/admin/wallets/${rollbackDriver.id}/manual-topups`)
        .set('Cookie', admin.cookie)
        .send({ amountDong: 1000, receiptCode: 'PT-ROLLBACK' });
      assert.equal(response.status, 500);
    } finally {
      auditRepository.record = originalRecord;
      console.error = originalConsoleError;
    }

    assert.equal((await query('SELECT 1 FROM wallets WHERE driver_id = $1', [rollbackDriver.id])).rowCount, 0);
    assert.equal((await query('SELECT 1 FROM wallet_ledger WHERE receipt_code = $1', ['PT-ROLLBACK'])).rowCount, 0);
  });

  it('S-36 validation: số tiền và mã phiếu ngoài giới hạn trả 400', async () => {
    for (const body of [
      { amountDong: 0, receiptCode: 'PT-0002' },
      { amountDong: 100000001, receiptCode: 'PT-0003' },
      { amountDong: 100, receiptCode: 'x' },
      { amountDong: 100, receiptCode: 'PT/0004' },
    ]) {
      const response = await request(app)
        .post(`/api/admin/wallets/${driver.id}/manual-topups`)
        .set('Cookie', admin.cookie)
        .send(body);
      assert.equal(response.status, 400);
    }
  });
});
