const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { createHealthMetrics, captureHealthSnapshot, purgeOldMetrics } = require('../../src/modules/health/health-metrics');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');

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

  it('ghi nhận OCPP calls/errors và snapshot số trụ, phiên hoạt động đúng hợp đồng Mục 3.8', async () => {
    const metrics = createHealthMetrics();
    metrics.recordOcppCall({ durationMs: 25, failed: false });
    metrics.recordOcppCall({ durationMs: 40, failed: true });
    await metrics.flush({ query });
    await captureHealthSnapshot({ db: { query } });

    const response = await request(app).get('/api/health/overview').set('Cookie', admin.cookie);
    assert.equal(response.status, 200);

    // Hợp đồng Mục 3.8: generatedAt, now, series
    assert.ok(response.body.generatedAt);
    assert.equal(typeof response.body.now, 'object');
    assert.equal(typeof response.body.now.cpsOnline, 'number');
    assert.equal(typeof response.body.now.cpsTotal, 'number');
    assert.equal(typeof response.body.now.sessionsActive, 'number');
    assert.equal(response.body.now.errors5m, 1);
    assert.equal(typeof response.body.now.latencyAvgMs5m, 'number');

    assert.ok(Array.isArray(response.body.series));
    const current = response.body.series.at(-1);
    assert.equal(current.errors, 1);
    assert.equal(typeof current.cpsOnline, 'number');
    assert.equal(typeof current.sessionsActive, 'number');
    assert.equal(typeof current.latencyAvgMs, 'number');
  });

  it('B07: Broken Frame (khung hỏng) được tính vào ocpp_errors', async () => {
    const metrics = createHealthMetrics();
    let sentError = false;
    const conn = {
      send: (_msg, cb) => {
        sentError = true;
        cb?.();
      },
    };
    const handler = createOcppMessageHandler({
      handlers: {},
      recordOcppCall: metrics.recordOcppCall,
      updateLastSeen: () => {},
    });

    await handler.handleMessage(conn, 'khung-khong-phai-json');
    assert.equal(sentError, true);
    await metrics.flush({ query });

    const response = await request(app).get('/api/health/overview').set('Cookie', admin.cookie);
    assert.equal(response.status, 200);
    assert.ok(response.body.now.errors5m >= 1);
  });

  it('B08: dọn dẹp số liệu health_minutes cũ hơn 8 ngày', async () => {
    await query(
      "INSERT INTO health_minutes (minute_at, ocpp_calls, ocpp_errors, latency_sum_ms, cps_online, cps_total, sessions_active) VALUES (CURRENT_TIMESTAMP - INTERVAL '9 days', 5, 0, 100, 1, 1, 0)"
    );
    await query(
      "INSERT INTO health_minutes (minute_at, ocpp_calls, ocpp_errors, latency_sum_ms, cps_online, cps_total, sessions_active) VALUES (CURRENT_TIMESTAMP - INTERVAL '3 days', 5, 0, 100, 1, 1, 0)"
    );

    const purged = await purgeOldMetrics({ db: { query } });
    assert.ok(purged.deleted >= 1);

    const remaining = await query(
      "SELECT COUNT(*)::int AS cnt FROM health_minutes WHERE minute_at < CURRENT_TIMESTAMP - INTERVAL '8 days'"
    );
    assert.equal(remaining.rows[0].cnt, 0);
  });

  it('không cho DRIVER xem bảng sức khoẻ vận hành', async () => {
    const driver = await createUser('s63-driver@test.invalid', 'DRIVER');
    const response = await request(app).get('/api/health/overview').set('Cookie', driver.cookie);
    assert.equal(response.status, 403);
  });
});
