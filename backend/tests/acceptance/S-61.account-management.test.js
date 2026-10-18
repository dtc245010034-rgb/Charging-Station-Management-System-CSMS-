const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-61 AC: admin account management', () => {
  let admin;
  let secondAdmin;
  let owner;
  let target;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.equal(migrated.status, 0, migrated.stderr);
    admin = await createUser('s61-admin@test.invalid', 'ADMIN');
    secondAdmin = await createUser('s61-admin-2@test.invalid', 'ADMIN');
    owner = await createUser('s61-owner@test.invalid', 'STATION_OWNER');
    target = await createUser('s61-target@test.invalid', 'DRIVER');
    await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('S61 station', 'Test', $1)",
      [owner.id]
    );
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('ADMIN xem danh sách, gán vai trò, disable và token đang dùng bị thu hồi ngay', async () => {
    const list = await request(app).get('/api/admin/users').set('Cookie', admin.cookie);
    assert.equal(list.status, 200);
    assert.ok(list.body.users.some((user) => String(user.id) === String(target.id)));

    const role = await request(app)
      .put(`/api/admin/users/${target.id}/role`)
      .set('Cookie', admin.cookie)
      .send({ role: 'OPERATOR' });
    assert.equal(role.status, 200);
    assert.equal(role.body.user.role, 'OPERATOR');

    const disabled = await request(app)
      .post(`/api/admin/users/${target.id}/disable`)
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(disabled.status, 200);
    assert.ok(disabled.body.user.disabled_at);
    const meRes = await request(app).get('/api/auth/me').set('Cookie', target.cookie);
    assert.equal(meRes.status, 401);
    assert.match(meRes.body.error.message, /Tài khoản đã bị khoá/);
    assert.equal((await query('SELECT token_version FROM users WHERE id = $1', [target.id])).rows[0].token_version, 2);
  });

  it('chặn tự khoá, khoá ADMIN cuối cùng và chặn đổi vai trò chủ trạm còn trạm (OWNS_STATIONS)', async () => {
    const selfDisable = await request(app)
      .post(`/api/admin/users/${admin.id}/disable`)
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(selfDisable.status, 409);
    assert.equal(selfDisable.body.error.code, 'CANNOT_DISABLE_SELF');

    await query('DELETE FROM user_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE code = $2)', [secondAdmin.id, 'ADMIN']);
    const lastAdmin = await request(app)
      .post(`/api/admin/users/${admin.id}/disable`)
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(lastAdmin.status, 409);
    assert.equal(lastAdmin.body.error.code, 'LAST_ADMIN');

    // U07: Đổi vai trò chủ trạm đang sở hữu trạm sang vai trò khác bị chặn 409 OWNS_STATIONS
    const ownsStations = await request(app)
      .put(`/api/admin/users/${owner.id}/role`)
      .set('Cookie', admin.cookie)
      .send({ role: 'DRIVER' });
    assert.equal(ownsStations.status, 409);
    assert.equal(ownsStations.body.error.code, 'OWNS_STATIONS');

    // Khoá chủ trạm vi phạm vẫn được phép (không bị chặn bởi OWNS_STATIONS)
    const disableOwner = await request(app)
      .post(`/api/admin/users/${owner.id}/disable`)
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(disableOwner.status, 200);
    assert.ok(disableOwner.body.user.disabled_at);

    // Mở khoá lại người dùng (U03)
    const enableOwner = await request(app)
      .post(`/api/admin/users/${owner.id}/enable`)
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(enableOwner.status, 200);
    assert.equal(enableOwner.body.user.disabled_at, null);
  });

  it('hỗ trợ tìm kiếm, phân trang người dùng trong danh sách admin', async () => {
    const paged = await request(app)
      .get('/api/admin/users?page=1&limit=2')
      .set('Cookie', admin.cookie);
    assert.equal(paged.status, 200);
    assert.equal(paged.body.users.length, 2);
    assert.ok(paged.body.total >= 4);

    const filtered = await request(app)
      .get('/api/admin/users?query=s61-admin%25&role=ADMIN')
      .set('Cookie', admin.cookie);
    assert.equal(filtered.status, 200);
    assert.ok(Array.isArray(filtered.body.users));
  });

  it('từ chối truy cập quản lý tài khoản với vai trò không phải ADMIN', async () => {
    const nonAdmin = await createUser('s61-nonadmin@test.invalid', 'OPERATOR');
    const denied = await request(app).get('/api/admin/users').set('Cookie', nonAdmin.cookie);
    assert.equal(denied.status, 403);
  });
});
