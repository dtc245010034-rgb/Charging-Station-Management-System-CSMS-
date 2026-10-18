'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');

describe('S-65: API gói thuê bao và mua gói qua ví (GYM-91)', { concurrency: false }, () => {
  let admin;
  let driver;
  let driverNoMoney;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    admin = await createUser('admin-sub@test.invalid', 'ADMIN');
    driver = await createUser('driver-sub@test.invalid', 'DRIVER');
    driverNoMoney = await createUser('driver-nomoney@test.invalid', 'DRIVER');

    // Nạp tiền cho driver: 300 000 đ
    await withTransaction((client) => postEntry(client, {
      driverId: driver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 300000,
      receiptCode: `TOPUP-SUB-${Date.now()}`,
    }));

    // Nạp cho driverNoMoney: 299 999 đ (thiếu 1 đồng cho gói 300 000 đ)
    await withTransaction((client) => postEntry(client, {
      driverId: driverNoMoney.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 299999,
      receiptCode: `TOPUP-NOMONEY-${Date.now()}`,
    }));
  });

  after(async () => {
    await truncateAll();
    await closePool();
  });

  let createdPlanId;

  it('G10: Driver gọi tạo gói -> 403 ACCESS_DENIED; Admin tạo gói hợp lệ -> 201', async () => {
    const validPlan = {
      code: 'GOI_THANG_3500',
      name: 'Gói Tháng 3.500',
      priceDong: 300000,
      durationDays: 30,
      idleGraceMin: 15,
      idlePerMinDong: 1000,
      periods: [
        { from: '00:00', to: '24:00', pricePerKwh: 3500, label: 'Đồng giá ngày' },
      ],
    };

    // 1. Driver tạo gói -> 403
    const driverRes = await request(app)
      .post('/api/subscription-plans')
      .set('Content-Type', 'application/json')
      .set('Cookie', driver.cookie)
      .send(validPlan);
    assert.equal(driverRes.status, 403);

    // 2. Admin tạo gói -> 201
    const adminRes = await request(app)
      .post('/api/subscription-plans')
      .set('Content-Type', 'application/json')
      .set('Cookie', admin.cookie)
      .send(validPlan);
    assert.equal(adminRes.status, 201);
    assert.equal(adminRes.body.code, 'GOI_THANG_3500');
    assert.equal(adminRes.body.periods.length, 1);
    createdPlanId = adminRes.body.id;

    // Danh sách gói đang bán
    const listRes = await request(app)
      .get('/api/subscription-plans')
      .set('Cookie', driver.cookie);
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.some((p) => p.code === 'GOI_THANG_3500'));
  });

  it('G05 & G10: Thiếu Idempotency-Key -> 400; Mua khi ví thiếu 1 đồng -> 409 INSUFFICIENT_BALANCE', async () => {
    // 1. Thiếu Idempotency-Key
    const missingKey = await request(app)
      .post('/api/me/subscriptions')
      .set('Content-Type', 'application/json')
      .set('Cookie', driverNoMoney.cookie)
      .send({ planId: createdPlanId });
    assert.equal(missingKey.status, 400);

    // 2. Ví chỉ có 299 999 đ, mua gói 300 000 đ -> 409 INSUFFICIENT_BALANCE
    const resFail = await request(app)
      .post('/api/me/subscriptions')
      .set('Content-Type', 'application/json')
      .set('Cookie', driverNoMoney.cookie)
      .set('Idempotency-Key', 'idem-nomoney-01')
      .send({ planId: createdPlanId });

    assert.equal(resFail.status, 409);
    assert.equal(resFail.body.error?.code, 'INSUFFICIENT_BALANCE');

    // Không có hàng nào trong subscriptions hay dòng trừ ví nào
    const subRows = await query('SELECT count(*)::int AS count FROM subscriptions WHERE driver_id = $1', [driverNoMoney.id]);
    assert.equal(subRows.rows[0].count, 0);

    const ledgerRows = await query(
      "SELECT count(*)::int AS count FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'SUBSCRIPTION_FEE'",
      [driverNoMoney.id]
    );
    assert.equal(ledgerRows.rows[0].count, 0);

    const walletCheck = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverNoMoney.id]);
    assert.equal(walletCheck.rows[0].balance_dong, '299999');
  });

  it('G05 & G06: Mua khi ví đủ 300 000 -> 201, số dư 0, cùng Idempotency-Key trả lại cũ, mua lại khi còn hạn -> 409 SUBSCRIPTION_ACTIVE', async () => {
    // 1. Mua thành công
    const key = `idem-driver-${Date.now()}`;
    const resSuccess = await request(app)
      .post('/api/me/subscriptions')
      .set('Content-Type', 'application/json')
      .set('Cookie', driver.cookie)
      .set('Idempotency-Key', key)
      .send({ planId: createdPlanId });

    assert.equal(resSuccess.status, 201);
    assert.equal(resSuccess.body.planCode, 'GOI_THANG_3500');

    // Ví về 0
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id]);
    assert.equal(wallet.rows[0].balance_dong, '0');

    // 1 dòng sổ cái SUBSCRIPTION_FEE
    const ledger = await query(
      "SELECT amount_dong, balance_after_dong, subscription_id FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'SUBSCRIPTION_FEE'",
      [driver.id]
    );
    assert.equal(ledger.rowCount, 1);
    assert.equal(ledger.rows[0].amount_dong, '-300000');
    assert.equal(ledger.rows[0].balance_after_dong, '0');
    assert.equal(ledger.rows[0].subscription_id, resSuccess.body.id);

    // 2. G06: Cùng Idempotency-Key -> trả lại gói cũ, không trừ thêm tiền
    const resReplay = await request(app)
      .post('/api/me/subscriptions')
      .set('Content-Type', 'application/json')
      .set('Cookie', driver.cookie)
      .set('Idempotency-Key', key)
      .send({ planId: createdPlanId });

    assert.equal(resReplay.status, 201);
    assert.equal(resReplay.body.id, resSuccess.body.id);

    const ledgerCount = await query(
      "SELECT count(*)::int AS count FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'SUBSCRIPTION_FEE'",
      [driver.id]
    );
    assert.equal(ledgerCount.rows[0].count, 1);

    // 3. Mua lại khi gói còn hạn với khoá mới -> 409 SUBSCRIPTION_ACTIVE
    const resActive = await request(app)
      .post('/api/me/subscriptions')
      .set('Content-Type', 'application/json')
      .set('Cookie', driver.cookie)
      .set('Idempotency-Key', `idem-driver-new-${Date.now()}`)
      .send({ planId: createdPlanId });

    assert.equal(resActive.status, 409);
    assert.equal(resActive.body.error?.code, 'SUBSCRIPTION_ACTIVE');

    // Danh sách gói của tôi
    const mySubs = await request(app)
      .get('/api/me/subscriptions')
      .set('Cookie', driver.cookie);
    assert.equal(mySubs.status, 200);
    assert.equal(mySubs.body.length, 1);
  });

  it('G08: Ngừng bán gói cũ -> không mua được nữa (409 PLAN_NOT_ACTIVE)', async () => {
    // Admin ngừng bán gói
    const retireRes = await request(app)
      .post(`/api/subscription-plans/${createdPlanId}/retire`)
      .set('Content-Type', 'application/json')
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(retireRes.status, 200);
    assert.equal(retireRes.body.active, false);

    // Tạo tài xế mới có đủ tiền
    const driverNew = await createUser('driver-retire-test@test.invalid', 'DRIVER');
    await withTransaction((client) => postEntry(client, {
      driverId: driverNew.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 500000,
      receiptCode: `TOPUP-RETIRE-${Date.now()}`,
    }));

    const buyRetired = await request(app)
      .post('/api/me/subscriptions')
      .set('Content-Type', 'application/json')
      .set('Cookie', driverNew.cookie)
      .set('Idempotency-Key', 'idem-buy-retired-01')
      .send({ planId: createdPlanId });

    assert.equal(buyRetired.status, 409);
    assert.equal(buyRetired.body.error?.code, 'PLAN_NOT_ACTIVE');
  });
});
