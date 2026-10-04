const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const service = require('../../src/modules/fleet-status/fleet-status.service');

describe('S-11 T-23: trạng thái cây trạm, trụ, đầu nối', () => {
  let owner;
  let otherOwner;
  let operator;
  let stationA;
  let stationB;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('fleet-owner@example.com', 'STATION_OWNER');
    otherOwner = await createUser('fleet-other-owner@example.com', 'STATION_OWNER');
    operator = await createUser('fleet-operator@example.com', 'OPERATOR');
    stationA = (await postStation(owner, stationBody({ name: 'Trạm theo dõi A' }))).body;
    stationB = (await postStation(otherOwner, stationBody({ name: 'Trạm theo dõi B' }))).body;

    await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      SELECT $1, 'T23-' || lpad(point_no::text, 2, '0'), 'ONLINE', 60, CURRENT_TIMESTAMP
      FROM generate_series(1, 50) AS point_no
    `, [stationA.id]);
    await query(`
      INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
      SELECT cp.id, connector_no, 'AVAILABLE', 'Available'
      FROM charge_points cp
      CROSS JOIN generate_series(1, 4) AS connector_no
      WHERE cp.station_id = $1 AND cp.code LIKE 'T23-%'
    `, [stationA.id]);
    await query(`
      UPDATE charge_points SET last_seen_at = CURRENT_TIMESTAMP - INTERVAL '3 minutes'
      WHERE station_id = $1 AND code = 'T23-01'
    `, [stationA.id]);
    await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      VALUES ($1, 'T23-OTHER-01', 'OFFLINE', 60, CURRENT_TIMESTAMP)
      RETURNING id
    `, [stationB.id]).then(({ rows }) => query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'OCCUPIED', 'Charging')",
      [rows[0].id],
    ));
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('trả cây ba tầng và giới hạn đúng theo chủ sở hữu', async () => {
    const ownerResult = await request(app).get('/api/fleet-status').set('Cookie', owner.cookie);
    assert.strictEqual(ownerResult.status, 200);
    assert.strictEqual(ownerResult.body.stations.length, 1);
    assert.strictEqual(String(ownerResult.body.stations[0].id), String(stationA.id));
    assert.strictEqual(ownerResult.body.stations[0].charge_points.length, 50);
    assert.strictEqual(ownerResult.body.stations[0].charge_points.reduce((sum, point) => sum + point.connectors.length, 0), 200);

    const offlinePoint = ownerResult.body.stations[0].charge_points.find((point) => point.code === 'T23-01');
    assert.strictEqual(offlinePoint.offline, true);
    assert.ok(offlinePoint.last_seen_at);
    assert.deepStrictEqual(offlinePoint.connectors[0], {
      id: offlinePoint.connectors[0].id,
      connector_no: 1,
      status: 'AVAILABLE',
      ocpp_status: 'Available',
    });

    const otherOwnerResult = await request(app).get('/api/fleet-status').set('Cookie', otherOwner.cookie);
    assert.strictEqual(otherOwnerResult.status, 200);
    assert.strictEqual(otherOwnerResult.body.stations.length, 1);
    assert.strictEqual(String(otherOwnerResult.body.stations[0].id), String(stationB.id));
    assert.strictEqual(otherOwnerResult.body.stations[0].charge_points[0].offline, true);
    assert.ok(otherOwnerResult.body.stations[0].charge_points[0].last_seen_at);

    const operatorResult = await request(app).get('/api/fleet-status').set('Cookie', operator.cookie);
    assert.strictEqual(operatorResult.status, 200);
    assert.strictEqual(operatorResult.body.stations.length, 2);
    assert.strictEqual(operatorResult.body.stations.reduce((sum, station) => sum + station.charge_points.length, 0), 51);

    const driver = await createUser('fleet-driver@example.com', 'DRIVER');
    assert.strictEqual((await request(app).get('/api/fleet-status').set('Cookie', driver.cookie)).status, 403);
  });

  it('đọc 50 trụ và 200 đầu nối bằng đúng một truy vấn dưới 200 ms', async () => {
    const { pool } = require('../../src/db/pool');
    const originalQuery = pool.query;
    let queryCount = 0;
    pool.query = function (...args) {
      queryCount += 1;
      return originalQuery.apply(this, args);
    };

    try {
      const start = performance.now();
      const result = await service.snapshot({ id: owner.id, roles: ['STATION_OWNER'] });
      const elapsedMs = performance.now() - start;
      const points = result.stations.flatMap((station) => station.charge_points);
      const connectorCount = points.reduce((sum, point) => sum + point.connectors.length, 0);

      console.log(`T-23 measured query+tree time: ${elapsedMs.toFixed(2)} ms (50 charge points, 200 connectors)`);
      assert.strictEqual(points.length, 50);
      assert.strictEqual(connectorCount, 200);
      assert.strictEqual(queryCount, 1);
      assert.ok(elapsedMs < 200, `T-23 snapshot took ${elapsedMs.toFixed(2)} ms; expected < 200 ms`);
    } finally {
      pool.query = originalQuery;
    }
  });
});
