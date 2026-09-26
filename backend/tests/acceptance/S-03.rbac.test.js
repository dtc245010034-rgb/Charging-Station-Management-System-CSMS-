const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const denials = async () => (await query("SELECT * FROM audit_logs WHERE action = 'ACCESS_DENIED' ORDER BY id")).rows;

describe('S-03 lọc sở hữu ở tầng truy vấn (2 chủ trạm A/B)', () => {
  const u = {};
  let stationA;
  let stationB;
  let cpA;
  let cpB;

  const as = (user) => ({
    get: (url) => request(app).get(url).set('Cookie', user.cookie),
    post: (url, body) => request(app).post(url).set('Cookie', user.cookie).send(body),
    patch: (url, body) => request(app).patch(url).set('Cookie', user.cookie).send(body),
  });

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    for (const [key, role] of [['A', 'STATION_OWNER'], ['B', 'STATION_OWNER'], ['admin', 'ADMIN'], ['op', 'OPERATOR'], ['driver', 'DRIVER']]) {
      u[key] = await createUser(`${key.toLowerCase()}@example.com`, role, 'password123');
    }
    stationA = (await as(u.A).post('/api/stations', { name: 'Trạm A', address: 'Hà Nội' })).body;
    stationB = (await as(u.B).post('/api/stations', { name: 'Trạm B', address: 'Đà Nẵng' })).body;
    cpA = (await as(u.A).post(`/api/stations/${stationA.id}/charge-points`, { code: 'CP-A' })).body;
    cpB = (await as(u.B).post(`/api/stations/${stationB.id}/charge-points`, { code: 'CP-B' })).body;
  });
  beforeEach(async () => { await query('TRUNCATE audit_logs RESTART IDENTITY'); });
  after(async () => { await resetSchema(); await closePool(); });

  it('S-03 AC1: chủ trạm A chỉ thấy trạm và trụ của mình', async () => {
    const stations = await as(u.A).get('/api/stations');
    assert.deepStrictEqual(stations.body.map((s) => s.name), ['Trạm A']);
    const points = await as(u.A).get('/api/charge-points');
    assert.deepStrictEqual(points.body.map((c) => c.code), ['CP-A']);
    assert.strictEqual((await as(u.A).get(`/api/stations/${stationA.id}`)).status, 200);
    assert.strictEqual((await as(u.A).get(`/api/charge-points/${cpA.id}`)).status, 200);
    assert.strictEqual((await denials()).length, 0);
  });

  it('S-03 AC2: A gọi thẳng API trạm của B → 403 và đúng 1 dòng audit', async () => {
    const res = await as(u.A).get(`/api/stations/${stationB.id}`);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    const rows = await denials();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(String(rows[0].user_id), String(u.A.id));
    assert.strictEqual(rows[0].entity, 'station');
    assert.strictEqual(String(rows[0].entity_id), String(stationB.id));
    assert.ok(rows[0].ip, 'phải ghi ip');
  });

  it('S-03 AC2: mọi cách chạm vào tài nguyên của B (đọc, sửa, tạo trụ) → 403 + audit, dữ liệu B không đổi', async () => {
    const attempts = [
      [`/api/stations/${stationB.id}`, () => as(u.A).patch(`/api/stations/${stationB.id}`, { name: 'Bị chiếm' }), 'station'],
      [`/api/charge-points/${cpB.id}`, () => as(u.A).get(`/api/charge-points/${cpB.id}`), 'charge_point'],
      [`/api/charge-points/${cpB.id}`, () => as(u.A).patch(`/api/charge-points/${cpB.id}`, { model: 'X' }), 'charge_point'],
      [`/api/stations/${stationB.id}`, () => as(u.A).post(`/api/stations/${stationB.id}/charge-points`, { code: 'CP-HACK' }), 'station'],
    ];
    for (const [, call] of attempts) assert.strictEqual((await call()).status, 403);
    const rows = await denials();
    assert.strictEqual(rows.length, attempts.length);
    assert.deepStrictEqual(rows.map((r) => r.entity), attempts.map((a) => a[2]));
    assert.strictEqual((await query('SELECT name FROM stations WHERE id = $1', [stationB.id])).rows[0].name, 'Trạm B');
    assert.strictEqual((await query("SELECT 1 FROM charge_points WHERE code = 'CP-HACK'")).rowCount, 0);
    assert.strictEqual((await query('SELECT model FROM charge_points WHERE id = $1', [cpB.id])).rows[0].model, null);
  });

  it('S-03: id không tồn tại → 404 và không ghi audit', async () => {
    for (const url of ['/api/stations/999999', '/api/charge-points/999999']) {
      assert.strictEqual((await as(u.A).get(url)).status, 404, url);
    }
    assert.strictEqual((await as(u.A).post('/api/stations/999999/charge-points', { code: 'CP-X' })).status, 404);
    assert.strictEqual((await denials()).length, 0);
  });

  it('S-03: ADMIN và OPERATOR thấy tất cả, không bị ghi audit', async () => {
    for (const who of [u.admin, u.op]) {
      assert.strictEqual((await as(who).get('/api/stations')).body.length, 2);
      assert.strictEqual((await as(who).get('/api/charge-points')).body.length, 2);
      assert.strictEqual((await as(who).get(`/api/stations/${stationB.id}`)).status, 200);
    }
    assert.strictEqual((await as(u.admin).patch(`/api/stations/${stationB.id}`, { status: 'MAINTENANCE' })).status, 200);
    assert.strictEqual((await denials()).length, 0);
  });

  it('S-03 AC4: tài xế gọi API vận hành → 403 (quyền theo vai trò, không phải audit sở hữu)', async () => {
    assert.strictEqual((await as(u.driver).get('/api/stations')).status, 403);
    assert.strictEqual((await as(u.driver).get(`/api/stations/${stationA.id}`)).status, 403);
  });

  it('S-03: owner_id lấy từ phiên, bỏ qua owner_id trong body', async () => {
    const res = await as(u.A).post('/api/stations', { name: 'Trạm A2', address: 'HN', owner_id: u.B.id });
    assert.strictEqual(res.status, 201);
    const row = (await query('SELECT owner_id FROM stations WHERE id = $1', [res.body.id])).rows[0];
    assert.strictEqual(String(row.owner_id), String(u.A.id));
    assert.deepStrictEqual((await as(u.B).get('/api/stations')).body.map((s) => s.name), ['Trạm B']);
  });

  it('S-03: chi tiết trạm của A chỉ liệt kê trụ của A', async () => {
    const res = await as(u.A).get(`/api/stations/${stationA.id}`);
    assert.deepStrictEqual(res.body.charge_points.map((c) => c.code), ['CP-A']);
  });

  it('S-03 NFR: audit CREATE/UPDATE chỉ lưu tên trường, không lưu giá trị', async () => {
    const st = await as(u.A).post('/api/stations', { name: 'GiaTriBiMat-Ten', address: 'GiaTriBiMat-DiaChi' });
    await as(u.A).patch(`/api/stations/${st.body.id}`, { name: 'GiaTriBiMat-TenMoi' });
    const cp = await as(u.A).post(`/api/stations/${st.body.id}/charge-points`, { code: 'GiaTriBiMat-Ma', vendor: 'GiaTriBiMat-Hang' });
    assert.strictEqual(cp.status, 201);
    const rows = (await query("SELECT action, entity, metadata FROM audit_logs WHERE action IN ('CREATE', 'UPDATE') ORDER BY id")).rows;
    assert.deepStrictEqual(rows.map((r) => `${r.action}:${r.entity}`), ['CREATE:station', 'UPDATE:station', 'CREATE:charge_point']);
    assert.ok(!JSON.stringify(rows).includes('GiaTriBiMat'), 'metadata không được chứa giá trị nhập vào');
    assert.deepStrictEqual(rows[1].metadata.fields, ['name']);
    assert.ok(rows[0].metadata.fields.includes('name') && rows[0].metadata.fields.includes('address'));
  });
});
