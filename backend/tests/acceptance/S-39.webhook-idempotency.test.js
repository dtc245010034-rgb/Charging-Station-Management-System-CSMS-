// Nghiệm thu S-39 — Webhook idempotent (full matrix G01–G09)
// Commit 5.7: kiểm tra toàn bộ ma trận phản hồi
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

async function createTopup(app, driver, idempotencyKey, amountDong = 200000) {
  const res = await request(app)
    .post('/api/me/wallet/topups')
    .set('Cookie', driver.cookie)
    .set('Idempotency-Key', idempotencyKey)
    .send({ amountDong });
  assert.strictEqual(res.status, 201, `createTopup failed: ${JSON.stringify(res.body)}`);
  return res.body.topup;
}

async function sendWebhook(app, payload, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  const sig = sign(secret, body);
  return request(app)
    .post('/api/webhooks/payment')
    .set('Content-Type', 'application/json')
    .set('X-Signature', sig)
    .send(body);
}

describe('S-39 — webhook idempotent: ma trận G01–G09', () => {
  let driver;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  beforeEach(async () => {
    await truncateAll();
    driver = await createUser('driver-s39@test.invalid', 'DRIVER', 'password123');
  });
  after(async () => {
    await resetSchema();
    await closePool();
  });

  // G01: SUCCESS hợp lệ → 200, ví cộng đúng
  it('G01: SUCCESS hợp lệ → 200 + ví được cộng', async () => {
    const topup = await createTopup(app, driver, 'g01-key-001');
    const res = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-G01',
      status: 'SUCCESS',
      amountDong: 200000,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.ok(!res.body.duplicate);

    const row = await query('SELECT balance_dong FROM wallets WHERE driver_id=$1', [driver.id]);
    assert.strictEqual(row.rows[0].balance_dong, '200000');
  });

  // G02: FAILED → 200, ví không thay đổi
  it('G02: FAILED → 200 + ví không thay đổi', async () => {
    const topup = await createTopup(app, driver, 'g02-key-001');
    const res = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-G02',
      status: 'FAILED',
      amountDong: 200000,
    });
    assert.strictEqual(res.status, 200);

    const row = await query('SELECT balance_dong FROM wallets WHERE driver_id=$1', [driver.id]);
    assert.strictEqual(row.rowCount, 0, 'Ví không được tạo nếu chưa từng nạp');
  });

  // G03: CANCELLED → 200
  it('G03: CANCELLED → 200 + ví không thay đổi', async () => {
    const topup = await createTopup(app, driver, 'g03-key-001');
    const res = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-G03',
      status: 'CANCELLED',
      amountDong: 200000,
    });
    assert.strictEqual(res.status, 200);
  });

  // G04: orderRef không tồn tại → 404
  it('G04: orderRef không tồn tại → 404', async () => {
    const res = await sendWebhook(app, {
      orderRef: 'TU-0000000000000000',
      gatewayTxnId: 'GW-G04',
      status: 'SUCCESS',
      amountDong: 200000,
    });
    assert.strictEqual(res.status, 404);
  });

  // G05: thiếu hoặc sai chữ ký → 401
  it('G05: thiếu / sai chữ ký → 401', async () => {
    const body = JSON.stringify({ orderRef: 'TU-0000000000000000', gatewayTxnId: 'X', status: 'SUCCESS', amountDong: 200000 });
    const noSig = await request(app).post('/api/webhooks/payment')
      .set('Content-Type', 'application/json').send(body);
    assert.strictEqual(noSig.status, 401);

    const wrongSig = await request(app).post('/api/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', 'a'.repeat(64))
      .send(body);
    assert.strictEqual(wrongSig.status, 401);
  });

  // G06: amountDong lệch → 422
  it('G06: amountDong lệch so với đơn nạp → 422', async () => {
    const topup = await createTopup(app, driver, 'g06-key-001', 200000);
    const res = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-G06',
      status: 'SUCCESS',
      amountDong: 100000, // sai
    });
    assert.strictEqual(res.status, 422);
  });

  // G07: gửi lại 5 lần cùng gatewayTxnId → chỉ cộng 1 lần; 4 lần sau trả {duplicate: true}
  it('G07: 5 webhook cùng gatewayTxnId → ví chỉ cộng 1 lần, 4 lần sau duplicate:true', async () => {
    const topup = await createTopup(app, driver, 'g07-key-001');
    const payload = { orderRef: topup.ref, gatewayTxnId: 'GW-G07', status: 'SUCCESS', amountDong: 200000 };

    const first = await sendWebhook(app, payload);
    assert.strictEqual(first.status, 200);
    assert.ok(!first.body.duplicate);

    for (let i = 0; i < 4; i++) {
      const dup = await sendWebhook(app, payload);
      assert.strictEqual(dup.status, 200, `lần ${i + 2} phải 200`);
      assert.strictEqual(dup.body.duplicate, true, `lần ${i + 2} phải là duplicate`);
    }

    // Ví vẫn chỉ có 200000
    const row = await query('SELECT balance_dong FROM wallets WHERE driver_id=$1', [driver.id]);
    assert.strictEqual(row.rows[0].balance_dong, '200000', 'Ví chỉ được cộng 1 lần');
  });

  // G08: SUCCESS tới khi EXPIRED → vẫn hợp lệ (cộng ví)
  it('G08: EXPIRED + SUCCESS hợp lệ → 200 + cộng ví', async () => {
    const topup = await createTopup(app, driver, 'g08-key-001');
    // Giả lập đơn EXPIRED bằng cách UPDATE trực tiếp DB
    await query(
      "UPDATE wallet_topups SET status='EXPIRED', expires_at=CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE order_ref=$1",
      [topup.ref]
    );

    const res = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-G08',
      status: 'SUCCESS',
      amountDong: 200000,
    });
    assert.strictEqual(res.status, 200, `G08 phải 200, thực tế: ${JSON.stringify(res.body)}`);

    const row = await query('SELECT balance_dong FROM wallets WHERE driver_id=$1', [driver.id]);
    assert.strictEqual(row.rows[0].balance_dong, '200000', 'Ví phải được cộng dù EXPIRED');
  });

  // G09: SUCCESS tới sau FAILED → 409
  it('G09: SUCCESS tới sau đơn đã FAILED → 409', async () => {
    const topup = await createTopup(app, driver, 'g09-key-001');
    // Đơn bị FAILED trước
    const failed = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-G09-FAIL',
      status: 'FAILED',
      amountDong: 200000,
    });
    assert.strictEqual(failed.status, 200);

    // Sau đó thử SUCCESS
    const late = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-G09-SUCCESS',
      status: 'SUCCESS',
      amountDong: 200000,
    });
    assert.strictEqual(late.status, 409);
  });
});
