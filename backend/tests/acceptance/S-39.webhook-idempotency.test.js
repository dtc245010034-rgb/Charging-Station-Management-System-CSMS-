// Nghiệm thu S-39 — Webhook idempotent (chuẩn ma trận G01–G09 theo đặc tả)
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
  it('G01: SUCCESS hợp lệ → 200 + ví được cộng đúng', async () => {
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

  // G02: 5 webhook cùng lúc → ví chỉ cộng 1 lần, các request đều trả 200
  it('G02: 5 webhook gửi đồng thời cùng lúc → chỉ cộng 1 lần, các request đều trả 200', async () => {
    const topup = await createTopup(app, driver, 'g02-concurrent-key');
    const payload = {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-G02-CONCURRENT',
      status: 'SUCCESS',
      amountDong: 200000,
    };

    const results = await Promise.all([
      sendWebhook(app, payload),
      sendWebhook(app, payload),
      sendWebhook(app, payload),
      sendWebhook(app, payload),
      sendWebhook(app, payload),
    ]);

    for (const res of results) {
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.ok, true);
    }

    const nonDupCount = results.filter((r) => !r.body.duplicate).length;
    const dupCount = results.filter((r) => r.body.duplicate).length;
    assert.strictEqual(nonDupCount, 1, 'Chỉ đúng 1 request ghi nhận thành công đầu tiên');
    assert.strictEqual(dupCount, 4, '4 request còn lại là duplicate: true');

    const row = await query('SELECT balance_dong FROM wallets WHERE driver_id=$1', [driver.id]);
    assert.strictEqual(row.rows[0].balance_dong, '200000', 'Ví chỉ được cộng chính xác 1 lần');
  });

  // G03: thiếu hoặc sai chữ ký → 401
  it('G03: thiếu hoặc sai chữ ký HMAC → 401', async () => {
    const body = JSON.stringify({
      orderRef: 'TU-0000000000000000',
      gatewayTxnId: 'GW-G03',
      status: 'SUCCESS',
      amountDong: 200000,
    });

    const noSig = await request(app).post('/api/webhooks/payment')
      .set('Content-Type', 'application/json').send(body);
    assert.strictEqual(noSig.status, 401);

    const wrongSig = await request(app).post('/api/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', 'a'.repeat(64))
      .send(body);
    assert.strictEqual(wrongSig.status, 401);
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

  // G05: cổng báo FAILED / CANCELLED → 200, ví không thay đổi
  it('G05: cổng báo FAILED hoặc CANCELLED → 200, ví không đổi', async () => {
    const topupFailed = await createTopup(app, driver, 'g05-fail-key');
    const resFail = await sendWebhook(app, {
      orderRef: topupFailed.ref,
      gatewayTxnId: 'GW-G05-FAIL',
      status: 'FAILED',
      amountDong: 200000,
    });
    assert.strictEqual(resFail.status, 200);

    const topupCancel = await createTopup(app, driver, 'g05-cancel-key');
    const resCancel = await sendWebhook(app, {
      orderRef: topupCancel.ref,
      gatewayTxnId: 'GW-G05-CANCEL',
      status: 'CANCELLED',
      amountDong: 200000,
    });
    assert.strictEqual(resCancel.status, 200);

    const row = await query('SELECT balance_dong FROM wallets WHERE driver_id=$1', [driver.id]);
    assert.strictEqual(row.rowCount, 0, 'Ví không được tạo nếu chưa từng có giao dịch thành công');
  });

  // G06: quay lại UI trước khi webhook tới (đơn vẫn PENDING, webhook tới thì SUCCESS)
  it('G06: quay lại UI trước khi webhook tới → đơn vẫn PENDING, webhook tới → SUCCESS', async () => {
    const topup = await createTopup(app, driver, 'g06-pending-key');

    // 1. Khi quay lại UI trước khi webhook tới
    const pendingCheck = await request(app)
      .get(`/api/me/wallet/topups/${topup.ref}`)
      .set('Cookie', driver.cookie);
    assert.strictEqual(pendingCheck.status, 200);
    assert.strictEqual(pendingCheck.body.topup.status, 'PENDING');

    const walletBefore = await query('SELECT balance_dong FROM wallets WHERE driver_id=$1', [driver.id]);
    assert.strictEqual(walletBefore.rowCount, 0);

    // 2. Webhook tới sau đó
    const res = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-G06-LATE',
      status: 'SUCCESS',
      amountDong: 200000,
    });
    assert.strictEqual(res.status, 200);

    // 3. UI kiểm tra lại thấy đã SUCCESS và ví được cộng
    const successCheck = await request(app)
      .get(`/api/me/wallet/topups/${topup.ref}`)
      .set('Cookie', driver.cookie);
    assert.strictEqual(successCheck.status, 200);
    assert.strictEqual(successCheck.body.topup.status, 'SUCCESS');

    const walletAfter = await query('SELECT balance_dong FROM wallets WHERE driver_id=$1', [driver.id]);
    assert.strictEqual(walletAfter.rows[0].balance_dong, '200000');
  });

  // G07: amountDong lệch so với đơn nạp → 422
  it('G07: amountDong lệch so với đơn nạp → 422', async () => {
    const topup = await createTopup(app, driver, 'g07-key-001', 200000);
    const res = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-G07',
      status: 'SUCCESS',
      amountDong: 100000, // sai lệch số tiền
    });
    assert.strictEqual(res.status, 422);
  });

  // G08: SUCCESS tới khi EXPIRED → vẫn hợp lệ (cộng ví và xóa failure_reason)
  it('G08: EXPIRED + SUCCESS hợp lệ → 200 + cộng ví + xóa failure_reason', async () => {
    const topup = await createTopup(app, driver, 'g08-key-001');
    // Giả lập đơn EXPIRED bằng cách UPDATE trực tiếp DB kèm failure_reason
    await query(
      "UPDATE wallet_topups SET status='EXPIRED', failure_reason='EXPIRED', expires_at=CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE order_ref=$1",
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

    // Kiểm tra failure_reason đã được xóa về NULL (BUG-LOGIC-03)
    const topupRow = await query('SELECT status, failure_reason FROM wallet_topups WHERE order_ref=$1', [topup.ref]);
    assert.strictEqual(topupRow.rows[0].status, 'SUCCESS');
    assert.strictEqual(topupRow.rows[0].failure_reason, null, 'failure_reason phải được xoá về NULL');
  });

  // G09: kiểm tra các giá trị biên 9.999 / 10.000 / 5.000.000 / 5.000.001
  it('G09: kiểm tra giá trị biên 9.999 / 10.000 / 5.000.000 / 5.000.001', async () => {
    // 9.999: dưới mức tối thiểu 10.000 → 400
    const under = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driver.cookie)
      .set('Idempotency-Key', 'g09-under-min')
      .send({ amountDong: 9999 });
    assert.strictEqual(under.status, 400, '9999 phải bị từ chối');

    // 10.000: cận dưới hợp lệ → 201
    const minValid = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driver.cookie)
      .set('Idempotency-Key', 'g09-exact-min')
      .send({ amountDong: 10000 });
    assert.strictEqual(minValid.status, 201, '10000 phải thành công');

    // 5.000.000: cận trên hợp lệ → 201
    const maxValid = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driver.cookie)
      .set('Idempotency-Key', 'g09-exact-max')
      .send({ amountDong: 5000000 });
    assert.strictEqual(maxValid.status, 201, '5000000 phải thành công');

    // 5.000.001: vượt trần tối đa 5.000.000 → 400
    const over = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driver.cookie)
      .set('Idempotency-Key', 'g09-over-max')
      .send({ amountDong: 5000001 });
    assert.strictEqual(over.status, 400, '5000001 phải bị từ chối');
  });

  // Ca bổ sung: SUCCESS tới sau khi đơn đã FAILED → 409
  it('Conflict: SUCCESS tới sau khi đơn đã FAILED → 409', async () => {
    const topup = await createTopup(app, driver, 'conflict-fail-key');
    const failed = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-FAIL-FIRST',
      status: 'FAILED',
      amountDong: 200000,
    });
    assert.strictEqual(failed.status, 200);

    const lateSuccess = await sendWebhook(app, {
      orderRef: topup.ref,
      gatewayTxnId: 'GW-LATE-SUCCESS',
      status: 'SUCCESS',
      amountDong: 200000,
    });
    assert.strictEqual(lateSuccess.status, 409);
  });
});
