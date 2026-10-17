const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { scanChargePointAlerts } = require('../../src/modules/charge-points/charge-point-alert-job');

describe('S-46 AC: prolonged offline periods and repeated connector errors create alerts', () => {
  let owner;
  let offlinePointId;
  let repeatedErrorPointId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('point-alert-owner@test.invalid', 'STATION_OWNER');
    const station = await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Alert Station', 'Test', $1) RETURNING id",
      [owner.id]
    );
    const points = await query(
      `INSERT INTO charge_points (station_id, code, status, last_seen_at)
       VALUES
         ($1, 'ALERT-OFFLINE', 'OFFLINE', CURRENT_TIMESTAMP - INTERVAL '6 minutes'),
         ($1, 'ALERT-ERRORS', 'ONLINE', CURRENT_TIMESTAMP)
       RETURNING id, code`,
      [station.rows[0].id]
    );
    offlinePointId = points.rows.find((point) => point.code === 'ALERT-OFFLINE').id;
    repeatedErrorPointId = points.rows.find((point) => point.code === 'ALERT-ERRORS').id;
    const connectors = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status)
       SELECT id, 1, 'AVAILABLE' FROM charge_points
       WHERE id IN ($1, $2) RETURNING id, charge_point_id`,
      [offlinePointId, repeatedErrorPointId]
    );
    const repeatedConnectorId = connectors.rows.find((row) => String(row.charge_point_id) === String(repeatedErrorPointId)).id;
    await query(
      `INSERT INTO connector_errors (connector_id, error_code, occurred_at)
       VALUES
         ($1, 'GroundFailure', CURRENT_TIMESTAMP - INTERVAL '9 minutes'),
         ($1, 'GroundFailure', CURRENT_TIMESTAMP - INTERVAL '5 minutes'),
         ($1, 'GroundFailure', CURRENT_TIMESTAMP - INTERVAL '1 minute')`,
      [repeatedConnectorId]
    );
  });

  after(async () => {
    await resetSchema();
    run('src/db/migrate.js');
    await closePool();
  });

  it('S-46 AC: creates one warning per condition after five minutes or three errors in ten minutes', async () => {
    const result = await scanChargePointAlerts();
    assert.equal(result.offlineCount, 1);
    assert.equal(result.repeatedErrorCount, 1);

    const alerts = await query(
      `SELECT kind, charge_point_id, severity, details
       FROM alerts ORDER BY kind`
    );
    assert.equal(alerts.rowCount, 2);
    const offline = alerts.rows.find((alert) => alert.kind === 'CHARGE_POINT_OFFLINE');
    assert.equal(String(offline.charge_point_id), String(offlinePointId));
    assert.equal(offline.severity, 'WARNING');
    assert.ok(offline.details.offline_seconds >= 300);

    const errors = alerts.rows.find((alert) => alert.kind === 'CHARGE_POINT_REPEATED_ERRORS');
    assert.equal(String(errors.charge_point_id), String(repeatedErrorPointId));
    assert.equal(errors.details.error_count, 3);
    assert.equal(errors.details.window_minutes, 10);
  });

  it('S-46 AC: deduplicates repeated scans and exposes alerts to the station owner', async () => {
    await scanChargePointAlerts();
    const stored = await query('SELECT count(*)::int AS count FROM alerts');
    assert.equal(stored.rows[0].count, 2);

    const response = await require('supertest')(app)
      .get('/api/alerts?state=open')
      .set('Cookie', owner.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.length, 2);
  });
});
