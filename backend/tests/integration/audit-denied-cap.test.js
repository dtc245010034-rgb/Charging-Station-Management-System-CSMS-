const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');

describe('#29: ACCESS_DENIED không làm phình audit_logs', () => {
  let attacker;
  let victimStationId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    attacker = await createUser('audit-attacker@test.invalid', 'STATION_OWNER');
    const victim = await createUser('audit-victim@test.invalid', 'STATION_OWNER');
    victimStationId = (await postStation(victim, stationBody({ name: 'Trạm nạn nhân' }))).body.id;
  });

  after(async () => {
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('spam 100 request 403 chỉ ghi tối đa 20 dòng/phút cho mỗi tài khoản, vẫn trả 403', async () => {
    for (let index = 0; index < 100; index += 1) {
      const response = await request(app).get(`/api/stations/${victimStationId}`).set('Cookie', attacker.cookie);
      assert.equal(response.status, 403);
    }
    const rows = (await query("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ACCESS_DENIED' AND user_id = $1", [attacker.id])).rows[0].n;
    assert.equal(rows, 20);
  });
});
