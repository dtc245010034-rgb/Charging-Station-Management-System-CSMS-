const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { pool } = require('../../src/db/pool');
const { createUser } = require('../helpers/auth');

describe('S-01 baseline: khung dự án an toàn', () => {
  let owner;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  beforeEach(async () => {
    await truncateAll();
    owner = await createUser('owner@example.com', 'STATION_OWNER');
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('S-01 AC: GET /api/stations/abc → 400 và server vẫn sống', async () => {
    const res = await request(app).get('/api/stations/abc').set('Cookie', owner.cookie);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    assert.strictEqual(typeof res.body.error.message, 'string');
    assert.strictEqual((await request(app).get('/api/health')).status, 200);
  });

  it('S-01 AC: id không phải số nguyên dương → 400 ở mọi route có :id', async () => {
    for (const id of ['0', '-1', '1.5', '9999999999999999999', '1e3']) {
      for (const [method, url] of [
        ['get', `/api/stations/${id}`],
        ['patch', `/api/stations/${id}`],
        ['get', `/api/charge-points/${id}`],
        ['patch', `/api/charge-points/${id}`],
        ['post', `/api/stations/${id}/charge-points`],
      ]) {
        const res = await request(app)[method](url).set('Cookie', owner.cookie).send({ code: 'X', name: 'x' });
        assert.strictEqual(res.status, 400, `${method} ${url}`);
      }
    }
  });

  it('S-01 AC: GET /backend/src/app.js → 404, không lộ mã nguồn hay file cấu hình', async () => {
    for (const url of ['/backend/src/app.js', '/src/app.js', '/backend/package.json', '/package.json', '/.env', '/../package.json']) {
      assert.strictEqual((await request(app).get(url)).status, 404, url);
    }
  });

  it('S-01: chỉ phục vụ frontend/ (trang chủ và script.js vẫn tải được)', async () => {
    assert.strictEqual((await request(app).get('/index.html')).status, 200);
    assert.strictEqual((await request(app).get('/script.js')).status, 200);
    assert.strictEqual((await request(app).get('/styles.css')).status, 200);
  });

  it('S-01: trùng mã trụ → 409, không sập', async () => {
    const st = await request(app).post('/api/stations').set('Cookie', owner.cookie).send({ name: 'A', address: 'HN' });
    assert.strictEqual(st.status, 201);
    const url = `/api/stations/${st.body.id}/charge-points`;
    assert.strictEqual((await request(app).post(url).set('Cookie', owner.cookie).send({ code: 'CP-1' })).status, 201);
    const dup = await request(app).post(url).set('Cookie', owner.cookie).send({ code: 'CP-1' });
    assert.strictEqual(dup.status, 409);
    assert.strictEqual(dup.body.error.code, 'CONFLICT');
  });

  it('S-01: JSON hỏng → 400 (không phải 500), trạm không tồn tại → 404', async () => {
    const bad = await request(app).post('/api/stations').set('Cookie', owner.cookie).set('Content-Type', 'application/json').send('{"name":');
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await request(app).get('/api/stations/99999').set('Cookie', owner.cookie)).status, 404);
  });

  it('S-01: lỗi client rảnh của pool không làm sập process (có handler "error")', () => {
    assert.ok(pool.listenerCount('error') >= 1);
  });
});
