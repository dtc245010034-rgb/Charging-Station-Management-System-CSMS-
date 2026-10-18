const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

describe('GYM-61 / S-35: API tạo lần nạp ví và xem trạng thái', () => {
  let driverA;
  let driverB;
  let admin;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  beforeEach(async () => {
    await truncateAll();
    driverA = await createUser('driver-a@test.invalid', 'DRIVER', 'password123');
    driverB = await createUser('driver-b@test.invalid', 'DRIVER', 'password123');
    admin = await createUser('admin@test.invalid', 'ADMIN', 'password123');
  });
  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('chỉ DRIVER được gọi POST /api/me/wallet/topups; vai trò khác → 403, không cookie → 401', async () => {
    const unauth = await request(app)
      .post('/api/me/wallet/topups')
      .set('Idempotency-Key', 'test-key-001')
      .send({ amountDong: 50000 });
    assert.strictEqual(unauth.status, 401);

    const forbidden = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', admin.cookie)
      .set('Idempotency-Key', 'test-key-001')
      .send({ amountDong: 50000 });
    assert.strictEqual(forbidden.status, 403);
  });

  it('thiếu hoặc sai header Idempotency-Key → 400', async () => {
    const missing = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driverA.cookie)
      .send({ amountDong: 50000 });
    assert.strictEqual(missing.status, 400);

    const invalid = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driverA.cookie)
      .set('Idempotency-Key', 'short')
      .send({ amountDong: 50000 });
    assert.strictEqual(invalid.status, 400);
  });

  it('số tiền nạp ngoài khoảng 10.000 đến 5.000.000 đ → 400 (bảng G: G09)', async () => {
    for (const badAmount of [9999, 0, -10000, 5000001, 10000.5, 'abc']) {
      const res = await request(app)
        .post('/api/me/wallet/topups')
        .set('Cookie', driverA.cookie)
        .set('Idempotency-Key', `test-key-bad-${Date.now()}-${badAmount}`)
        .send({ amountDong: badAmount });
      assert.strictEqual(res.status, 400, `amount ${badAmount} phải bị từ chối 400`);
    }
  });

  it('số tiền hợp lệ (10.000, 200.000, 5.000.000) → 201 trả đúng cấu trúc topup và redirectUrl', async () => {
    const res = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driverA.cookie)
      .set('Idempotency-Key', 'test-key-valid-01')
      .send({ amountDong: 200000 });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.topup);
    assert.strictEqual(typeof res.body.topup.ref, 'string');
    assert.match(res.body.topup.ref, /^TU-[0-9a-fA-F]{16}$/);
    assert.strictEqual(res.body.topup.status, 'PENDING');
    assert.strictEqual(res.body.topup.amountDong, 200000);
    assert.ok(res.body.topup.expiresAt);
    assert.strictEqual(res.body.redirectUrl, `/sandbox-gateway/pay?order=${res.body.topup.ref}`);
  });

  it('gửi lại cùng Idempotency-Key → trả lại đơn nạp cũ (idempotent)', async () => {
    const key = 'test-key-idempotent-01';
    const first = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driverA.cookie)
      .set('Idempotency-Key', key)
      .send({ amountDong: 100000 });
    assert.strictEqual(first.status, 201);

    const second = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driverA.cookie)
      .set('Idempotency-Key', key)
      .send({ amountDong: 100000 });
    assert.strictEqual(second.status, 201);
    assert.strictEqual(second.body.topup.ref, first.body.topup.ref);
    assert.strictEqual(second.body.topup.amountDong, first.body.topup.amountDong);
  });

  it('chặn khi tài xế có quá 5 đơn PENDING cùng lúc', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/api/me/wallet/topups')
        .set('Cookie', driverA.cookie)
        .set('Idempotency-Key', `test-key-cap-${i}`)
        .send({ amountDong: 50000 });
      assert.strictEqual(res.status, 201);
    }

    const sixth = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driverA.cookie)
      .set('Idempotency-Key', 'test-key-cap-6')
      .send({ amountDong: 50000 });
    assert.strictEqual(sixth.status, 400);
    assert.match(sixth.body.error.message, /5/);
  });

  it('GET /api/me/wallet/topups/:ref trả thông tin đơn nạp của chính mình; của người khác hoặc không tồn tại → 404', async () => {
    const created = await request(app)
      .post('/api/me/wallet/topups')
      .set('Cookie', driverA.cookie)
      .set('Idempotency-Key', 'test-key-get-01')
      .send({ amountDong: 300000 });
    const ref = created.body.topup.ref;

    // Driver A xem của chính mình → 200
    const viewOwn = await request(app)
      .get(`/api/me/wallet/topups/${ref}`)
      .set('Cookie', driverA.cookie);
    assert.strictEqual(viewOwn.status, 200);
    assert.strictEqual(viewOwn.body.topup.ref, ref);
    assert.strictEqual(viewOwn.body.topup.status, 'PENDING');
    assert.strictEqual(viewOwn.body.topup.amountDong, 300000);

    // Driver B xem đơn của Driver A → 404 (bảo mật, không lộ sự tồn tại)
    const viewOther = await request(app)
      .get(`/api/me/wallet/topups/${ref}`)
      .set('Cookie', driverB.cookie);
    assert.strictEqual(viewOther.status, 404);

    // Đơn không tồn tại → 404
    const notFound = await request(app)
      .get('/api/me/wallet/topups/TU-0000000000000000')
      .set('Cookie', driverA.cookie);
    assert.strictEqual(notFound.status, 404);
  });
});
