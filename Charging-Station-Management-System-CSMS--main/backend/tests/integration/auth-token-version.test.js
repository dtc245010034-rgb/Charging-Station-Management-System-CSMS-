const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { run, query, resetSchema, truncateAll, env } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const EMAIL = 'tv-owner@test.invalid';
const PASSWORD = 'CorrectHorse-9';
const login = () => request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
const cookieOf = (res) => res.headers['set-cookie'][0].split(';')[0];
const logout = (cookie) => request(app).post('/api/auth/logout').set('Content-Type', 'application/json').set('Cookie', cookie ?? '');
const me = (cookie) => request(app).get('/api/auth/me').set('Cookie', cookie);

describe('#25: đăng xuất thu hồi token (users.token_version)', () => {
  let user;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  beforeEach(async () => {
    await truncateAll();
    user = await createUser(EMAIL, 'STATION_OWNER', PASSWORD);
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('cookie cũ bị chép lại vẫn bị 401 sau khi đăng xuất', async () => {
    const cookie = cookieOf(await login());
    assert.equal((await me(cookie)).status, 200);
    assert.equal((await logout(cookie)).status, 200);
    assert.equal((await me(cookie)).status, 401);
    assert.equal((await request(app).get('/api/stations').set('Cookie', cookie)).status, 401);
  });

  it('đăng xuất thu hồi cả phiên khác của cùng tài khoản; đăng nhập lại thì dùng được', async () => {
    const first = cookieOf(await login());
    const second = cookieOf(await login());
    await logout(first);
    assert.equal((await me(second)).status, 401);
    assert.equal((await me(cookieOf(await login()))).status, 200);
  });

  it('token cấp trước khi có token_version (không có `tv`) vẫn dùng được, rồi bị thu hồi khi đăng xuất', async () => {
    const legacy = `token=${jwt.sign({ id: Number(user.id), email: EMAIL, role: 'STATION_OWNER', roles: ['STATION_OWNER'] }, env().JWT_SECRET, { expiresIn: 600 })}`;
    assert.equal((await me(legacy)).status, 200);
    assert.equal((await logout(legacy)).status, 200);
    assert.equal((await me(legacy)).status, 401);
  });

  it('tài khoản đã bị xoá thì token cũ bị 401', async () => {
    const cookie = cookieOf(await login());
    await query('DELETE FROM user_roles WHERE user_id = $1', [user.id]);
    await query('DELETE FROM users WHERE id = $1', [user.id]);
    assert.equal((await me(cookie)).status, 401);
  });

  it('đăng xuất không cần phiên hợp lệ: không cookie hoặc cookie rác vẫn 200 và xoá cookie, không đụng token_version', async () => {
    const before = (await query('SELECT token_version FROM users WHERE id = $1', [user.id])).rows[0].token_version;
    for (const cookie of [undefined, 'token=khong-phai-jwt']) {
      const response = await logout(cookie);
      assert.equal(response.status, 200);
      assert.match(response.headers['set-cookie'][0], /^token=;/);
    }
    assert.equal((await query('SELECT token_version FROM users WHERE id = $1', [user.id])).rows[0].token_version, before);
  });

  it('token cũ (đã bị thu hồi) không thể dùng để đăng xuất phiên mới', async () => {
    const stale = cookieOf(await login());
    await logout(stale);
    const fresh = cookieOf(await login());
    await logout(stale);
    assert.equal((await me(fresh)).status, 200);
  });
});
