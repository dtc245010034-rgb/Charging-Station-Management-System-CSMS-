'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');

const validPlan = (code, overrides = {}) => ({
  code,
  name: 'Gói kiểm thử',
  priceDong: 300000,
  durationDays: 30,
  idleGraceMin: 15,
  idlePerMinDong: 1000,
  periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3500, label: 'Đồng giá' }],
  ...overrides,
});
const withPeriodPrice = (value) => ({ periods: [{ from: '00:00', to: '24:00', pricePerKwh: value, label: 'Đồng giá' }] });

// [tên trường, hàm dựng phần ghi đè, cho phép null?]
const FIELDS = [
  ['priceDong', (v) => ({ priceDong: v }), false],
  ['durationDays', (v) => ({ durationDays: v }), false],
  ['idleGraceMin', (v) => ({ idleGraceMin: v }), true],
  ['idlePerMinDong', (v) => ({ idlePerMinDong: v }), true],
  ['periods[0].pricePerKwh', withPeriodPrice, false],
];
const BAD_VALUES = [1e12, '1e3', '1000', -1, 1.5, [], {}, true, 1e21];

describe('S3: kiểm tra đầu vào gói thuê bao', { concurrency: false }, () => {
  let admin;
  let counter = 0;
  const post = (body, key = `S3-PLAN-${(counter += 1)}-padding-padding`) => request(app)
    .post('/api/subscription-plans').set('Cookie', admin.cookie).set('Idempotency-Key', key).send(body);

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('s3-admin@test.invalid', 'ADMIN');
  });
  after(async () => { await resetSchema(); await closePool(); });

  for (const [field, build, nullable] of FIELDS) {
    it(`${field}: giá trị xấu (1e12, "1e3", chuỗi số, âm, thập phân, mảng, đối tượng, boolean) trả 400, không bao giờ 500`, async () => {
      const values = nullable ? BAD_VALUES : [...BAD_VALUES, null];
      for (const [i, value] of values.entries()) {
        const res = await post(validPlan(`BAD_${field.replace(/\W/g, '')}_${i}`, build(value)));
        assert.equal(res.status, 400, `${field}=${JSON.stringify(value)} -> ${res.status} ${JSON.stringify(res.body)}`);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        assert.match(res.body.error.message, /[\p{L}]/u);
        assert.ok(!/Invalid|expected|received/i.test(res.body.error.message), `thông điệp phải bằng tiếng Việt: ${res.body.error.message}`);
      }
    });
  }

  it('priceDong = 0 và vượt cận trên (100.000.000) bị từ chối với 400', async () => {
    for (const [overrides, label] of [[{ priceDong: 0 }, 'priceDong=0'], [{ priceDong: 100000001 }, 'priceDong>max'], [{ durationDays: 0 }, 'durationDays=0'], [{ durationDays: 367 }, 'durationDays>366'], [{ idleGraceMin: 1441 }, 'idleGraceMin>1440'], [{ idlePerMinDong: 100001 }, 'idlePerMinDong>max'], [withPeriodPrice(1000001), 'pricePerKwh>max']]) {
      const res = await post(validPlan(`OVER_${label.replace(/\W/g, '')}`, overrides));
      assert.equal(res.status, 400, label);
    }
  });

  it('các giá trị biên hợp lệ được nhận (2xx)', async () => {
    const cases = [
      { priceDong: 1, durationDays: 1, idleGraceMin: 0, idlePerMinDong: 0, ...withPeriodPrice(0) },
      { priceDong: 100000000, durationDays: 366, idleGraceMin: 1440, idlePerMinDong: 100000, ...withPeriodPrice(1000000) },
      { idleGraceMin: null, idlePerMinDong: null },
    ];
    for (const [i, overrides] of cases.entries()) {
      const res = await post(validPlan(`OK_EDGE_${i}`, overrides));
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }
    const omitted = validPlan('OK_OMIT');
    delete omitted.idleGraceMin; delete omitted.idlePerMinDong; delete omitted.durationDays;
    const res = await post(omitted);
    assert.equal(res.status, 201);
    assert.equal(res.body.durationDays, 30);
  });

  describe('mua gói và Idempotency-Key', () => {
    let driver;
    let planA;
    let planB;

    before(async () => {
      planA = (await post(validPlan('GOI_A'))).body.id;
      planB = (await post(validPlan('GOI_B', { priceDong: 200000 }))).body.id;
      driver = await createUser('s3-driver@test.invalid', 'DRIVER');
      await withTransaction((client) => postEntry(client, { driverId: driver.id, entryType: 'TOPUP_MANUAL', amountDong: 1000000, receiptCode: 'S3-TOPUP' }));
    });

    const buy = (planId, key) => request(app).post('/api/me/subscriptions').set('Cookie', driver.cookie).set('Idempotency-Key', key).send({ planId });

    it('planId xấu ("1e3", thập phân, âm, mảng, đối tượng, null) trả 400', async () => {
      for (const planId of ['1e3', 1.5, -1, 0, [], {}, null, true, '1.5', ' 1']) {
        const res = await buy(planId, 'S3-BUY-BAD-padding');
        assert.equal(res.status, 400, `planId=${JSON.stringify(planId)} -> ${res.status}`);
      }
    });

    it('cùng Idempotency-Key + cùng planId trả lại kết quả cũ; khác planId trả 409 CONFLICT và không đổi gì', async () => {
      const key = 'S3-BUY-KEY-0001-padding';
      const first = await buy(planA, key);
      assert.equal(first.status, 201, JSON.stringify(first.body));
      const replay = await buy(planA, key);
      assert.equal(replay.status, 201);
      assert.equal(replay.body.id, first.body.id);

      const other = await buy(planB, key);
      assert.equal(other.status, 409);
      assert.equal(other.body.error.code, 'CONFLICT');
      assert.match(other.body.error.message, /Idempotency-Key/);

      assert.equal((await query('SELECT count(*)::int n FROM subscriptions WHERE driver_id = $1', [driver.id])).rows[0].n, 1);
      assert.equal(Number((await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id])).rows[0].balance_dong), 700000);
    });

    it('planId dạng chuỗi số nguyên ("<id>") vẫn được nhận như giao diện đang gửi', async () => {
      const other = await createUser('s3-driver2@test.invalid', 'DRIVER');
      await withTransaction((client) => postEntry(client, { driverId: other.id, entryType: 'TOPUP_MANUAL', amountDong: 500000, receiptCode: 'S3-TOPUP2' }));
      const res = await request(app).post('/api/me/subscriptions').set('Cookie', other.cookie).set('Idempotency-Key', 'S3-BUY-STRING-padding').send({ planId: String(planA) });
      assert.equal(res.status, 201, JSON.stringify(res.body));
    });
  });
});
