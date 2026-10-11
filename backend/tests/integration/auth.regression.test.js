const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const usersService = require('../../src/modules/users/users.service');

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
    const reg = await request(app).post('/api/auth/register').send(creds);
    assert.strictEqual(reg.status, 201);
    assert.strictEqual(reg.body.user.email, 'driver@example.com');
    assert.deepStrictEqual(reg.body.user.roles, ['DRIVER']);
    assert.match(reg.headers['set-cookie'][0], /^token=.*HttpOnly/i);
    const me = await request(app).get('/api/auth/me').set('Cookie', reg.headers['set-cookie'][0].split(';')[0]);
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.email, 'driver@example.com');
  });

  it('đăng ký: thiếu trường / có gửi role → 400, email trùng → 409', async () => {
    assert.strictEqual((await request(app).post('/api/auth/register').send({ email: 'a@b.co' })).status, 400);
    assert.strictEqual((await request(app).post('/api/auth/register').send({ ...creds, role: 'ROOT' })).status, 400);
    assert.strictEqual((await request(app).post('/api/auth/register').send(creds)).status, 201);
    assert.strictEqual((await request(app).post('/api/auth/register').send(creds)).status, 409);
  });

  it('rollback cả tài khoản và thẻ ảo nếu tạo thẻ thất bại', async () => {
    await query(`
      CREATE FUNCTION reject_virtual_tag_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.is_virtual THEN RAISE EXCEPTION 'test virtual tag failure'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER reject_virtual_tag_insert
      BEFORE INSERT ON id_tags
      FOR EACH ROW EXECUTE FUNCTION reject_virtual_tag_insert();
    `);
    try {
      await assert.rejects(
        usersService.create({
          name: 'Rollback Driver',
          email: 'rollback-driver@example.com',
          password: 'password123',
          role: 'DRIVER',
        }),
        /test virtual tag failure/
      );
      assert.equal((await query("SELECT id FROM users WHERE email = 'rollback-driver@example.com'")).rowCount, 0);
      assert.equal((await query("SELECT id FROM id_tags WHERE is_virtual")).rowCount, 0);
    } finally {
      await query('DROP TRIGGER IF EXISTS reject_virtual_tag_insert ON id_tags; DROP FUNCTION IF EXISTS reject_virtual_tag_insert();');
    }
  });

  it('không cookie/token → 401 envelope', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });
});
