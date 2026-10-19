'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');

const PRICE_DONG = 300000;
const START_BALANCE = 1000000;
const ROUNDS = 20;

describe('S1: mua gói song song không trả 5xx (không xin kết nối thứ hai khi đang giữ khoá)', { concurrency: false }, () => {
  let planId;
  let admin;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('s1-admin@test.invalid', 'ADMIN');
    const plan = await query(
      "INSERT INTO subscription_plans (code, name, price_dong, duration_days, created_by) VALUES ('GOI_S1', 'Gói S1', $1, 30, $2) RETURNING id",
      [PRICE_DONG, admin.id]
    );
    planId = plan.rows[0].id;
    await query("INSERT INTO subscription_plan_periods (plan_id, start_minute, end_minute, price_per_kwh_dong, label) VALUES ($1, 0, 1440, 3500, 'Đồng giá')", [planId]);
  });
  after(async () => { await resetSchema(); await closePool(); });

  async function newFundedDriver(label) {
    const driver = await createUser(`s1-${label}@test.invalid`, 'DRIVER');
    await withTransaction((client) => postEntry(client, { driverId: driver.id, entryType: 'TOPUP_MANUAL', amountDong: START_BALANCE, receiptCode: `S1-${label}` }));
    return driver;
  }

  for (const parallel of [10, 30]) {
    it(`${parallel} yêu cầu song song x ${ROUNDS} lượt: đúng 1 x 201, còn lại 409 SUBSCRIPTION_ACTIVE, không có 5xx`, async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        const driver = await newFundedDriver(`p${parallel}-r${round}`);
        const results = await Promise.all(Array.from({ length: parallel }, (_, i) => request(app)
          .post('/api/me/subscriptions')
          .set('Cookie', driver.cookie)
          .set('Idempotency-Key', `S1-RACE-${parallel}-${round}-${i}-padding`)
          .send({ planId })));
        const summary = results.map((r) => `${r.status}${r.body?.error?.code ? `:${r.body.error.code}` : ''}`);
        const tag = `lượt ${round + 1}/${ROUNDS}, ${parallel} yêu cầu`;
        assert.equal(results.filter((r) => r.status >= 500).length, 0, `không được có 5xx (${tag}): ${[...new Set(summary)].join(', ')}`);
        assert.equal(results.filter((r) => r.status === 201).length, 1, `đúng 1 yêu cầu thành công (${tag}): ${[...new Set(summary)].join(', ')}`);
        assert.equal(results.filter((r) => r.status === 409 && r.body.error?.code === 'SUBSCRIPTION_ACTIVE').length, parallel - 1, tag);

        assert.equal((await query('SELECT count(*)::int n FROM subscriptions WHERE driver_id = $1', [driver.id])).rows[0].n, 1, tag);
        assert.equal((await query("SELECT count(*)::int n FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'SUBSCRIPTION_FEE'", [driver.id])).rows[0].n, 1, tag);
        assert.equal(Number((await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id])).rows[0].balance_dong), START_BALANCE - PRICE_DONG, tag);
      }
    });
  }

  it('tạo 40 gói song song (khác mã) đều 201: ghi audit trong giao dịch không xin thêm kết nối', async () => {
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => request(app)
      .post('/api/subscription-plans')
      .set('Cookie', admin.cookie)
      .set('Idempotency-Key', `S1-PLAN-${i}-padding-padding`)
      .send({ code: `GOI_S1_${i}`, name: `Gói ${i}`, priceDong: 100000, periods: [{ from: 0, to: 1440, pricePerKwh: 3000, label: 'Đồng giá' }] })));
    const summary = [...new Set(results.map((r) => `${r.status}${r.body?.error?.code ? `:${r.body.error.code}` : ''}`))].join(', ');
    assert.deepEqual(results.filter((r) => r.status !== 201).length, 0, `kết quả: ${summary}`);
    assert.equal((await query("SELECT count(*)::int n FROM subscription_plans WHERE code LIKE 'GOI_S1_%'")).rows[0].n, 40);
    assert.equal((await query("SELECT count(*)::int n FROM audit_logs WHERE action = 'SUBSCRIPTION_PLAN_CREATED'")).rows[0].n, 40);
  });

  it('Σ sổ cái = Σ số dư ví và mỗi lần mua gói chỉ ghi đúng 1 dòng audit', async () => {
    const totals = (await query('SELECT (SELECT COALESCE(sum(amount_dong), 0) FROM wallet_ledger) AS ledger, (SELECT COALESCE(sum(balance_dong), 0) FROM wallets) AS wallets')).rows[0];
    assert.equal(totals.ledger, totals.wallets);
    const subs = (await query('SELECT count(*)::int n FROM subscriptions')).rows[0].n;
    assert.equal(subs, ROUNDS * 2);
    assert.equal((await query("SELECT count(*)::int n FROM audit_logs WHERE action = 'SUBSCRIPTION_PURCHASED'")).rows[0].n, subs);
  });
});
