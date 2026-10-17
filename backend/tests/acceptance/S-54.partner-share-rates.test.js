const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

describe('S-54 partner share rates API', () => {
  const users = {};

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    for (const role of ['ADMIN', 'ACCOUNTANT', 'STATION_OWNER', 'DRIVER']) {
      users[role] = await createUser(`${role.toLowerCase()}-rates@test.invalid`, role);
    }
    users.STATION_OWNER_B = await createUser('station-owner-b-rates@test.invalid', 'STATION_OWNER');
    await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Partner A', 'Test', $1) RETURNING id",
      [users.STATION_OWNER.id]
    );
    await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Partner B', 'Test', $1) RETURNING id",
      [users.STATION_OWNER_B.id]
    );
  });

  after(async () => { await resetSchema(); await closePool(); });

  it('lists partners with the current rate and scopes the list to station owners', async () => {
    const all = await request(app).get('/api/partners').set('Cookie', users.ADMIN.cookie);
    assert.equal(all.status, 200);
    assert.deepStrictEqual(all.body.partners, [
      { ownerId: String(users.STATION_OWNER.id), stationCount: 1, currentRate: null },
      { ownerId: String(users.STATION_OWNER_B.id), stationCount: 1, currentRate: null },
    ]);

    const own = await request(app).get('/api/partners').set('Cookie', users.STATION_OWNER.cookie);
    assert.equal(own.status, 200);
    assert.deepStrictEqual(own.body.partners.map((partner) => partner.ownerId), [String(users.STATION_OWNER.id)]);
  });

  it('lets accountants create rates and owners read only their own rate history', async () => {
    const created = await request(app)
      .post(`/api/partners/${users.STATION_OWNER.id}/share-rates`)
      .set('Cookie', users.ACCOUNTANT.cookie)
      .send({ shareBp: 7000, includeIdle: true, effectiveFrom: '2026-01-01', note: 'Hợp đồng A' });
    assert.equal(created.status, 201);
    assert.deepStrictEqual(created.body.rate, {
      id: created.body.rate.id,
      ownerId: String(users.STATION_OWNER.id),
      shareBp: 7000,
      includeIdle: true,
      effectiveFrom: '2026-01-01',
      note: 'Hợp đồng A',
    });

    const ownHistory = await request(app)
      .get(`/api/partners/${users.STATION_OWNER.id}/share-rates`)
      .set('Cookie', users.STATION_OWNER.cookie);
    assert.equal(ownHistory.status, 200);
    assert.equal(ownHistory.body.rates.length, 1);
    assert.equal(ownHistory.body.rates[0].shareBp, 7000);

    const otherHistory = await request(app)
      .get(`/api/partners/${users.STATION_OWNER_B.id}/share-rates`)
      .set('Cookie', users.STATION_OWNER.cookie);
    assert.equal(otherHistory.status, 403);
    assert.equal(otherHistory.body.error.code, 'FORBIDDEN');
    const denied = await query(
      "SELECT action FROM audit_logs WHERE action = 'ACCESS_DENIED' AND entity = 'partner' AND entity_id = $1",
      [users.STATION_OWNER_B.id]
    );
    assert.equal(denied.rowCount, 1);

    const forbiddenCreate = await request(app)
      .post(`/api/partners/${users.STATION_OWNER.id}/share-rates`)
      .set('Cookie', users.STATION_OWNER.cookie)
      .send({ shareBp: 7000, includeIdle: true, effectiveFrom: '2026-02-01' });
    assert.equal(forbiddenCreate.status, 403);
  });

  it('validates rate bounds, duplicate dates, and dates in closed periods', async () => {
    for (const shareBp of [10001, -1, '7000']) {
      const invalid = await request(app)
        .post(`/api/partners/${users.STATION_OWNER_B.id}/share-rates`)
        .set('Cookie', users.ADMIN.cookie)
        .send({ shareBp, includeIdle: true, effectiveFrom: '2026-01-01' });
      assert.equal(invalid.status, 400);
    }

    const duplicate = await request(app)
      .post(`/api/partners/${users.STATION_OWNER.id}/share-rates`)
      .set('Cookie', users.ADMIN.cookie)
      .send({ shareBp: 7500, includeIdle: true, effectiveFrom: '2026-01-01' });
    assert.equal(duplicate.status, 409);

    await query(
      "INSERT INTO accounting_periods (month, status, closed_at) VALUES ('2026-10-01', 'CLOSED', CURRENT_TIMESTAMP)"
    );
    const closedDate = await request(app)
      .post(`/api/partners/${users.STATION_OWNER.id}/share-rates`)
      .set('Cookie', users.ADMIN.cookie)
      .send({ shareBp: 7500, includeIdle: true, effectiveFrom: '2026-10-15' });
    assert.equal(closedDate.status, 409);
    assert.equal(closedDate.body.error.code, 'RATE_IN_CLOSED_PERIOD');
  });

  it('records only non-personal rate metadata in audit logs', async () => {
    const result = await query(
      "SELECT metadata FROM audit_logs WHERE action = 'PARTNER_RATE_CREATED' AND entity_id = $1",
      [users.STATION_OWNER.id]
    );
    assert.equal(result.rowCount, 1);
    assert.deepStrictEqual(result.rows[0].metadata, {
      owner_id: String(users.STATION_OWNER.id),
      share_bp: 7000,
      include_idle: true,
      effective_from: '2026-01-01',
    });
    assert.equal(JSON.stringify(result.rows[0].metadata).includes('rates@test.invalid'), false);
  });
});
