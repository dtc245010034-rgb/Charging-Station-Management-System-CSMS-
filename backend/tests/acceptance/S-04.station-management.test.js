const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const connections = require('../../src/modules/charge-points/connection-registry');

describe('S-04/S-05 quản lý trạm, trụ và đầu nối', () => {
  let owner;
  let otherOwner;
  let admin;

  const post = (url, body, user = owner) => request(app).post(url).set('Cookie', user.cookie).send(body);
  const patch = (url, body, user = owner) => request(app).patch(url).set('Cookie', user.cookie).send(body);

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('station-owner@example.com', 'STATION_OWNER');
    otherOwner = await createUser('other-owner@example.com', 'STATION_OWNER');
    admin = await createUser('station-admin@example.com', 'ADMIN');
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('rejects invalid coordinates and replays a station request by idempotency key', async () => {
    const missingKey = await request(app).post('/api/stations').set('Cookie', owner.cookie)
      .send({ name: 'No key', address: 'HN', latitude: 21, longitude: 105 });
    assert.strictEqual(missingKey.status, 400);
    const missingCoordinates = await request(app).post('/api/stations').set('Cookie', owner.cookie)
      .set('Idempotency-Key', 'station-missing-coord').send({ name: 'No coordinates', address: 'HN' });
    assert.strictEqual(missingCoordinates.status, 400);
    const invalid = await request(app).post('/api/stations').set('Cookie', owner.cookie).set('Idempotency-Key', 'station-invalid-coord')
      .send({ name: 'Bad', address: 'HN', latitude: 95, longitude: 20 });
    assert.strictEqual(invalid.status, 400);

    const body = { name: 'Trạm A', address: 'Hà Nội', latitude: '21.12345678', longitude: '105.12345678' };
    const [first, replay] = await Promise.all([1, 2].map(() => request(app).post('/api/stations').set('Cookie', owner.cookie)
      .set('Idempotency-Key', 'station-request-0001').send(body)));
    assert.strictEqual(first.status, 201);
    assert.strictEqual(replay.status, 201);
    assert.strictEqual(String(first.body.id), String(replay.body.id));
    assert.strictEqual(first.body.status, 'INACTIVE');
    assert.strictEqual((await query('SELECT count(*)::int AS count FROM stations WHERE owner_id = $1', [owner.id])).rows[0].count, 1);
    const changed = await request(app).post('/api/stations').set('Cookie', owner.cookie)
      .set('Idempotency-Key', 'station-request-0001').send({ ...body, name: 'Trạm B' });
    assert.strictEqual(changed.status, 409);
  });

  it('creates the requested connectors, checks code availability, and scopes station access', async () => {
    const station = (await request(app).get('/api/stations').set('Cookie', owner.cookie)).body[0];
    const created = await post(`/api/stations/${station.id}/charge-points`, { code: 'CP-S05', connector_count: 3 });
    assert.strictEqual(created.status, 201);
    const details = await request(app).get(`/api/stations/${station.id}`).set('Cookie', owner.cookie);
    assert.deepStrictEqual(details.body.charge_points[0].connectors.map((connector) => connector.connector_no), [1, 2, 3]);
    assert.strictEqual((await request(app).get('/api/charge-points/check-code?code=CP-S05').set('Cookie', owner.cookie)).body.is_available, false);
    assert.strictEqual((await request(app).get('/api/charge-points/check-code?code=CP-FREE').set('Cookie', owner.cookie)).body.is_available, true);
    assert.strictEqual((await post(`/api/stations/${station.id}/charge-points`, { code: 'CP-S05' }, otherOwner)).status, 403);
  });

  it('rejects coordinate changes while active and code changes while connected', async () => {
    const station = (await request(app).get('/api/stations').set('Cookie', owner.cookie)).body[0];
    assert.strictEqual((await patch(`/api/stations/${station.id}`, { status: 'ACTIVE' })).status, 400);
    assert.strictEqual((await request(app).patch(`/api/stations/${station.id}`).set('Cookie', admin.cookie).send({ status: 'ACTIVE' })).status, 200);
    assert.strictEqual((await patch(`/api/stations/${station.id}`, { latitude: 22, longitude: 106 })).status, 400);
    assert.strictEqual((await request(app).patch(`/api/stations/${station.id}`).set('Cookie', admin.cookie).send({ status: 'INACTIVE' })).status, 200);
    assert.strictEqual((await patch(`/api/stations/${station.id}`, { latitude: 22, longitude: 106 })).status, 200);

    const point = (await request(app).get(`/api/stations/${station.id}`).set('Cookie', owner.cookie)).body.charge_points[0];
    connections.connect(point.code);
    try {
      assert.strictEqual((await patch(`/api/charge-points/${point.id}`, { code: 'CP-RENAMED' })).status, 409);
    } finally {
      connections.disconnect(point.code);
    }
    assert.strictEqual((await patch(`/api/charge-points/${point.id}`, { code: 'CP-RENAMED' })).status, 200);
  });

  it('restricts deleting an owner while owned stations remain', async () => {
    await query('DELETE FROM audit_logs WHERE user_id = $1', [owner.id]);
    await query('DELETE FROM idempotency_keys WHERE user_id = $1', [owner.id]);
    await assert.rejects(query('DELETE FROM users WHERE id = $1', [owner.id]));
  });
});