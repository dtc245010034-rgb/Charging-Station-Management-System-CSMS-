'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');

describe('S-45 AC: station power windows', () => {
  let owner;
  let otherOwner;
  let station;
  let noBaseStation;

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('s45-owner@test.invalid', 'STATION_OWNER');
    otherOwner = await createUser('s45-other-owner@test.invalid', 'STATION_OWNER');
    station = (await postStation(owner, stationBody({ power_limit_kw: 22 }))).body;
    noBaseStation = (await postStation(otherOwner, stationBody({ name: 'No base station' }))).body;
  });

  after(async () => { await resetSchema(); await closePool(); });

  const postWindow = (stationId, body, user = owner) => request(app)
    .post(`/api/stations/${stationId}/power-windows`)
    .set('Cookie', user.cookie)
    .send(body);

  it('W09: rejects overlapping time windows and accepts adjacent windows', async () => {
    const first = await postWindow(station.id, { startTime: '17:00', endTime: '20:00', limitKw: '11.0' });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const overlap = await postWindow(station.id, { startTime: '18:00', endTime: '21:00', limitKw: '10' });
    assert.equal(overlap.status, 409);

    const adjacent = await postWindow(station.id, { startTime: '20:00', endTime: '22:00', limitKw: '12' });
    assert.equal(adjacent.status, 201, JSON.stringify(adjacent.body));
  });

  it('W10: requires a base limit for windows and prevents removing it while windows remain', async () => {
    const missingBase = await postWindow(noBaseStation.id, {
      startTime: '17:00', endTime: '20:00', limitKw: '11',
    }, otherOwner);
    assert.equal(missingBase.status, 409);
    assert.equal(missingBase.body.error.code, 'BASE_LIMIT_REQUIRED');

    const removeBase = await request(app).patch(`/api/stations/${station.id}`)
      .set('Cookie', owner.cookie)
      .send({ power_limit_kw: null });
    assert.equal(removeBase.status, 409);
  });

  it('W11: restricts windows to the station owner and validates range and positive kW', async () => {
    const denied = await postWindow(station.id, {
      startTime: '17:00', endTime: '20:00', limitKw: '11',
    }, otherOwner);
    assert.equal(denied.status, 403);
    const deniedAudit = await query(
      "SELECT action FROM audit_logs WHERE action = 'ACCESS_DENIED' AND entity = 'station' AND entity_id = $1",
      [station.id]
    );
    assert.ok(deniedAudit.rowCount > 0);

    for (const body of [
      { startTime: '17:00', endTime: '17:00', limitKw: '11' },
      { startTime: '17:00', endTime: '20:00', limitKw: '0' },
      { startTime: '17:00', endTime: '20:00', limitKw: '-1' },
    ]) {
      assert.equal((await postWindow(station.id, body)).status, 400);
    }
  });
});
