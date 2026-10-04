const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

// Phải đặt trước khi nạp app để config/env đọc ngưỡng.
process.env.LOGIN_IP_MAX_FAILURES = '3';

const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

describe('S-02 NFR: đếm lần sai theo IP', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  beforeEach(async () => {
    await truncateAll();
    await createUser('victim@example.com', 'DRIVER', 'CorrectHorse-9');
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('quá ngưỡng sai từ một IP (trên nhiều email khác nhau) → IP bị khoá, kể cả email đúng mật khẩu đúng', async () => {
    for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) {
      assert.strictEqual((await login(email, 'wrong-password')).status, 401);
    }
    const res = await login('victim@example.com', 'CorrectHorse-9');
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.body.error.message, 'Đăng nhập tạm bị khoá, thử lại sau');
    assert.strictEqual((await query("SELECT count(*)::int AS n FROM login_throttle WHERE key LIKE 'ip:%'")).rows[0].n, 1);
  });

  it('đăng nhập đúng của tài khoản khác không xoá bộ đếm IP', async () => {
    await login('a@example.com', 'wrong-password');
    await login('b@example.com', 'wrong-password');
    assert.strictEqual((await login('victim@example.com', 'CorrectHorse-9')).status, 200);
    await login('c@example.com', 'wrong-password');
    assert.strictEqual((await login('victim@example.com', 'CorrectHorse-9')).status, 429);
  });

  it('mặc định bỏ qua X-Forwarded-For: giả mạo IP vẫn bị gom về một IP thật', async () => {
    for (const [i, email] of ['a@example.com', 'b@example.com', 'c@example.com'].entries()) {
      await login(email, 'wrong-password').set('X-Forwarded-For', `10.0.0.${i + 1}`);
    }
    const res = await login('victim@example.com', 'CorrectHorse-9').set('X-Forwarded-For', '203.0.113.99');
    assert.strictEqual(res.status, 429);
  });
});
