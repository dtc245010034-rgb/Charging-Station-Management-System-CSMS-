const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const topupRepo = require('../../src/modules/wallet/topup.repository');
const env = require('../../src/config/env');

describe('GYM-61 / S-35: Trang cổng Sandbox (/sandbox-gateway)', () => {
  let driver;
  let topup;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  beforeEach(async () => {
    await truncateAll();
    driver = await createUser('driver-sandbox@test.invalid', 'DRIVER', 'password123');
    topup = await topupRepo.createTopup({
      driverId: driver.id,
      amountDong: 200000,
      orderRef: 'TU-0123456789abcdef',
      idempotencyKey: 'idem-sandbox-01',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      gateway: 'SANDBOX',
    });
  });
  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('khi SANDBOX_GATEWAY không bật (0) → mọi route /sandbox-gateway/* trả 404', async () => {
    const originalSandbox = env.SANDBOX_GATEWAY;
    env.SANDBOX_GATEWAY = 0;
    try {
      const res = await request(app).get(`/sandbox-gateway/pay?order=${topup.order_ref}`);
      assert.strictEqual(res.status, 404);

      const actionRes = await request(app)
        .post('/sandbox-gateway/action')
        .send({ orderRef: topup.order_ref, action: 'success' });
      assert.strictEqual(actionRes.status, 404);
    } finally {
      env.SANDBOX_GATEWAY = originalSandbox;
    }
  });

  it('khi SANDBOX_GATEWAY bật (1): thiếu order → 400, không tồn tại → 404', async () => {
    const originalSandbox = env.SANDBOX_GATEWAY;
    env.SANDBOX_GATEWAY = 1;
    try {
      const missing = await request(app).get('/sandbox-gateway/pay');
      assert.strictEqual(missing.status, 400);

      const notFound = await request(app).get('/sandbox-gateway/pay?order=TU-nonexistent9999');
      assert.strictEqual(notFound.status, 404);
    } finally {
      env.SANDBOX_GATEWAY = originalSandbox;
    }
  });

  it('khi SANDBOX_GATEWAY bật (1): GET /sandbox-gateway/pay?order=... trả HTML chứa đầy đủ 7 kịch bản', async () => {
    const originalSandbox = env.SANDBOX_GATEWAY;
    env.SANDBOX_GATEWAY = 1;
    try {
      const res = await request(app).get(`/sandbox-gateway/pay?order=${topup.order_ref}`);
      assert.strictEqual(res.status, 200);
      assert.match(res.headers['content-type'], /html/);
      assert.ok(res.text.includes(topup.order_ref));
      assert.ok(res.text.includes('200.000'));

      // Kiểm tra 7 nút kịch bản theo AC
      assert.ok(res.text.includes('Thanh toán thành công'));
      assert.ok(res.text.includes('Thất bại'));
      assert.ok(res.text.includes('Huỷ') || res.text.includes('Hủy'));
      assert.ok(res.text.includes('Quay về ngay, gửi webhook sau 10 giây'));
      assert.ok(res.text.includes('Gửi webhook 5 lần'));
      assert.ok(res.text.includes('Gửi webhook sai số tiền'));
      assert.ok(res.text.includes('Gửi webhook sai chữ ký'));
    } finally {
      env.SANDBOX_GATEWAY = originalSandbox;
    }
  });

  it('khi SANDBOX_GATEWAY bật (1): POST /sandbox-gateway/action chuyển hướng về trang ví tài xế', async () => {
    const originalSandbox = env.SANDBOX_GATEWAY;
    const originalSecret = env.PAYMENT_WEBHOOK_SECRET;
    env.SANDBOX_GATEWAY = 1;
    env.PAYMENT_WEBHOOK_SECRET = 's'.repeat(32);
    try {
      const res = await request(app)
        .post('/sandbox-gateway/action')
        .type('form')
        .send({ orderRef: topup.order_ref, action: 'success' });

      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.location, `/app.html#/driver/wallet?topup=${topup.order_ref}`);
    } finally {
      env.SANDBOX_GATEWAY = originalSandbox;
      env.PAYMENT_WEBHOOK_SECRET = originalSecret;
    }
  });
});
