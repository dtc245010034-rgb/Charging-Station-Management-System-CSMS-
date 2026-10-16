const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');

describe('S-42 AC: station and connector power declarations', () => {
  let owner;
  let otherOwner;
  let station;
  let connectors;

  const patch = (url, body, user = owner) => request(app).patch(url).set('Cookie', user.cookie).send(body);

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('power-owner@example.com', 'STATION_OWNER');
    otherOwner = await createUser('power-other-owner@example.com', 'STATION_OWNER');
    station = (await postStation(owner, stationBody({ power_limit_kw: 22 }))).body;
    const point = await request(app).post(`/api/stations/${station.id}/charge-points`)
      .set('Cookie', owner.cookie)
      .send({ code: 'POWER-S42', connector_count: 3, power_kw: '7.4' });
    assert.strictEqual(point.status, 201);
    const details = await request(app).get(`/api/stations/${station.id}`).set('Cookie', owner.cookie);
    connectors = details.body.charge_points[0].connectors;
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('S-42 AC: allows over-registration and reports when it clears', async () => {
    const initial = await request(app).get(`/api/stations/${station.id}`).set('Cookie', owner.cookie);
    assert.strictEqual(initial.status, 200);
    assert.deepStrictEqual(initial.body.power, { limitKw: 22, ratedTotalKw: 22.2, oversubscribed: true });

    const changedConnector = await patch(`/api/connectors/${connectors[2].id}/power`, { rated_power_kw: '11.0' });
    assert.strictEqual(changedConnector.status, 200, JSON.stringify(changedConnector.body));
    const stillOver = await request(app).get(`/api/stations/${station.id}`).set('Cookie', owner.cookie);
    assert.deepStrictEqual(stillOver.body.power, { limitKw: 22, ratedTotalKw: 25.8, oversubscribed: true });

    const resetConnector = await patch(`/api/connectors/${connectors[2].id}/power`, { rated_power_kw: '7.0' });
    assert.strictEqual(resetConnector.status, 200, JSON.stringify(resetConnector.body));
    const withinLimit = await request(app).get(`/api/stations/${station.id}`).set('Cookie', owner.cookie);
    assert.deepStrictEqual(withinLimit.body.power, { limitKw: 22, ratedTotalKw: 21.8, oversubscribed: false });
    assert.strictEqual(withinLimit.body.charge_points[0].connectors[2].power.ratedKw, 7);
  });

  it('S-42 AC: rejects power updates outside the owner scope and invalid kW values', async () => {
    assert.strictEqual((await patch(`/api/stations/${station.id}`, { power_limit_kw: 23 }, otherOwner)).status, 403);
    assert.strictEqual((await patch(`/api/connectors/${connectors[0].id}/power`, { rated_power_kw: 8 }, otherOwner)).status, 403);
    for (const power_limit_kw of [0, -1, 1000000000, '22.55']) {
      assert.strictEqual((await patch(`/api/stations/${station.id}`, { power_limit_kw })).status, 400);
    }
    const stored = await query('SELECT power_limit_w FROM stations WHERE id = $1', [station.id]);
    assert.strictEqual(stored.rows[0].power_limit_w, 22000);
  });
});
