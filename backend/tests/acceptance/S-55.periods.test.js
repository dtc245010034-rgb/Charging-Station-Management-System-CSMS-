const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-55 AC: accounting periods require resolved sessions and admin reopening', () => {
  let admin;
  let accountant;
  let driver;
  let tariffId;
  let chargePointId;
  let connectorId;
  let blockedSessionId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('period-admin@test.invalid', 'ADMIN');
    accountant = await createUser('period-accountant@test.invalid', 'ACCOUNTANT');
    driver = await createUser('period-driver@test.invalid', 'DRIVER');
    const station = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ('Period Station', 'Test', $1, 'ACTIVE') RETURNING id",
      [admin.id]
    );
    const chargePoint = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'PERIOD-CP', 'ONLINE') RETURNING id",
      [station.rows[0].id]
    );
    chargePointId = chargePoint.rows[0].id;
    const connector = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id",
      [chargePoint.rows[0].id]
    );
    connectorId = connector.rows[0].id;
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong, created_by)
       VALUES ($1, 1, '2026-01-01', 0, 0, $2) RETURNING id`,
      [station.rows[0].id, admin.id]
    );
    tariffId = tariff.rows[0].id;
    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, 0, 1440, 4000, 'Cả ngày')`,
      [tariffId]
    );
    const blockedSession = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, meter_start, meter_stop,
         started_at, stopped_at, status, billing_status
       ) VALUES ($1, $2, 1, 'PERIOD-TAG', 0, 1000,
         '2026-08-10T01:00:00Z', '2026-08-10T02:00:00Z', 'COMPLETED', NULL) RETURNING id`,
      [chargePoint.rows[0].id, connector.rows[0].id]
    );
    blockedSessionId = blockedSession.rows[0].id;
  });

  after(async () => {
    await resetSchema();
    run('src/db/migrate.js');
    await closePool();
  });

  it('S-55 AC: closing a past month stores an audit record and lists the period', async () => {
    const closed = await request(app)
      .post('/api/accounting/periods/2026-09/close')
      .set('Cookie', accountant.cookie)
      .send({});
    assert.strictEqual(closed.status, 200);
    assert.strictEqual(closed.body.status, 'CLOSED');

    const listed = await request(app)
      .get('/api/accounting/periods')
      .set('Cookie', accountant.cookie);
    assert.strictEqual(listed.status, 200);
    assert.ok(listed.body.periods.some((period) => period.month === '2026-09-01' && period.status === 'CLOSED'));

    const audit = await query(
      "SELECT action FROM audit_logs WHERE action = 'PERIOD_CLOSED' AND entity_id = $1",
      [closed.body.id]
    );
    assert.strictEqual(audit.rowCount, 1);
  });

  it('S-55 AC: late finalization in a closed month preserves the session and records PERIOD_CLOSED', async () => {
    const { finalizeSession } = require('../../src/modules/billing/finalize-session');
    const inserted = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status
       ) VALUES ($1, $2, 1, $3, 'LATE-TAG', 0, 1000,
         '2026-09-10T01:00:00Z', '2026-09-10T02:00:00Z', 'COMPLETED')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );
    const result = await finalizeSession(inserted.rows[0].id, { logError: () => {} });
    assert.deepStrictEqual(result, { status: 'ERROR', reason: 'PERIOD_CLOSED' });
    const session = await query(
      'SELECT status, billing_status, billing_reason FROM charging_sessions WHERE id = $1',
      [inserted.rows[0].id]
    );
    assert.deepStrictEqual(session.rows[0], {
      status: 'COMPLETED',
      billing_status: 'ERROR',
      billing_reason: 'PERIOD_CLOSED',
    });
    const audit = await query(
      "SELECT action, metadata FROM audit_logs WHERE action = 'BILLING_PERIOD_CLOSED' AND entity_id = $1",
      [inserted.rows[0].id]
    );
    assert.strictEqual(audit.rowCount, 1);
    assert.deepStrictEqual(audit.rows[0].metadata, { reason: 'PERIOD_CLOSED' });
  });

  it('S-55 AC: refuses to close a month with unresolved completed sessions', async () => {
    const response = await request(app)
      .post('/api/accounting/periods/2026-08/close')
      .set('Cookie', accountant.cookie)
      .send({});
    assert.strictEqual(response.status, 409);
    assert.strictEqual(response.body.error.code, 'PERIOD_HAS_BLOCKERS');
    assert.ok(response.body.error.details.some((session) => String(session.id) === String(blockedSessionId)));
  });

  it('S-55 AC: only ADMIN reopens a period and the action requires a reason and audit', async () => {
    const closed = await request(app)
      .post('/api/accounting/periods/2026-07/close')
      .set('Cookie', accountant.cookie)
      .send({});
    assert.strictEqual(closed.status, 200);

    const denied = await request(app)
      .post('/api/accounting/periods/2026-07/reopen')
      .set('Cookie', accountant.cookie)
      .send({ reason: 'Lý do mở lại đủ dài' });
    assert.strictEqual(denied.status, 403);

    const invalid = await request(app)
      .post('/api/accounting/periods/2026-07/reopen')
      .set('Cookie', admin.cookie)
      .send({ reason: 'ngắn' });
    assert.strictEqual(invalid.status, 400);

    const reopened = await request(app)
      .post('/api/accounting/periods/2026-07/reopen')
      .set('Cookie', admin.cookie)
      .send({ reason: 'Điều chỉnh đối soát sau kiểm tra' });
    assert.strictEqual(reopened.status, 200);
    assert.strictEqual(reopened.body.status, 'OPEN');
    const audit = await query(
      "SELECT metadata FROM audit_logs WHERE action = 'PERIOD_REOPENED' AND entity_id = $1",
      [closed.body.id]
    );
    assert.strictEqual(audit.rowCount, 1);
    assert.strictEqual(audit.rows[0].metadata.reason, 'Điều chỉnh đối soát sau kiểm tra');
  });
});
