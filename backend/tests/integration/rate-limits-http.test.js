const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

describe('giới hạn tần suất HTTP (#28 check-code, #22 đăng ký)', () => {
  let owner;
  let other;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('rl-owner@test.invalid', 'STATION_OWNER');
    other = await createUser('rl-other@test.invalid', 'STATION_OWNER');
  });

  after(async () => {
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  const checkCode = (user) => request(app).get('/api/charge-points/check-code?code=RL-CODE-01').set('Cookie', user.cookie);

  it('#28: 30 lần check-code/phút/tài khoản, lần 31 là 429 kèm Retry-After; tài khoản khác không bị ảnh hưởng', async () => {
    for (let index = 0; index < 30; index += 1) assert.equal((await checkCode(owner)).status, 200, `lần ${index + 1}`);
    const blocked = await checkCode(owner);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    assert.equal((await checkCode(other)).status, 200);
  });

  const register = (email) => request(app).post('/api/auth/register').send({ name: 'Người dùng', email, password: 'MatKhau-12345' });

  it('#22: dò email có sẵn quá 5 lần/giờ/IP thì bị 429, kể cả khi gửi email mới', async () => {
    for (let index = 0; index < 5; index += 1) assert.equal((await register('rl-owner@test.invalid')).status, 409, `lần ${index + 1}`);
    const blocked = await register('rl-owner@test.invalid');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    assert.equal((await register('rl-fresh@test.invalid')).status, 429);
  });
});
