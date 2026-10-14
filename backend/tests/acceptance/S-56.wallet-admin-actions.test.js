const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');

describe('S-56 wallet adjustment and unlock APIs', { concurrency: false }, () => {
  let admin;
  let driver;

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('wallet-actions-admin@test.invalid', 'ADMIN');
    driver = await createUser('wallet-actions-driver@test.invalid', 'DRIVER');
    await withTransaction((client) => postEntry(client, {
      driverId: driver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 5000,
      receiptCode: 'WALLET-ACTIONS-SEED',
      createdBy: admin.id,
    }));
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('S-56 AC: điều chỉnh số dư ghi bút toán có dấu và audit cùng thao tác', async () => {
    const positive = await request(app)
      .post(`/api/admin/wallets/${driver.id}/adjustments`)
      .set('Cookie', admin.cookie)
      .send({ amountDong: 1000, reason: 'Đối soát tiền mặt' });
    const negative = await request(app)
      .post(`/api/admin/wallets/${driver.id}/adjustments`)
      .set('Cookie', admin.cookie)
      .send({ amountDong: -500, reason: 'Điều chỉnh sai lệch' });

    assert.equal(positive.status, 201);
    assert.equal(negative.status, 201);
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id]);
    assert.equal(wallet.rows[0].balance_dong, '5500');
    const entries = await query(
      `SELECT amount_dong, balance_after_dong, reason
       FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'ADJUSTMENT'
       ORDER BY id`,
      [driver.id]
    );
    assert.deepEqual(entries.rows, [
      { amount_dong: '1000', balance_after_dong: '6000', reason: 'Đối soát tiền mặt' },
      { amount_dong: '-500', balance_after_dong: '5500', reason: 'Điều chỉnh sai lệch' },
    ]);
    const audit = await query(
      `SELECT action, metadata
       FROM audit_logs
       WHERE entity = 'wallet' AND entity_id = $1 AND action = 'WALLET_ADJUST'
       ORDER BY id`,
      [driver.id]
    );
    assert.deepEqual(audit.rows.map((row) => row.metadata), [
      { driver_id: Number(driver.id), amount_dong: '1000', reason: 'Đối soát tiền mặt' },
      { driver_id: Number(driver.id), amount_dong: '-500', reason: 'Điều chỉnh sai lệch' },
    ]);
    const insufficient = await request(app)
      .post(`/api/admin/wallets/${driver.id}/adjustments`)
      .set('Cookie', admin.cookie)
      .send({ amountDong: -6000, reason: 'Điều chỉnh vượt số dư' });
    assert.equal(insufficient.status, 409);
    assert.equal(insufficient.body.error.code, 'INSUFFICIENT_BALANCE');
    assert.equal((await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id])).rows[0].balance_dong, '5500');
  });

  it('S-56 validation: điều chỉnh bằng 0 hoặc thiếu lý do đủ dài trả 400', async () => {
    for (const body of [
      { amountDong: 0, reason: 'Đối soát tiền mặt' },
      { amountDong: 100, reason: 'ngắn' },
      { amountDong: 100 },
    ]) {
      const response = await request(app)
        .post(`/api/admin/wallets/${driver.id}/adjustments`)
        .set('Cookie', admin.cookie)
        .send(body);
      assert.equal(response.status, 400);
    }
  });

  it('S-56 AC: chỉ mở khóa ví đang khóa, cần lý do và ghi audit', async () => {
    const unlocked = await request(app)
      .post(`/api/admin/wallets/${driver.id}/unlock`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Điều tra đã hoàn tất' });
    assert.equal(unlocked.status, 409);
    assert.equal(unlocked.body.error.code, 'WALLET_NOT_LOCKED');

    await query(
      `UPDATE wallets SET locked = TRUE, locked_reason = 'LEDGER_MISMATCH',
       locked_at = CURRENT_TIMESTAMP WHERE driver_id = $1`,
      [driver.id]
    );
    const invalidReason = await request(app)
      .post(`/api/admin/wallets/${driver.id}/unlock`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'x' });
    assert.equal(invalidReason.status, 400);

    const response = await request(app)
      .post(`/api/admin/wallets/${driver.id}/unlock`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Đã đối chiếu sổ cái' });
    assert.equal(response.status, 200);
    const wallet = await query(
      'SELECT balance_dong, locked, locked_reason, locked_at FROM wallets WHERE driver_id = $1',
      [driver.id]
    );
    assert.equal(wallet.rows[0].balance_dong, '5500');
    assert.equal(wallet.rows[0].locked, false);
    assert.equal(wallet.rows[0].locked_reason, null);
    assert.equal(wallet.rows[0].locked_at, null);
    const audit = await query(
      `SELECT user_id, action, metadata FROM audit_logs
       WHERE entity = 'wallet' AND entity_id = $1 AND action = 'WALLET_UNLOCK'`,
      [driver.id]
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].user_id, admin.id);
    assert.deepEqual(audit.rows[0].metadata, {
      driver_id: Number(driver.id),
      reason: 'Đã đối chiếu sổ cái',
    });
  });
});
