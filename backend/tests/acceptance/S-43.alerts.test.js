const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');

describe('S-43 AC: scoped alerts and operator closure', () => {
  let admin;
  let operator;
  let owner;
  let otherOwner;
  let driver;
  let ownAlertId;
  let otherAlertId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('alerts-admin@example.com', 'ADMIN');
    operator = await createUser('alerts-operator@example.com', 'OPERATOR');
    owner = await createUser('alerts-owner@example.com', 'STATION_OWNER');
    otherOwner = await createUser('alerts-other-owner@example.com', 'STATION_OWNER');
    driver = await createUser('alerts-driver@example.com', 'DRIVER');
    const station = (await postStation(owner, stationBody({ name: 'Owner alert station' }))).body;
    const otherStation = (await postStation(otherOwner, stationBody({ name: 'Other alert station' }))).body;
    const ownAlert = await query(
      `INSERT INTO alerts (kind, severity, station_id, message, details, dedup_key)
       VALUES ('POWER_PROFILE_REJECTED', 'WARNING', $1, 'Profile rejected', '{"limitW":7300}', 'own-session')
       RETURNING id`,
      [station.id]
    );
    ownAlertId = ownAlert.rows[0].id;
    const otherAlert = await query(
      `INSERT INTO alerts (kind, severity, station_id, message, dedup_key)
       VALUES ('POWER_UNCONFIRMED', 'CRITICAL', $1, 'Profile unconfirmed', 'other-session') RETURNING id`,
      [otherStation.id]
    );
    otherAlertId = otherAlert.rows[0].id;
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('S-43 AC: lists only alerts owned by the requesting station owner', async () => {
    const own = await request(app).get('/api/alerts?state=open').set('Cookie', owner.cookie);
    assert.strictEqual(own.status, 200);
    assert.deepStrictEqual(own.body.map((alert) => alert.id), [ownAlertId]);
    assert.deepStrictEqual(own.body[0].details, { limitW: 7300 });
    const other = await request(app).get('/api/alerts?state=open').set('Cookie', otherOwner.cookie);
    assert.deepStrictEqual(other.body.map((alert) => alert.id), [otherAlertId]);
    assert.ok(!other.body.some((alert) => alert.id === ownAlertId));
    const invalidState = await request(app).get('/api/alerts?state=all').set('Cookie', admin.cookie);
    assert.strictEqual(invalidState.status, 400);
  });

  it('S-43 AC: closes alerts for ADMIN/OPERATOR and writes ALERT_CLOSED audit', async () => {
    const denied = await request(app).post(`/api/alerts/${ownAlertId}/close`).set('Cookie', owner.cookie).send({});
    assert.strictEqual(denied.status, 403);
    const closed = await request(app).post(`/api/alerts/${ownAlertId}/close`).set('Cookie', operator.cookie).send({});
    assert.strictEqual(closed.status, 200);
    assert.ok(closed.body.closed_at);
    const audit = await query(
      `SELECT action, entity, entity_id FROM audit_logs
       WHERE user_id = $1 AND action = 'ALERT_CLOSED' ORDER BY id DESC LIMIT 1`,
      [operator.id]
    );
    assert.deepStrictEqual(audit.rows[0], { action: 'ALERT_CLOSED', entity: 'alert', entity_id: ownAlertId });
    assert.deepStrictEqual((await request(app).get('/api/alerts?state=closed').set('Cookie', owner.cookie)).body.map((alert) => alert.id), [ownAlertId]);
    assert.strictEqual((await request(app).get('/api/alerts').set('Cookie', driver.cookie)).status, 403);
    assert.strictEqual((await request(app).post(`/api/alerts/${ownAlertId}/close`).set('Cookie', driver.cookie).send({})).status, 403);
    assert.strictEqual((await request(app).post(`/api/alerts/${ownAlertId}/close`).set('Cookie', admin.cookie).send({})).status, 200);
  });
});
