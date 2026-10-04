const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');

describe('F2: GET /api/charge-points trả trạng thái các đầu nối', () => {
  let owner;
  let stationId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('owner-f2@test.invalid', 'STATION_OWNER', 'password123');
    stationId = (await postStation(owner, stationBody({ name: 'Station F2' }))).body.id;
  });
  after(async () => { await resetSchema(); await closePool(); });

  const list = async () => (await request(app).get('/api/charge-points').set('Cookie', owner.cookie)).body;

  it('connector_statuses liệt kê trạng thái từng đầu nối theo thứ tự connector_no', async () => {
    const cp = (await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'F2-CP-01', 'ONLINE') RETURNING id", [stationId])).rows[0].id;
    await query("INSERT INTO connectors (charge_point_id, connector_no, status) VALUES ($1, 2, 'ERROR'), ($1, 1, 'OCCUPIED')", [cp]);
    const points = await list();
    assert.deepEqual(points.find((p) => p.code === 'F2-CP-01').connector_statuses, ['OCCUPIED', 'ERROR']);
  });

  it('trụ chưa có đầu nối trả mảng rỗng, không phải null', async () => {
    await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'F2-CP-02', 'UNKNOWN')", [stationId]);
    const points = await list();
    assert.deepEqual(points.find((p) => p.code === 'F2-CP-02').connector_statuses, []);
  });
});
