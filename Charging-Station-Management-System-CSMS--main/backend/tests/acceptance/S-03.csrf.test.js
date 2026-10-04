const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const ORIGIN = 'http://localhost:3000'; // APP_ORIGIN của helpers
const creds = { email: 'a@example.com', password: 'CorrectHorse-9' };

describe('S-03 chống CSRF: application/json + Origin hợp lệ, chỉ nhận phiên qua cookie', () => {
  before(async () => { await resetSchema(); assert.strictEqual(run('src/db/migrate.js').status, 0); });
  beforeEach(async () => { await truncateAll(); await createUser(creds.email, 'DRIVER', creds.password); });
  after(async () => { await resetSchema(); await closePool(); });

  it('request đổi dữ liệu không phải application/json → 415', async () => {
    const asText = await request(app).post('/api/auth/login').set('Content-Type', 'text/plain').send(JSON.stringify(creds));
    assert.strictEqual(asText.status, 415);
    assert.strictEqual(asText.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    assert.strictEqual((await request(app).post('/api/auth/login').type('form').send(creds)).status, 415);
    assert.strictEqual((await request(app).post('/api/auth/logout')).status, 415);
  });

  it('Origin lạ → 403; Origin = APP_ORIGIN hoặc không có Origin → cho qua', async () => {
    const evil = await request(app).post('/api/auth/login').set('Origin', 'http://evil.example').send(creds);
    assert.strictEqual(evil.status, 403);
    assert.strictEqual((await request(app).post('/api/auth/login').set('Origin', ORIGIN).send(creds)).status, 200);
    assert.strictEqual((await request(app).post('/api/auth/login').send(creds)).status, 200);
  });

  it('GET không bị ràng buộc Content-Type/Origin', async () => {
    assert.strictEqual((await request(app).get('/api/health').set('Origin', 'http://evil.example')).status, 200);
  });

  it('token hợp lệ gửi qua Authorization: Bearer → 401 (chỉ nhận cookie)', async () => {
    const login = await request(app).post('/api/auth/login').send(creds);
    const token = login.headers['set-cookie'][0].split(';')[0].replace('token=', '');
    assert.strictEqual((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status, 401);
    assert.strictEqual((await request(app).get('/api/auth/me').set('Cookie', `token=${token}`)).status, 200);
  });
});
