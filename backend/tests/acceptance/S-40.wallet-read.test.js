const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');

describe('S-40 wallet read API', { concurrency: false }, () => {
  let admin;
  let accountant;
  let driver;
  let otherDriver;

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('wallet-read-admin@test.invalid', 'ADMIN');
    accountant = await createUser('wallet-read-accountant@test.invalid', 'ACCOUNTANT');
    driver = await createUser('wallet-read-driver@test.invalid', 'DRIVER');
    otherDriver = await createUser('wallet-read-other@test.invalid', 'DRIVER');

    for (let index = 1; index <= 51; index += 1) {
      await withTransaction((client) => postEntry(client, {
        driverId: driver.id,
        entryType: 'TOPUP_MANUAL',
        amountDong: 100,
        receiptCode: `WALLET-READ-${String(index).padStart(3, '0')}`,
        createdBy: admin.id,
      }));
    }
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('S-40 AC: tài xế xem ví của mình với số dư, trạng thái nợ/khóa và ngưỡng', async () => {
    const response = await request(app)
      .get(`/api/drivers/${driver.id}/wallet`)
      .set('Cookie', driver.cookie);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      balanceDong: '5100',
      inDebt: false,
      locked: false,
      minBalanceDong: '0',
    });
  });

  it('S-40 AC: tài xế xem giao dịch mới nhất trước, phân trang 50 dòng', async () => {
    const firstPage = await request(app)
      .get(`/api/drivers/${driver.id}/wallet/transactions?page=1`)
      .set('Cookie', driver.cookie);
    const secondPage = await request(app)
      .get(`/api/drivers/${driver.id}/wallet/transactions?page=2`)
      .set('Cookie', driver.cookie);

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.pageSize, 50);
    assert.equal(firstPage.body.items.length, 50);
    assert.equal(firstPage.body.hasMore, true);
    assert.equal(secondPage.status, 200);
    assert.equal(secondPage.body.items.length, 1);
    assert.equal(secondPage.body.hasMore, false);
    assert.ok(Number(firstPage.body.items[0].id) > Number(firstPage.body.items[1].id));
    assert.deepEqual(
      Object.keys(firstPage.body.items[0]).sort(),
      ['id', 'type', 'amountDong', 'balanceAfterDong', 'at', 'sessionId', 'topupId'].sort()
    );
    assert.equal(firstPage.body.items[0].type, 'TOPUP_MANUAL');
    assert.equal(firstPage.body.items[0].amountDong, '100');
    assert.equal(firstPage.body.items[0].sessionId, null);
    assert.equal(firstPage.body.items[0].topupId, null);
  });

  it('S-40 AC: tài xế xem ví người khác bị 403 và ghi ACCESS_DENIED', async () => {
    for (const path of [
      `/api/drivers/${otherDriver.id}/wallet`,
      `/api/drivers/${otherDriver.id}/wallet/transactions`,
    ]) {
      const response = await request(app).get(path).set('Cookie', driver.cookie);
      assert.equal(response.status, 403);
    }
    const denied = await query(
      `SELECT COUNT(*)::int AS count
       FROM audit_logs
       WHERE user_id = $1 AND action = 'ACCESS_DENIED' AND entity = 'wallet' AND entity_id = $2`,
      [driver.id, otherDriver.id]
    );
    assert.equal(denied.rows[0].count, 2);
  });

  it('S-40 AC: ví không tồn tại trả 404; ADMIN và ACCOUNTANT có thể xem ví tài xế', async () => {
    const missing = await request(app)
      .get('/api/drivers/999999999/wallet')
      .set('Cookie', admin.cookie);
    assert.equal(missing.status, 404);

    for (const user of [admin, accountant]) {
      const response = await request(app)
        .get(`/api/drivers/${driver.id}/wallet`)
        .set('Cookie', user.cookie);
      assert.equal(response.status, 200);
    }
  });

  it('S-40 API: page phải là số nguyên dương', async () => {
    const response = await request(app)
      .get(`/api/drivers/${driver.id}/wallet/transactions?page=0`)
      .set('Cookie', driver.cookie);

    assert.equal(response.status, 400);
  });
});
