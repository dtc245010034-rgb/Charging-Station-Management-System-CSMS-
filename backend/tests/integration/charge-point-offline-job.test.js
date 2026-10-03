const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { scanStaleChargePoints } = require('../../src/modules/charge-points/offline-job');
const { subscribe } = require('../../src/modules/fleet-status/fleet-status.events');

describe('Job nền: phát hiện trụ mất heartbeat', () => {
  let stationId;
  let ownerId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('offline-job-owner@test.invalid', 'STATION_OWNER');
    ownerId = owner.id;
    stationId = (await query(
      'INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id',
      ['Offline job station', 'Test', owner.id],
    )).rows[0].id;
    await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      VALUES
        ($1, 'JOB-STALE', 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '121 seconds'),
        ($1, 'JOB-RECENT', 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '119 seconds'),
        ($1, 'JOB-NEVER-SEEN', 'ONLINE', 60, NULL),
        ($1, 'JOB-NULL-HEARTBEAT', 'ONLINE', NULL, CURRENT_TIMESTAMP - INTERVAL '121 seconds')
    `, [stationId]);
    await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status)
       SELECT id, 1, 'AVAILABLE' FROM charge_points WHERE station_id = $1`,
      [stationId],
    );
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('chuyển trụ quá hai chu kỳ theo giờ DB, bỏ trụ còn hạn và chạy lại không cập nhật gì', async () => {
    const events = [];
    const unsubscribe = subscribe((event) => events.push(event));
    let firstScan;
    try {
      firstScan = await scanStaleChargePoints();
    } finally {
      unsubscribe();
    }

    assert.equal(firstScan.rowCount, 3);
    assert.deepEqual(
      (await query('SELECT code, status FROM charge_points ORDER BY code')).rows,
      [
        { code: 'JOB-NEVER-SEEN', status: 'OFFLINE' },
        { code: 'JOB-NULL-HEARTBEAT', status: 'OFFLINE' },
        { code: 'JOB-RECENT', status: 'ONLINE' },
        { code: 'JOB-STALE', status: 'OFFLINE' },
      ],
    );
    assert.deepEqual(
      (await query(`
        SELECT cp.code, c.status
        FROM connectors c
        JOIN charge_points cp ON cp.id = c.charge_point_id
        ORDER BY cp.code
      `)).rows,
      [
        { code: 'JOB-NEVER-SEEN', status: 'UNKNOWN' },
        { code: 'JOB-NULL-HEARTBEAT', status: 'UNKNOWN' },
        { code: 'JOB-RECENT', status: 'AVAILABLE' },
        { code: 'JOB-STALE', status: 'UNKNOWN' },
      ],
    );
    assert.equal(events.length, 3);
    assert.ok(events.every((event) => String(event.stationId) === String(stationId)));
    assert.ok(events.every((event) => String(event.ownerId) === String(ownerId)));
    assert.ok(events.every((event) => event.chargePointId));

    const timestampsAfterFirstScan = (await query(
      'SELECT code, updated_at FROM charge_points ORDER BY code',
    )).rows;
    const secondScan = await scanStaleChargePoints();
    const timestampsAfterSecondScan = (await query(
      'SELECT code, updated_at FROM charge_points ORDER BY code',
    )).rows;

    assert.equal(secondScan.rowCount, 0);
    assert.deepEqual(timestampsAfterSecondScan, timestampsAfterFirstScan);
  });
});
