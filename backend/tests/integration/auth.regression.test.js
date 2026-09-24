const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');

// Giữ hành vi auth hiện tại sau refactor PR-2 (S-02/S-03 sẽ đổi ở PR sau).
describe('Hồi quy auth sau refactor', () => {
  const creds = { name: 'Tài xế', email: 'Driver@Example.com', password: 'password123' };

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  beforeEach(truncateAll);
  after(async () => { await resetSchema(); await closePool(); });

  it('đăng ký → đặt cookie httpOnly, chuẩn hoá email, /auth/me dùng được cookie', async () => {
    const reg = await request(app).post('/api/auth/register').send({ ...creds, role: 'DRIVER' });
    assert.strictEqual(reg.status, 201);
    assert.strictEqual(reg.body.user.email, 'driver@example.com');
    assert.deepStrictEqual(reg.body.user.roles, ['DRIVER']);
    assert.match(reg.headers['set-cookie'][0], /^token=.*HttpOnly/i);
    const me = await request(app).get('/api/auth/me').set('Cookie', reg.headers['set-cookie'][0].split(';')[0]);
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.email, 'driver@example.com');
  });

  it('đăng ký: thiếu trường / role sai → 400, email trùng → 409', async () => {
    assert.strictEqual((await request(app).post('/api/auth/register').send({ email: 'a@b.co' })).status, 400);
    assert.strictEqual((await request(app).post('/api/auth/register').send({ ...creds, role: 'ROOT' })).status, 400);
    assert.strictEqual((await request(app).post('/api/auth/register').send(creds)).status, 201);
    assert.strictEqual((await request(app).post('/api/auth/register').send(creds)).status, 409);
  });

  it('đăng nhập: đúng → 200; sai mật khẩu và email lạ → cùng 401 + cùng message', async () => {
    await request(app).post('/api/auth/register').send(creds);
    assert.strictEqual((await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password })).status, 200);
    const wrong = await request(app).post('/api/auth/login').send({ email: creds.email, password: 'wrong-password' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password' });
    assert.strictEqual(wrong.status, 401);
    assert.strictEqual(unknown.status, 401);
    assert.deepStrictEqual(wrong.body, unknown.body);
  });

  it('đăng nhập sai 5 lần → lần 6 bị khoá (429) kể cả nhập đúng', async () => {
    await request(app).post('/api/auth/register').send(creds);
    for (let i = 0; i < 5; i += 1) {
      assert.strictEqual((await request(app).post('/api/auth/login').send({ email: creds.email, password: 'wrong-password' })).status, 401);
    }
    const locked = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    assert.strictEqual(locked.status, 429);
    assert.strictEqual(locked.body.error.code, 'ACCOUNT_LOCKED');
  });

  it('không cookie/token → 401 envelope', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });
});
