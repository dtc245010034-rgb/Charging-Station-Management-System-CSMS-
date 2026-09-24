const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

// Phải đặt trước khi nạp app.
process.env.TRUST_PROXY = '1';
process.env.LOGIN_IP_MAX_FAILURES = '2';

const request = require('supertest');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const login = (email, password, ip) => request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ email, password });

describe('S-03 TRUST_PROXY: đếm khoá IP đúng sau reverse proxy', () => {
  before(async () => { await resetSchema(); assert.strictEqual(run('src/db/migrate.js').status, 0); });
  beforeEach(async () => { await truncateAll(); await createUser('ok@example.com', 'DRIVER', 'CorrectHorse-9'); });
  after(async () => { await resetSchema(); await closePool(); });

  it('IP khách khác nhau (qua X-Forwarded-For) được đếm riêng', async () => {
    await login('a@example.com', 'wrong-password', '198.51.100.1');
    await login('b@example.com', 'wrong-password', '198.51.100.1');
    assert.strictEqual((await login('ok@example.com', 'CorrectHorse-9', '198.51.100.1')).status, 429);
    assert.strictEqual((await login('ok@example.com', 'CorrectHorse-9', '198.51.100.2')).status, 200);
  });
});
