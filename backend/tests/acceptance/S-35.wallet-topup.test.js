// Nghiệm thu S-35 — Nạp ví qua cổng sandbox + webhook idempotent
// Commit 5.6: G01 (webhook SUCCESS hợp lệ), G05 (thiếu chữ ký → 401)
// Commit 5.7 sẽ thêm: G02-G04, G06-G09
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { run, resetSchema, truncateAll, query } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const WEBHOOK_SECRET = 'test-secret-0123456789abcdef0123456789abcd';

function sign(secret, body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return crypto.createHmac('sha256', secret).update(buf).digest('hex');
}

describe('S-35 — nạp ví tài xế qua cổng sandbox', () => {
  let driver;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  beforeEach(async () => {
    await truncateAll();
    driver = await createUser('driver-s35@test.invalid', 'DRIVER', 'password123');
  });
  after(async () => {
    await resetSchema();
    await closePool();
  });

  // G01: webhook SUCCESS hợp lệ → 200 + ví cộng + trạng thái SUCCESS
  it('G01: webhook SUCCESS hợp lệ cộng ví tài xế và cập nhật trạng thái', async () => {
    // Tạo đơn nạp trước
    const createRes = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driver.cookie)
      .set('Idempotency-Key', 'g01-key-001')
      .send({ amountDong: 200000 });
    assert.strictEqual(createRes.status, 201);
    const { ref } = createRes.body.topup;

    const body = JSON.stringify({
      orderRef: ref,
      gatewayTxnId: 'GW-G01-001',
      status: 'SUCCESS',
      amountDong: 200000,
    });
    const sig = sign(WEBHOOK_SECRET, body);

    const webhookRes = await request(app)
      .post('/api/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sig)
      .send(body);
    assert.strictEqual(webhookRes.status, 200, JSON.stringify(webhookRes.body));

    // Kiểm tra trạng thái đơn
    const statusRes = await request(app)
      .get(`/api/me/wallet/topups/${ref}`)
      .set('Cookie', driver.cookie);
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.body.topup.status, 'SUCCESS');

    // Kiểm tra ví đã được cộng
    const walletRow = await query(
      'SELECT balance_dong FROM wallets WHERE driver_id = $1',
      [driver.id]
    );
    assert.ok(walletRow.rows.length > 0, 'Ví phải tồn tại');
    assert.strictEqual(
      walletRow.rows[0].balance_dong,
      '200000',
      `Số dư ví phải là 200000, thực tế: ${walletRow.rows[0].balance_dong}`
    );
  });

  // G05: thiếu hoặc sai chữ ký → 401
  it('G05: thiếu header X-Signature → 401; sai chữ ký → 401', async () => {
    const body = JSON.stringify({
      orderRef: 'TU-doesnotmatter0001',
      gatewayTxnId: 'GW-G05-001',
      status: 'SUCCESS',
      amountDong: 200000,
    });

    // Không có header
    const noSig = await request(app)
      .post('/api/webhooks/payment')
      .set('Content-Type', 'application/json')
      .send(body);
    assert.strictEqual(noSig.status, 401);

    // Sai chữ ký
    const wrongSig = await request(app)
      .post('/api/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', 'a'.repeat(64))
      .send(body);
    assert.strictEqual(wrongSig.status, 401);
  });

  // Webhook FAILED: cập nhật trạng thái đơn thành FAILED, không cộng ví
  it('webhook FAILED cập nhật đơn thành FAILED và không cộng tiền vào ví', async () => {
    const createRes = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driver.cookie)
      .set('Idempotency-Key', 'fail-test-key-001')
      .send({ amountDong: 150000 });
    assert.strictEqual(createRes.status, 201);
    const { ref } = createRes.body.topup;

    const body = JSON.stringify({
      orderRef: ref,
      gatewayTxnId: 'GW-FAIL-001',
      status: 'FAILED',
      amountDong: 150000,
    });
    const sig = sign(WEBHOOK_SECRET, body);

    const webhookRes = await request(app)
      .post('/api/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sig)
      .send(body);
    assert.strictEqual(webhookRes.status, 200);

    const statusRes = await request(app)
      .get(`/api/me/wallet/topups/${ref}`)
      .set('Cookie', driver.cookie);
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.body.topup.status, 'FAILED');

    const walletRow = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id]);
    assert.strictEqual(walletRow.rowCount, 0, 'Ví không được tạo nếu giao dịch thất bại');
  });

  // Webhook CANCELLED: cập nhật trạng thái đơn thành CANCELLED
  it('webhook CANCELLED cập nhật đơn thành CANCELLED', async () => {
    const createRes = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driver.cookie)
      .set('Idempotency-Key', 'cancel-test-key-001')
      .send({ amountDong: 100000 });
    assert.strictEqual(createRes.status, 201);
    const { ref } = createRes.body.topup;

    const body = JSON.stringify({
      orderRef: ref,
      gatewayTxnId: 'GW-CANCEL-001',
      status: 'CANCELLED',
      amountDong: 100000,
    });
    const sig = sign(WEBHOOK_SECRET, body);

    const webhookRes = await request(app)
      .post('/api/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sig)
      .send(body);
    assert.strictEqual(webhookRes.status, 200);

    const statusRes = await request(app)
      .get(`/api/me/wallet/topups/${ref}`)
      .set('Cookie', driver.cookie);
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.body.topup.status, 'CANCELLED');
  });
});
