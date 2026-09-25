const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const ROLES = ['DRIVER', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT', 'ADMIN'];
const person = (over = {}) => ({ name: 'Nguyễn Văn A', email: 'new.user@example.com', password: 'password123', ...over });
const roleOf = async (email) => (await query('SELECT r.code FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.email = $1', [email])).rows.map((r) => r.code);
const userCount = async () => (await query('SELECT count(*)::int AS n FROM users')).rows[0].n;

describe('S-03 tạo tài khoản: đăng ký công khai và quản trị tạo', () => {
  let admin;

  before(async () => { await resetSchema(); assert.strictEqual(run('src/db/migrate.js').status, 0); });
  beforeEach(async () => {
    await truncateAll();
    admin = await createUser('admin@example.com', 'ADMIN', 'AdminPassword-1');
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('đăng ký công khai (không gửi role) → luôn là DRIVER, phiên qua cookie, không token trong body', async () => {
    const res = await request(app).post('/api/auth/register').send(person());
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(await roleOf('new.user@example.com'), ['DRIVER']);
    assert.strictEqual(res.body.token, undefined);
    assert.match(res.headers['set-cookie'][0], /HttpOnly/i);
  });

  it('đăng ký công khai gửi role (ADMIN hoặc bất kỳ) → 400 và KHÔNG tạo tài khoản', async () => {
    const before = await userCount();
    for (const role of ROLES) {
      const res = await request(app).post('/api/auth/register').send(person({ role }));
      assert.strictEqual(res.status, 400, role);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    }
    assert.strictEqual(await userCount(), before);
  });

  it('đăng ký: email sai định dạng / mật khẩu ngắn / thiếu tên → 400 kèm details theo từng trường', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: '', email: 'khong-phai-email', password: 'short' });
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(res.body.error.details.map((d) => d.field).sort(), ['email', 'name', 'password']);
  });

  it('đăng ký: email trùng (khác hoa/thường) → 409, không tạo thêm user', async () => {
    assert.strictEqual((await request(app).post('/api/auth/register').send(person())).status, 201);
    const n = await userCount();
    const dup = await request(app).post('/api/auth/register').send(person({ email: 'NEW.User@example.com' }));
    assert.strictEqual(dup.status, 409);
    assert.strictEqual(await userCount(), n);
  });

  it('POST /api/admin/users: mọi vai trò không phải ADMIN → 403, không phiên → 401, không tạo user', async () => {
    const n = await userCount();
    const attempt = { ...person({ email: 'target@example.com' }), role: 'ADMIN' };
    for (const role of ['DRIVER', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT']) {
      const actor = await createUser(`${role.toLowerCase()}@example.com`, role, 'password123');
      const res = await request(app).post('/api/admin/users').set('Cookie', actor.cookie).send(attempt);
      assert.strictEqual(res.status, 403, role);
    }
    assert.strictEqual((await request(app).post('/api/admin/users').send(attempt)).status, 401);
    assert.strictEqual(await userCount(), n + 4);
    assert.deepStrictEqual(await roleOf('target@example.com'), []);
  });

  it('ADMIN tạo được tài khoản với cả 5 vai trò; không cookie/token/hash trong phản hồi; user mới đăng nhập được', async () => {
    for (const role of ROLES) {
      const email = `${role.toLowerCase()}.new@example.com`;
      const res = await request(app).post('/api/admin/users').set('Cookie', admin.cookie).send(person({ email, password: 'Password-for-new-1', role }));
      assert.strictEqual(res.status, 201, role);
      assert.strictEqual(res.body.user.role, role);
      assert.strictEqual(res.headers['set-cookie'], undefined);
      assert.ok(!/token|password/i.test(JSON.stringify(res.body)));
      assert.deepStrictEqual(await roleOf(email), [role]);
      const login = await request(app).post('/api/auth/login').send({ email, password: 'Password-for-new-1' });
      assert.strictEqual(login.status, 200, role);
      assert.strictEqual(login.body.user.role, role);
    }
    assert.strictEqual((await request(app).get('/api/auth/me').set('Cookie', admin.cookie)).body.email, 'admin@example.com');
  });

  it('ADMIN tạo tài khoản: thiếu/sai role → 400; email trùng → 409 và không có user nửa vời', async () => {
    const n = await userCount();
    for (const role of [undefined, '', 'ROOT', 'admin']) {
      const res = await request(app).post('/api/admin/users').set('Cookie', admin.cookie).send(person({ role }));
      assert.strictEqual(res.status, 400, String(role));
    }
    assert.strictEqual(await userCount(), n);
    const ok = await request(app).post('/api/admin/users').set('Cookie', admin.cookie).send(person({ role: 'OPERATOR' }));
    assert.strictEqual(ok.status, 201);
    const dup = await request(app).post('/api/admin/users').set('Cookie', admin.cookie).send(person({ role: 'ADMIN' }));
    assert.strictEqual(dup.status, 409);
    assert.strictEqual(await userCount(), n + 1);
    assert.strictEqual((await query("SELECT count(*)::int AS n FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id WHERE ur.id IS NULL")).rows[0].n, 0);
    assert.deepStrictEqual(await roleOf('new.user@example.com'), ['OPERATOR']);
  });

  it('ADMIN tạo tài khoản → có audit CREATE user, metadata không chứa mật khẩu hay email', async () => {
    await request(app).post('/api/admin/users').set('Cookie', admin.cookie).send(person({ email: 'audited@example.com', password: 'Secret-Password-9', role: 'OPERATOR' }));
    const rows = (await query("SELECT user_id, entity, metadata FROM audit_logs WHERE action = 'CREATE' AND entity = 'user'")).rows;
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(String(rows[0].user_id), String(admin.id));
    const text = JSON.stringify(rows[0].metadata);
    assert.ok(!text.includes('Secret-Password-9') && !text.includes('audited@example.com'));
    assert.strictEqual(rows[0].metadata.role, 'OPERATOR');
  });
});
