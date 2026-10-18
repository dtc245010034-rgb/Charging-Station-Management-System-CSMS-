const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../helpers/app');
const { resetSchema, query, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-54: Partner share rates API & Permissions (K09)', () => {
  let admin;
  let accountant;
  let ownerA;
  let ownerB;
  let driver;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);

    admin = await createUser('admin-rates@test.invalid', 'ADMIN');
    accountant = await createUser('accountant-rates@test.invalid', 'ACCOUNTANT');
    ownerA = await createUser('owner-a-rates@test.invalid', 'STATION_OWNER');
    ownerB = await createUser('owner-b-rates@test.invalid', 'STATION_OWNER');
    driver = await createUser('driver-rates@test.invalid', 'DRIVER');

    // Gán trạm cho ownerA và ownerB để họ thực sự sở hữu trạm
    await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Station A', 'Addr A', $1)",
      [ownerA.id]
    );
    await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Station B', 'Addr B', $1)",
      [ownerB.id]
    );

    // Tạo một kỳ đã chốt (tháng 2026-08) để kiểm tra RATE_IN_CLOSED_PERIOD
    await query(
      "INSERT INTO accounting_periods (month, status, closed_at) VALUES ('2026-08-01', 'CLOSED', CURRENT_TIMESTAMP)"
    );
  });

  after(resetSchema);

  it('Admin và Accountant khai được tỉ lệ chia, tạo audit PARTNER_RATE_CREATED (không có email/tên)', async () => {
    const res = await request(app)
      .post(`/api/partners/${ownerA.id}/share-rates`)
      .set('Cookie', admin.cookie)
      .send({
        shareBp: 7000,
        includeIdle: true,
        effectiveFrom: '2026-01-01',
        note: 'Hợp đồng ban đầu',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.share_bp, 7000);
    assert.equal(res.body.include_idle, true);
    assert.equal(res.body.effective_from, '2026-01-01');

    // Kiểm tra audit_logs
    const auditRes = await query(
      "SELECT action, entity, entity_id, metadata FROM audit_logs WHERE action = 'PARTNER_RATE_CREATED' ORDER BY id DESC LIMIT 1"
    );
    assert.equal(auditRes.rowCount, 1);
    const auditLog = auditRes.rows[0];
    assert.equal(auditLog.action, 'PARTNER_RATE_CREATED');
    assert.equal(Number(auditLog.metadata.owner_id), Number(ownerA.id));
    assert.equal(Number(auditLog.metadata.share_bp), 7000);
    assert.equal(auditLog.metadata.include_idle, true);
    assert.equal(auditLog.metadata.effective_from, '2026-01-01');
    assert.equal(auditLog.metadata.email, undefined);
    assert.equal(auditLog.metadata.name, undefined);

    // Accountant thêm tỉ lệ thứ 2
    const res2 = await request(app)
      .post(`/api/partners/${ownerA.id}/share-rates`)
      .set('Cookie', accountant.cookie)
      .send({
        shareBp: 7500,
        includeIdle: true,
        effectiveFrom: '2026-10-15',
        note: 'Đổi tỉ lệ giữa kỳ',
      });
    assert.equal(res2.status, 201);
    assert.equal(res2.body.share_bp, 7500);
  });

  it('Chủ trạm hoặc tài xế gọi POST tạo tỉ lệ => 403 + ACCESS_DENIED', async () => {
    const res = await request(app)
      .post(`/api/partners/${ownerA.id}/share-rates`)
      .set('Cookie', ownerA.cookie)
      .send({
        shareBp: 8000,
        effectiveFrom: '2026-11-01',
      });
    assert.equal(res.status, 403);

    const resDriver = await request(app)
      .post(`/api/partners/${ownerA.id}/share-rates`)
      .set('Cookie', driver.cookie)
      .send({
        shareBp: 8000,
        effectiveFrom: '2026-11-01',
      });
    assert.equal(resDriver.status, 403);
  });

  it('share_bp ngoài khoảng 0–10000 trả về 400', async () => {
    const resNeg = await request(app)
      .post(`/api/partners/${ownerA.id}/share-rates`)
      .set('Cookie', admin.cookie)
      .send({ shareBp: -1, effectiveFrom: '2026-11-01' });
    assert.equal(resNeg.status, 400);

    const resHigh = await request(app)
      .post(`/api/partners/${ownerA.id}/share-rates`)
      .set('Cookie', admin.cookie)
      .send({ shareBp: 10001, effectiveFrom: '2026-11-01' });
    assert.equal(resHigh.status, 400);
  });

  it('effective_from trùng hàng có sẵn => 409', async () => {
    const res = await request(app)
      .post(`/api/partners/${ownerA.id}/share-rates`)
      .set('Cookie', admin.cookie)
      .send({ shareBp: 7200, effectiveFrom: '2026-01-01' });
    assert.equal(res.status, 409);
  });

  it('effective_from nằm trong tháng đã chốt => 409 RATE_IN_CLOSED_PERIOD', async () => {
    const res = await request(app)
      .post(`/api/partners/${ownerA.id}/share-rates`)
      .set('Cookie', admin.cookie)
      .send({ shareBp: 7000, effectiveFrom: '2026-08-15' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, 'RATE_IN_CLOSED_PERIOD');
  });

  it('GET /api/partners: Admin thấy tất cả chủ trạm, Owner chỉ thấy chính mình', async () => {
    const resAdmin = await request(app)
      .get('/api/partners')
      .set('Cookie', admin.cookie);
    assert.equal(resAdmin.status, 200);
    assert.ok(Array.isArray(resAdmin.body.partners));
    assert.ok(resAdmin.body.partners.length >= 2);

    const pA = resAdmin.body.partners.find((p) => Number(p.id) === Number(ownerA.id));
    assert.ok(pA);
    assert.ok(pA.current_rate);

    const resOwnerA = await request(app)
      .get('/api/partners')
      .set('Cookie', ownerA.cookie);
    assert.equal(resOwnerA.status, 200);
    assert.equal(resOwnerA.body.partners.length, 1);
    assert.equal(Number(resOwnerA.body.partners[0].id), Number(ownerA.id));
  });

  it('GET /api/partners/:ownerId/share-rates: Chủ trạm A chỉ thấy của A, gọi của B => 403', async () => {
    const resOwn = await request(app)
      .get(`/api/partners/${ownerA.id}/share-rates`)
      .set('Cookie', ownerA.cookie);
    assert.equal(resOwn.status, 200);
    assert.ok(Array.isArray(resOwn.body.share_rates));
    assert.equal(resOwn.body.share_rates.length, 2);

    const resOther = await request(app)
      .get(`/api/partners/${ownerB.id}/share-rates`)
      .set('Cookie', ownerA.cookie);
    assert.equal(resOther.status, 403);
  });
});
