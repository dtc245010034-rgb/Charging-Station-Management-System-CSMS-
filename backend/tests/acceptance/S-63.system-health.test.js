const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-63 AC: system health reports online chargers, active sessions, and recent errors', () => {
  let admin;
  let operator;
  let owner;
  let driver;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('health-admin@test.invalid', 'ADMIN');
    operator = await createUser('health-operator@test.invalid', 'OPERATOR');
    owner = await createUser('health-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('health-driver@test.invalid', 'DRIVER');
    const station = await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Health Station', 'Test', $1) RETURNING id",
      [owner.id]
    );
    const points = await query(
      `INSERT INTO charge_points (station_id, code, status)
       VALUES ($1, 'HEALTH-ONLINE', 'ONLINE'), ($1, 'HEALTH-OFFLINE', 'OFFLINE')
       RETURNING id, code`,
      [station.rows[0].id]
    );
    const onlinePoint = points.rows.find((point) => point.code === 'HEALTH-ONLINE');
    const onlineConnector = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status) VALUES ($1, 1, 'CHARGING') RETURNING id",
      [onlinePoint.id]
    );
    await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked,
         meter_start, started_at, status
       ) VALUES ($1, $2, 1, 'HEALTH-SESSION', 0, CURRENT_TIMESTAMP, 'CHARGING')`,
      [onlinePoint.id, onlineConnector.rows[0].id]
    );
    await query(
      `INSERT INTO alerts (kind, severity, station_id, charge_point_id, message, opened_at)
       VALUES
         ('RECENT_TEST_ERROR', 'WARNING', $1, $2, 'Recent diagnostic error', CURRENT_TIMESTAMP - INTERVAL '1 hour'),
         ('OLD_TEST_ERROR', 'CRITICAL', $1, $3, 'Old diagnostic error', CURRENT_TIMESTAMP - INTERVAL '2 days')`,
      [station.rows[0].id, onlinePoint.id, points.rows.find((point) => point.code === 'HEALTH-OFFLINE').id]
    );
  });

  after(async () => {
    await resetSchema();
    run('src/db/migrate.js');
    await closePool();
  });

  it('S-63 AC: exposes aggregate metrics and recent alerts only to ADMIN/OPERATOR', async () => {
    const adminView = await request(app).get('/api/health/dashboard').set('Cookie', admin.cookie);
    assert.equal(adminView.status, 200);
    assert.equal(adminView.body.onlineChargePoints, 1);
    assert.equal(adminView.body.activeSessions, 1);
    assert.equal(adminView.body.recentErrorsCount, 1);
    assert.equal(adminView.body.recentErrors.length, 1);
    assert.equal(adminView.body.recentErrors[0].kind, 'RECENT_TEST_ERROR');
    assert.ok(adminView.body.measuredAt);

    const operatorView = await request(app).get('/api/health/dashboard').set('Cookie', operator.cookie);
    assert.equal(operatorView.status, 200);
    assert.equal((await request(app).get('/api/health/dashboard').set('Cookie', owner.cookie)).status, 403);
    assert.equal((await request(app).get('/api/health/dashboard').set('Cookie', driver.cookie)).status, 403);
  });
});
