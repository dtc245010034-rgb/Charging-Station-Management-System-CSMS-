const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, idempotencyKey, postStation } = require('../helpers/station');

const ROLES = ['ADMIN', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT', 'DRIVER'];
const READ = ['ADMIN', 'STATION_OWNER', 'OPERATOR'];
const WRITE = ['ADMIN', 'STATION_OWNER'];

describe('S-03 ma trận quyền Sprint 1 (PO đã xác nhận) trên API thật', () => {
  const users = {};
  let shared;
  let own;
  let alertId;
  let seq = 0;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    for (const role of ROLES) users[role] = await createUser(`${role.toLowerCase()}@example.com`, role, 'password123');
    const st = await postStation(users.ADMIN, stationBody({ name: 'Trạm A' }));
    const cp = await request(app).post(`/api/stations/${st.body.id}/charge-points`).set('Cookie', users.ADMIN.cookie).send({ code: 'CP-SEED' });
    shared = { stationId: st.body.id, chargePointId: cp.body.id };
    // Từ PR-6 chủ trạm chỉ thao tác được trên trạm của chính mình → cho họ một bộ dữ liệu riêng.
    const ownSt = await postStation(users.STATION_OWNER, stationBody({ name: 'Trạm chủ' }));
    const ownCp = await request(app).post(`/api/stations/${ownSt.body.id}/charge-points`).set('Cookie', users.STATION_OWNER.cookie).send({ code: 'CP-OWN' });
    own = { stationId: ownSt.body.id, chargePointId: ownCp.body.id };
    const alert = await query(
      `INSERT INTO alerts (kind, severity, station_id, message, dedup_key)
       VALUES ('POWER_UNCONFIRMED', 'CRITICAL', $1, 'Test alert', 'rbac-alert') RETURNING id`,
      [shared.stationId]
    );
    alertId = alert.rows[0].id;
  });
  after(async () => { await resetSchema(); await closePool(); });

  const cases = [
    { name: 'POST /api/stations/search', allowed: ['DRIVER'], ok: 200, call: (r) => r.post('/api/stations/search').send({ lat: 10.78, lng: 106.7 }) },
    { name: 'POST /api/reservations', allowed: ['DRIVER'], ok: 400, call: (r) => r.post('/api/reservations').set('Idempotency-Key', 'rbac-reservation-key').send({}) },
    { name: 'POST /api/reservations', allowed: ['DRIVER'], ok: 400, call: (r) => r.post('/api/reservations').set('Idempotency-Key', 'rbac-reservation-key').send({}) },
    { name: 'GET /api/stations', allowed: READ, ok: 200, call: (r) => r.get('/api/stations') },
    { name: 'GET /api/stations/:id', allowed: READ, ok: 200, call: (r, t) => r.get(`/api/stations/${t.stationId}`) },
    { name: 'GET /api/charge-points', allowed: READ, ok: 200, call: (r) => r.get('/api/charge-points') },
    { name: 'GET /api/charge-points/:id', allowed: READ, ok: 200, call: (r, t) => r.get(`/api/charge-points/${t.chargePointId}`) },
    { name: 'POST /api/charge-points/:id/configuration', allowed: ['ADMIN', 'OPERATOR'], ok: 409, call: (r, t) => r.post(`/api/charge-points/${t.chargePointId}/configuration`).send({ key: 'HeartbeatInterval', value: '60' }) },
    { name: 'GET /api/charge-points/:id/configuration', allowed: ['ADMIN', 'OPERATOR'], ok: 409, call: (r, t) => r.get(`/api/charge-points/${t.chargePointId}/configuration?key=HeartbeatInterval`) },
    { name: 'POST /api/stations', allowed: WRITE, ok: 201, call: (r) => r.post('/api/stations').set('Idempotency-Key', idempotencyKey()).send(stationBody({ name: `T${++seq}` })) },
    { name: 'PATCH /api/stations/:id', allowed: WRITE, ok: 200, call: (r, t) => r.patch(`/api/stations/${t.stationId}`).send({ name: 'Đổi tên' }) },
    { name: 'POST /api/stations/:id/charge-points', allowed: WRITE, ok: 201, call: (r, t) => r.post(`/api/stations/${t.stationId}/charge-points`).send({ code: `CP-${++seq}` }) },
    { name: 'PATCH /api/charge-points/:id', allowed: WRITE, ok: 200, call: (r, t) => r.patch(`/api/charge-points/${t.chargePointId}`).send({ model: 'M1' }) },
    { name: 'GET /api/roles', allowed: ['ADMIN'], ok: 200, call: (r) => r.get('/api/roles') },
    { name: 'GET /api/stations/:id/tariffs', allowed: ['ADMIN', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT'], ok: 200, call: (r, t) => r.get(`/api/stations/${t.stationId}/tariffs`) },
    { name: 'GET /api/drivers/:driverId/wallet', allowed: ['ADMIN', 'ACCOUNTANT', 'DRIVER'], ok: 200, call: (r) => r.get(`/api/drivers/${users.DRIVER.id}/wallet`) },
    { name: 'GET /api/drivers/:driverId/wallet/transactions', allowed: ['ADMIN', 'ACCOUNTANT', 'DRIVER'], ok: 200, call: (r) => r.get(`/api/drivers/${users.DRIVER.id}/wallet/transactions`) },
    { name: 'POST /api/admin/wallets/:driverId/manual-topups', allowed: ['ADMIN'], ok: 201, call: (r) => r.post(`/api/admin/wallets/${users.DRIVER.id}/manual-topups`).send({ amountDong: 100, receiptCode: `RBAC-${++seq}` }) },
    { name: 'POST /api/stations/:id/tariffs', allowed: WRITE, ok: 201, call: (r, t) => r.post(`/api/stations/${t.stationId}/tariffs`).send({ effectiveFrom: `2099-01-${String(++seq).padStart(2, '0')}`, periods: [{ from: '00:00', to: '24:00', pricePerKwh: 4000 }] }) },
    { name: 'POST /api/me/wallet/topups', allowed: ['DRIVER'], ok: 201, call: (r) => r.post('/api/me/wallet/topups').set('Idempotency-Key', idempotencyKey()).send({ amountDong: 200000 }) },
    { name: 'GET /api/me/notifications', allowed: ['DRIVER'], ok: 200, call: (r) => r.get('/api/me/notifications') },
    { name: 'GET /api/reports/revenue', allowed: ['ADMIN', 'ACCOUNTANT', 'STATION_OWNER'], ok: 200, call: (r) => r.get('/api/reports/revenue?from=2026-01-01&to=2026-01-31') },
    { name: 'GET /api/reports/reconciliation', allowed: ['ADMIN', 'ACCOUNTANT'], ok: 200, call: (r) => r.get('/api/reports/reconciliation?from=2026-01-01&to=2026-01-31') },
    { name: 'GET /api/accounting/periods', allowed: ['ADMIN', 'ACCOUNTANT'], ok: 200, call: (r) => r.get('/api/accounting/periods') },
    { name: 'POST /api/accounting/periods/2000-01/close', allowed: ['ADMIN', 'ACCOUNTANT'], ok: 200, call: (r) => r.post('/api/accounting/periods/2000-01/close').send({}) },
    { name: 'POST /api/accounting/periods/2000-01/reopen', allowed: ['ADMIN'], ok: 200, call: (r) => r.post('/api/accounting/periods/2000-01/reopen').send({ reason: 'Mở lại để kiểm tra quyền' }) },
    { name: 'GET /api/admin/erasure-requests', allowed: ['ADMIN'], ok: 200, call: (r) => r.get('/api/admin/erasure-requests') },
    { name: 'GET /api/alerts', allowed: READ, ok: 200, call: (r) => r.get('/api/alerts?state=open') },
    { name: 'POST /api/alerts/:id/close', allowed: ['ADMIN', 'OPERATOR'], ok: 200, call: (r) => r.post(`/api/alerts/${alertId}/close`).send({}) },
  ];

  for (const c of cases) {
    it(`${c.name}: chỉ ${c.allowed.join(', ')}; vai trò khác → 403; không phiên → 401`, async () => {
      for (const role of ROLES) {
        const req = c.call(request(app), role === 'STATION_OWNER' ? own : shared).set('Cookie', users[role].cookie);
        const res = await req;
        assert.strictEqual(res.status, c.allowed.includes(role) ? c.ok : 403, `${role} → ${res.status}`);
      }
      assert.strictEqual((await c.call(request(app), shared)).status, 401);
    });
  }

  it('S-03 AC: tài xế gọi API vận hành (trạm, trụ) → 403', async () => {
    for (const url of ['/api/stations', '/api/charge-points']) {
      const res = await request(app).get(url).set('Cookie', users.DRIVER.cookie);
      assert.strictEqual(res.status, 403, url);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    }
  });

  it('POST /api/admin/users: chỉ ADMIN (vai trò khác → 403)', async () => {
    for (const role of ROLES) {
      const res = await request(app).post('/api/admin/users').set('Cookie', users[role].cookie)
        .send({ name: 'N', email: `made-by-${role.toLowerCase()}@example.com`, password: 'password123', role: 'DRIVER' });
      assert.strictEqual(res.status, role === 'ADMIN' ? 201 : 403, role);
    }
  });
});
