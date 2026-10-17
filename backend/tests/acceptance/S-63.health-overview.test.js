const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { createHealthMetrics, captureHealthSnapshot } = require('../../src/modules/health/health-metrics');

describe('S-63 AC: system health overview', () => {
  let admin;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.equal(migrated.status, 0, migrated.stderr);
    admin = await createUser('s63-admin@test.invalid', 'ADMIN');
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('ghi nhận OCPP calls/errors và snapshot số trụ, phiên hoạt động', async () => {
    const metrics = createHealthMetrics();
    metrics.recordOcppCall({ durationMs: 25, failed: false });
    metrics.recordOcppCall({ durationMs: 40, failed: true });
    await metrics.flush({ query });
    await captureHealthSnapshot({ db: { query } });

    const response = await request(app).get('/api/health/overview').set('Cookie', admin.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.points.length, 288);
    assert.equal(Date.parse(response.body.points[1].at) - Date.parse(response.body.points[0].at), 5 * 60_000);
    assert.equal(Date.parse(response.body.points.at(-1).at) - Date.parse(response.body.points[0].at), 287 * 5 * 60_000);

    const current = response.body.points.at(-1);
    assert.equal(current.ocpp_calls, 2);
    assert.equal(current.ocpp_errors, 1);
    assert.equal(current.latency_sum_ms, 65);
    assert.equal(typeof current.cps_online, 'number');
    assert.equal(typeof current.cps_total, 'number');
    assert.equal(typeof current.sessions_active, 'number');
  });

  it('không cho DRIVER xem bảng sức khoẻ vận hành', async () => {
    const driver = await createUser('s63-driver@test.invalid', 'DRIVER');
    const response = await request(app).get('/api/health/overview').set('Cookie', driver.cookie);
    assert.equal(response.status, 403);
  });
});
