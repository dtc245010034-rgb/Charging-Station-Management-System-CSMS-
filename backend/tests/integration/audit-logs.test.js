const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');

describe('S-27 audit logs', () => {
  let admin;
  let operator;
  let accountant;
  let chargePointId;

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('audit-admin@test.invalid', 'ADMIN');
    operator = await createUser('audit-operator@test.invalid', 'OPERATOR');
    accountant = await createUser('audit-accountant@test.invalid', 'ACCOUNTANT');
    const station = await postStation(admin, stationBody({ name: 'Audit station' }));
    const chargePoint = await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'VCP-AUDIT-01') RETURNING id",
      [station.body.id]
    );
    chargePointId = chargePoint.rows[0].id;
    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, result)
       SELECT $1, 'RESET', 'charge_point', $2, '{"type":"Soft"}'::jsonb, 'Accepted'
       FROM generate_series(1, 51)`,
      [operator.id, chargePointId]
    );
  });

  after(async () => {
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('allows only ADMIN and filters by charge point, actor and date with 50 rows per page', async () => {
    assert.equal((await request(app).get('/api/audit-logs')).status, 401);
    assert.equal((await request(app).get('/api/audit-logs').set('Cookie', operator.cookie)).status, 403);
    assert.equal((await request(app).get('/api/audit-logs').set('Cookie', accountant.cookie)).status, 403);

    const filters = `charge_point=VCP-AUDIT-01&user=${operator.id}&from=2000-01-01&to=2100-12-31`;
    const first = await request(app).get(`/api/audit-logs?${filters}&page=1`).set('Cookie', admin.cookie);
    assert.equal(first.status, 200);
    assert.equal(first.body.page, 1);
    assert.equal(first.body.pageSize, 50);
    assert.equal(first.body.total, 51);
    assert.equal(first.body.items.length, 50);
    assert.ok(first.body.items.every((item) => item.charge_point_code === 'VCP-AUDIT-01'));
    assert.ok(first.body.items.every((item) => String(item.user_id) === String(operator.id)));
    assert.equal(first.body.items[0].result, 'Accepted');

    const second = await request(app).get(`/api/audit-logs?${filters}&page=2`).set('Cookie', admin.cookie);
    assert.equal(second.status, 200);
    assert.equal(second.body.total, 51);
    assert.equal(second.body.pageSize, 50);
    assert.equal(second.body.items.length, 1);
  });

  it('treats date filters as Vietnam local dates consistently with a UTC database timezone', async () => {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, created_at)
       VALUES
         ($1, 'LOCAL_DATE_TEST', 'charge_point', $2, '2001-02-02T16:59:59.999Z'),
         ($1, 'LOCAL_DATE_TEST', 'charge_point', $2, '2001-02-02T17:00:00.000Z'),
         ($1, 'LOCAL_DATE_TEST', 'charge_point', $2, '2001-02-03T16:59:59.999Z'),
         ($1, 'LOCAL_DATE_TEST', 'charge_point', $2, '2001-02-03T17:00:00.000Z')`,
      [accountant.id, chargePointId]
    );
    const response = await request(app).get(
      `/api/audit-logs?user=${accountant.id}&from=2001-02-03&to=2001-02-03`
    ).set('Cookie', admin.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.total, 2);
    assert.ok(response.body.items.every((item) => item.action === 'LOCAL_DATE_TEST'));
  });

  it('treats wildcard characters in filters literally and normalizes metadata/results', async () => {
    const response = await request(app)
      .get(`/api/audit-logs?charge_point=${encodeURIComponent('%_')}&user=${encodeURIComponent('%_')}`)
      .set('Cookie', admin.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.total, 0);
    const regular = await request(app).get('/api/audit-logs?page=1').set('Cookie', admin.cookie);
    assert.equal(regular.status, 200);
    assert.ok(regular.body.items.every((item) => item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)));
    assert.ok(regular.body.items.every((item) => item.result === null || typeof item.result === 'string'));
  });

  it('rejects invalid date ranges and page values', async () => {
    const invalidRange = await request(app)
      .get('/api/audit-logs?from=2026-10-12&to=2026-10-11')
      .set('Cookie', admin.cookie);
    assert.equal(invalidRange.status, 400);

    const invalidPage = await request(app)
      .get('/api/audit-logs?page=0')
      .set('Cookie', admin.cookie);
    assert.equal(invalidPage.status, 400);
  });

  it('blocks audit-log mutations with 405 after authentication and authorization', async () => {
    const anonymous = await request(app).delete('/api/audit-logs/1').type('json').send({});
    assert.equal(anonymous.status, 401);

    const forbidden = await request(app).delete('/api/audit-logs/1')
      .set('Cookie', accountant.cookie).type('json').send({});
    assert.equal(forbidden.status, 403);
    const operatorForbidden = await request(app).delete('/api/audit-logs/1')
      .set('Cookie', operator.cookie).type('json').send({});
    assert.equal(operatorForbidden.status, 403);

    for (const method of ['put', 'patch', 'delete']) {
      for (const path of ['/api/audit-logs', '/api/audit-logs/1']) {
        const response = await request(app)[method](path).set('Cookie', admin.cookie).type('json').send({});
        assert.equal(response.status, 405, `${method.toUpperCase()} ${path}`);
        assert.equal(response.headers.allow, 'GET, HEAD, OPTIONS');
        assert.equal(response.body.error.code, 'METHOD_NOT_ALLOWED');
      }
    }
  });

});
