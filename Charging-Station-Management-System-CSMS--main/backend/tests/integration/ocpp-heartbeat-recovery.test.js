const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { pool } = require('../../src/db/pool');
const { scanStaleChargePoints } = require('../../src/modules/charge-points/offline-job');
const presence = require('../../src/modules/charge-points/presence');
const { subscribe } = require('../../src/modules/fleet-status/fleet-status.events');

const CODE = 'F9-CP-1';

describe('F9: Heartbeat đưa trụ OFFLINE/UNKNOWN về ONLINE thì đầu nối phục hồi từ ocpp_status', () => {
  let stationId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('owner-f9@test.invalid', 'STATION_OWNER');
    stationId = (await query('INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id', ['F9 station', 'Test', owner.id])).rows[0].id;
  });
  after(async () => { await closePool(); await resetSchema(); });

  beforeEach(async () => {
    await query('DELETE FROM charge_points');
    await query('UPDATE stations SET locked_at = NULL WHERE id = $1', [stationId]);
    const cp = await query(
      "INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at) VALUES ($1, $2, 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '10 minutes') RETURNING id",
      [stationId, CODE]
    );
    const id = cp.rows[0].id;
    await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES
         ($1, 1, 'OCCUPIED', 'Charging'), ($1, 2, 'UNAVAILABLE', 'Unavailable'), ($1, 3, 'ERROR', 'Faulted'),
         ($1, 4, 'UNKNOWN', NULL)`,
      [id]
    );
  });

  const state = async () => ({
    cp: (await query('SELECT status FROM charge_points WHERE code = $1', [CODE])).rows[0].status,
    connectors: (await query('SELECT c.connector_no, c.status FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = $1 ORDER BY c.connector_no', [CODE])).rows.map((row) => row.status),
  });

  it('ONLINE có đầu nối Charging → quá hạn → job: OFFLINE + UNKNOWN → Heartbeat: ONLINE + OCCUPIED', async () => {
    await scanStaleChargePoints();
    assert.deepEqual(await state(), { cp: 'OFFLINE', connectors: ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'] });

    await presence.markChargePointSeen(pool, CODE);
    assert.deepEqual(await state(), { cp: 'ONLINE', connectors: ['OCCUPIED', 'UNAVAILABLE', 'ERROR', 'UNKNOWN'] });
  });

  it('trụ UNKNOWN (mất kết nối) nối lại cũng phục hồi đầu nối, last_seen_at được cập nhật', async () => {
    await presence.markChargePointOffline(pool, CODE);
    assert.equal((await state()).cp, 'UNKNOWN');
    await presence.markChargePointSeen(pool, CODE);
    assert.deepEqual(await state(), { cp: 'ONLINE', connectors: ['OCCUPIED', 'UNAVAILABLE', 'ERROR', 'UNKNOWN'] });
    const age = (await query("SELECT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - last_seen_at) AS s FROM charge_points WHERE code = $1", [CODE])).rows[0].s;
    assert.ok(Number(age) < 5);
  });

  it('phát sự kiện SSE khi phục hồi, không phát khi trụ đã ONLINE', async () => {
    await scanStaleChargePoints();
    const events = [];
    const unsubscribe = subscribe((event) => events.push(event));
    try {
      await presence.markChargePointSeen(pool, CODE);
      assert.equal(events.length, 1);
      assert.equal(events[0].stationId, stationId);
      await presence.markChargePointSeen(pool, CODE);
      assert.equal(events.length, 1);
    } finally {
      unsubscribe();
    }
  });

  it('trụ đã ONLINE: đầu nối giữ nguyên, chỉ cập nhật last_seen_at', async () => {
    await query("UPDATE connectors SET status = 'AVAILABLE' WHERE connector_no = 1");
    await presence.markChargePointSeen(pool, CODE);
    assert.deepEqual(await state(), { cp: 'ONLINE', connectors: ['AVAILABLE', 'UNAVAILABLE', 'ERROR', 'UNKNOWN'] });
  });

  it('trạm bị khoá: không đổi gì', async () => {
    await scanStaleChargePoints();
    await query('UPDATE stations SET locked_at = CURRENT_TIMESTAMP WHERE id = $1', [stationId]);
    await presence.markChargePointSeen(pool, CODE);
    assert.equal((await state()).cp, 'OFFLINE');
  });
});
