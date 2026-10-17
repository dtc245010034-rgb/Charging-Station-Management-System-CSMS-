const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-61 AC: administrators manage account status and roles safely', () => {
  let adminA;
  let adminB;
  let driver;
  const driverPassword = 'DriverPassword-61!';

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    adminA = await createUser('management-admin-a@test.invalid', 'ADMIN', 'AdminPassword-61!');
    adminB = await createUser('management-admin-b@test.invalid', 'ADMIN', 'AdminPassword-61!');
    driver = await createUser('management-driver@test.invalid', 'DRIVER', driverPassword);
  });

  after(async () => {
    await resetSchema();
    run('src/db/migrate.js');
    await closePool();
  });

  it('S-61 AC: lists/searches users, changes roles, locks/unlocks, revokes sessions, and protects the last admin', async () => {
    const listed = await request(app)
      .get('/api/admin/users?search=management-driver')
      .set('Cookie', adminA.cookie);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.equal(listed.body.users.length, 1);
    assert.equal(listed.body.users[0].email, 'management-driver@test.invalid');
    assert.deepStrictEqual(listed.body.users[0].roles, ['DRIVER']);
    assert.equal(listed.body.users[0].isActive, true);
    assert.equal((await request(app).get('/api/admin/users').set('Cookie', driver.cookie)).status, 403);

    const roleChange = await request(app)
      .patch(`/api/admin/users/${driver.id}/role`)
      .set('Cookie', adminA.cookie)
      .send({ role: 'ACCOUNTANT' });
    assert.equal(roleChange.status, 200);
    assert.deepStrictEqual(roleChange.body.user.roles, ['ACCOUNTANT']);
    assert.equal((await request(app).get('/api/auth/me').set('Cookie', driver.cookie)).status, 401);

    const driverLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'management-driver@test.invalid', password: driverPassword });
    assert.equal(driverLogin.status, 200);
    assert.deepStrictEqual(driverLogin.body.user.roles, ['ACCOUNTANT']);
    const driverSessionCookie = driverLogin.headers['set-cookie'][0].split(';', 1)[0];

    const selfLock = await request(app)
      .patch(`/api/admin/users/${adminA.id}/status`)
      .set('Cookie', adminA.cookie)
      .send({ isActive: false });
    assert.equal(selfLock.status, 400);
    assert.equal(selfLock.body.error.code, 'CANNOT_DISABLE_SELF');

    const lockAdmin = await request(app)
      .patch(`/api/admin/users/${adminB.id}/status`)
      .set('Cookie', adminA.cookie)
      .send({ isActive: false });
    assert.equal(lockAdmin.status, 200);
    assert.equal(lockAdmin.body.user.isActive, false);
    assert.equal((await request(app).get('/api/auth/me').set('Cookie', adminB.cookie)).status, 401);

    const lastAdminDemotion = await request(app)
      .patch(`/api/admin/users/${adminA.id}/role`)
      .set('Cookie', adminA.cookie)
      .send({ role: 'ACCOUNTANT' });
    assert.equal(lastAdminDemotion.status, 409);
    assert.equal(lastAdminDemotion.body.error.code, 'LAST_ADMIN_REQUIRED');

    const unlockAdmin = await request(app)
      .patch(`/api/admin/users/${adminB.id}/status`)
      .set('Cookie', adminA.cookie)
      .send({ isActive: true });
    assert.equal(unlockAdmin.status, 200);
    const adminBLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'management-admin-b@test.invalid', password: 'AdminPassword-61!' });
    const adminBSessionCookie = adminBLogin.headers['set-cookie'][0].split(';', 1)[0];
    const selfDemotion = await request(app)
      .patch(`/api/admin/users/${adminA.id}/role`)
      .set('Cookie', adminA.cookie)
      .send({ role: 'ACCOUNTANT' });
    assert.equal(selfDemotion.status, 200);
    assert.equal((await request(app).get('/api/auth/me').set('Cookie', adminA.cookie)).status, 401);

    const lockDriver = await request(app)
      .patch(`/api/admin/users/${driver.id}/status`)
      .set('Cookie', adminBSessionCookie)
      .send({ isActive: false });
    assert.equal(lockDriver.status, 200);
    assert.equal((await request(app).get('/api/auth/me').set('Cookie', driverSessionCookie)).status, 401);
    const disabledLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'management-driver@test.invalid', password: driverPassword });
    assert.equal(disabledLogin.status, 401);
    const unlockDriver = await request(app)
      .patch(`/api/admin/users/${driver.id}/status`)
      .set('Cookie', adminBSessionCookie)
      .send({ isActive: true });
    assert.equal(unlockDriver.status, 200);

    const audit = await query(
      `SELECT COUNT(*)::int AS count FROM audit_logs
       WHERE action IN ('USER_ROLE_CHANGED', 'USER_ACTIVATED', 'USER_DEACTIVATED')`
    );
    assert.equal(audit.rows[0].count, 6);
  });
});
