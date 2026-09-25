const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const request = require('supertest');
const { run, query, resetSchema, truncateAll, BASE } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const EMAIL = 'owner@example.com';
const PASSWORD = 'CorrectHorse-9';
const GENERIC = 'Email hoặc mật khẩu không đúng';
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const cookieOf = (res) => res.headers['set-cookie'][0].split(';')[0];
const comparable = (res) => ({
  status: res.status,
  body: res.body,
  headers: Object.fromEntries(Object.entries(res.headers).filter(([k]) => !['date', 'set-cookie'].includes(k))),
});

describe('S-02 đăng nhập và khoá tạm', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  beforeEach(async () => {
    await truncateAll();
    await createUser(EMAIL, 'STATION_OWNER', PASSWORD);
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('S-02 AC1: đúng thông tin → phiên qua cookie httpOnly, có vai trò, KHÔNG trả token trong body', async () => {
    const res = await login(EMAIL, PASSWORD);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.role, 'STATION_OWNER');
    assert.strictEqual(res.body.token, undefined);
    assert.ok(!JSON.stringify(res.body).includes('eyJ'));
    assert.match(res.headers['set-cookie'][0], /^token=[^;]+;.*HttpOnly/i);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookieOf(res));
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.email, EMAIL);
  });

  it('S-02 AC1: đăng ký cũng không trả token trong body', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'T', email: 'new@example.com', password: 'password123' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.token, undefined);
    assert.match(res.headers['set-cookie'][0], /HttpOnly/i);
  });

  it('S-02 AC2: sai mật khẩu và email không tồn tại → phản hồi giống hệt (status, body, header)', async () => {
    const wrong = await login(EMAIL, 'wrong-password');
    const unknown = await login('nobody@example.com', 'wrong-password');
    assert.strictEqual(wrong.status, 401);
    assert.strictEqual(wrong.body.error.message, GENERIC);
    assert.deepStrictEqual(comparable(unknown), comparable(wrong));
  });

  it('S-02 AC2: email không tồn tại vẫn chạy argon2.verify (thời gian phản hồi tương đương)', async () => {
    const original = argon2.verify;
    let calls = 0;
    argon2.verify = (...args) => { calls += 1; return original(...args); };
    try {
      await login('nobody@example.com', 'wrong-password');
    } finally {
      argon2.verify = original;
    }
    assert.strictEqual(calls, 1);
  });

  it('S-02 AC3: sai 5 lần → lần 6 bị khoá kể cả nhập đúng, message chung không lộ email/số lần', async () => {
    for (let i = 1; i <= 5; i += 1) assert.strictEqual((await login(EMAIL, 'wrong-password')).status, 401, `lần ${i}`);
    const locked = await login(EMAIL, PASSWORD);
    assert.strictEqual(locked.status, 429);
    assert.strictEqual(locked.body.error.message, 'Đăng nhập tạm bị khoá, thử lại sau');
    assert.ok(!JSON.stringify(locked.body).includes(EMAIL));
    assert.ok(!/\d/.test(locked.body.error.message));
  });

  it('S-02 AC3/AC2: email không tồn tại cũng bị khoá y hệt sau 5 lần sai', async () => {
    for (let i = 0; i < 5; i += 1) await login('nobody@example.com', 'wrong-password');
    const ghost = await login('nobody@example.com', 'wrong-password');
    // Cùng email thật để so sánh phản hồi bị khoá
    for (let i = 0; i < 5; i += 1) await login(EMAIL, 'wrong-password');
    const real = await login(EMAIL, PASSWORD);
    assert.strictEqual(ghost.status, 429);
    assert.deepStrictEqual(comparable(ghost), comparable(real));
  });

  it('S-02 AC3: hết 15 phút thì đăng nhập lại được; email hoa/thường và khoảng trắng dùng chung một bộ đếm', async () => {
    for (const variant of ['OWNER@example.com', ' owner@example.com ', EMAIL, 'Owner@Example.com', EMAIL]) {
      assert.strictEqual((await login(variant, 'wrong-password')).status, 401);
    }
    assert.strictEqual((await login(EMAIL, PASSWORD)).status, 429);
    await query("UPDATE login_throttle SET locked_until = now() - interval '1 second' WHERE key LIKE 'email:%'");
    assert.strictEqual((await login(EMAIL, PASSWORD)).status, 200);
  });

  it('S-02 AC3: đăng nhập đúng xoá bộ đếm sai của tài khoản', async () => {
    for (let i = 0; i < 4; i += 1) await login(EMAIL, 'wrong-password');
    assert.strictEqual((await login(EMAIL, PASSWORD)).status, 200);
    for (let i = 0; i < 4; i += 1) assert.strictEqual((await login(EMAIL, 'wrong-password')).status, 401);
    assert.strictEqual((await login(EMAIL, PASSWORD)).status, 200);
  });

  it('S-02 AC3: khoá được lưu trong DB nên còn sau khi khởi động lại (dựng lại app)', async () => {
    for (let i = 0; i < 5; i += 1) await login(EMAIL, 'wrong-password');
    for (const key of Object.keys(require.cache)) if (key.includes('/backend/src/')) delete require.cache[key];
    const fresh = require('../../src/app');
    const res = await request(fresh).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    assert.strictEqual(res.status, 429);
    await require('../../src/db/pool').pool.end();
  });

  it('S-02: bộ đếm nguyên tử — 10 lần sai song song không mất cập nhật', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => login(EMAIL, 'wrong-password')));
    const blocked = results.filter((r) => r.status === 429).length;
    const row = (await query("SELECT failed_count, locked_until FROM login_throttle WHERE key LIKE 'email:%'")).rows[0];
    assert.strictEqual(blocked + row.failed_count, 10);
    assert.ok(row.failed_count >= 5);
    assert.ok(row.locked_until);
  });

  it('S-02: bảng throttle không lưu email thô', async () => {
    await login(EMAIL, 'wrong-password');
    const keys = (await query('SELECT key FROM login_throttle')).rows.map((r) => r.key);
    assert.ok(keys.some((k) => /^email:[0-9a-f]{64}$/.test(k)));
    assert.ok(keys.every((k) => !k.includes('owner@')));
  });

  it('S-02 AC4: cookie hết hạn, token giả, không có phiên → 401', async () => {
    const user = (await query('SELECT id FROM users LIMIT 1')).rows[0];
    const secret = process.env.JWT_SECRET;
    const expired = jwt.sign({ id: user.id, roles: ['STATION_OWNER'] }, secret, { expiresIn: -10 });
    for (const cookie of [`token=${expired}`, 'token=garbage', 'token=']) {
      const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
      assert.strictEqual(res.status, 401, cookie);
      assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
    }
    assert.strictEqual((await request(app).get('/api/stations')).status, 401);
  });

  it('S-02: đăng xuất xoá cookie và phiên cũ không dùng lại được từ trình duyệt', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    assert.strictEqual((await agent.get('/api/auth/me')).status, 200);
    const out = await agent.post('/api/auth/logout').set('Content-Type', 'application/json');
    assert.match(out.headers['set-cookie'][0], /^token=;.*(Expires=Thu, 01 Jan 1970|Max-Age=0)/i);
    assert.match(out.headers['set-cookie'][0], /HttpOnly/i);
    assert.strictEqual((await agent.get('/api/auth/me')).status, 401);
  });

  it('S-02: không còn header RateLimit làm lộ trạng thái đếm', async () => {
    const res = await login(EMAIL, 'wrong-password');
    assert.ok(!Object.keys(res.headers).some((k) => k.startsWith('ratelimit')));
    assert.ok(BASE.endsWith('_test'));
  });
});
