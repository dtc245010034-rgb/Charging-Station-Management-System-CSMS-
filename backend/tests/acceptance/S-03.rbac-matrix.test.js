const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const ROLES = ['ADMIN', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT', 'DRIVER'];
const READ = ['ADMIN', 'STATION_OWNER', 'OPERATOR'];
const WRITE = ['ADMIN', 'STATION_OWNER'];

describe('S-03 ma trận quyền Sprint 1 (PO đã xác nhận) trên API thật', () => {
  const users = {};
  let stationId;
  let chargePointId;
  let seq = 0;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    for (const role of ROLES) users[role] = await createUser(`${role.toLowerCase()}@example.com`, role, 'password123');
    const st = await request(app).post('/api/stations').set('Cookie', users.ADMIN.cookie).send({ name: 'Trạm A', address: 'Hà Nội' });
    stationId = st.body.id;
    const cp = await request(app).post(`/api/stations/${stationId}/charge-points`).set('Cookie', users.ADMIN.cookie).send({ code: 'CP-SEED' });
    chargePointId = cp.body.id;
  });
  after(async () => { await resetSchema(); await closePool(); });

  const cases = [
    { name: 'GET /api/stations', allowed: READ, ok: 200, call: (r) => r.get('/api/stations') },
    { name: 'GET /api/stations/:id', allowed: READ, ok: 200, call: (r) => r.get(`/api/stations/${stationId}`) },
    { name: 'GET /api/charge-points', allowed: READ, ok: 200, call: (r) => r.get('/api/charge-points') },
    { name: 'GET /api/charge-points/:id', allowed: READ, ok: 200, call: (r) => r.get(`/api/charge-points/${chargePointId}`) },
    { name: 'POST /api/stations', allowed: WRITE, ok: 201, call: (r) => r.post('/api/stations').send({ name: `T${++seq}`, address: 'HN' }) },
    { name: 'PATCH /api/stations/:id', allowed: WRITE, ok: 200, call: (r) => r.patch(`/api/stations/${stationId}`).send({ name: 'Đổi tên' }) },
    { name: 'POST /api/stations/:id/charge-points', allowed: WRITE, ok: 201, call: (r) => r.post(`/api/stations/${stationId}/charge-points`).send({ code: `CP-${++seq}` }) },
    { name: 'PATCH /api/charge-points/:id', allowed: WRITE, ok: 200, call: (r) => r.patch(`/api/charge-points/${chargePointId}`).send({ model: 'M1' }) },
    { name: 'GET /api/roles', allowed: ['ADMIN'], ok: 200, call: (r) => r.get('/api/roles') },
  ];

  for (const c of cases) {
    it(`${c.name}: chỉ ${c.allowed.join(', ')}; vai trò khác → 403; không phiên → 401`, async () => {
      for (const role of ROLES) {
        const req = c.call(request(app)).set('Cookie', users[role].cookie);
        const res = await req;
        assert.strictEqual(res.status, c.allowed.includes(role) ? c.ok : 403, `${role} → ${res.status}`);
      }
      assert.strictEqual((await c.call(request(app))).status, 401);
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
