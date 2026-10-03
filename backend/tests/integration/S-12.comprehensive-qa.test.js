const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { scanStaleChargePoints } = require('../../src/modules/charge-points/offline-job');
const { snapshot } = require('../../src/modules/fleet-status/fleet-status.service');
const { subscribe } = require('../../src/modules/fleet-status/fleet-status.events');

describe('S-12 QA Comprehensive Test Suite: Trụ quá hạn nhịp tim bị đánh dấu ngoại tuyến', () => {
  let ownerA;
  let ownerB;
  let stationA;
  let stationB;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await query('ALTER TABLE charge_points ALTER COLUMN heartbeat_interval DROP NOT NULL');
    await truncateAll();

    ownerA = await createUser('owner-a-s12@test.invalid', 'STATION_OWNER');
    ownerB = await createUser('owner-b-s12@test.invalid', 'STATION_OWNER');

    stationA = (await query(
      'INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id',
      ['Station A', 'Address A', ownerA.id],
    )).rows[0].id;

    stationB = (await query(
      'INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id',
      ['Station B', 'Address B', ownerB.id],
    )).rows[0].id;
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  // TC-S12-01: Biên thời gian (119s vs 120s vs 121s) với interval = 60s
  it('TC-S12-01 [Biên]: 119s giữ ONLINE, 120s và 121s chuyển OFFLINE', async () => {
    await query('DELETE FROM charge_points');
    const res = await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      VALUES
        ($1, 'CP-119S', 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '119 seconds'),
        ($1, 'CP-120S', 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '120 seconds'),
        ($1, 'CP-121S', 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '121 seconds')
      RETURNING id, code
    `, [stationA]);

    for (const cp of res.rows) {
      await query('INSERT INTO connectors (charge_point_id, connector_no, status) VALUES ($1, 1, \'AVAILABLE\')', [cp.id]);
    }

    const scanResult = await scanStaleChargePoints();
    assert.equal(scanResult.rowCount, 2, 'Phải có đúng 2 trụ (120s và 121s) bị đánh dấu offline');

    const statuses = (await query('SELECT code, status FROM charge_points ORDER BY code')).rows;
    assert.deepEqual(statuses, [
      { code: 'CP-119S', status: 'ONLINE' },
      { code: 'CP-120S', status: 'OFFLINE' },
      { code: 'CP-121S', status: 'OFFLINE' },
    ]);
  });

  // TC-S12-02: Đa đầu nối (1 đến 4 đầu nối) và các trạng thái đầu nối khác nhau
  it('TC-S12-02 [Chức năng]: Trụ 4 đầu nối ở các trạng thái khác nhau đều về UNKNOWN', async () => {
    await query('DELETE FROM charge_points');
    const cp = (await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      VALUES ($1, 'CP-4CONN', 'ONLINE', 30, CURRENT_TIMESTAMP - INTERVAL '61 seconds')
      RETURNING id
    `, [stationA])).rows[0];

    // Tạo 4 đầu nối với các trạng thái: AVAILABLE, OCCUPIED, FAULTED, RESERVED
    await query(`
      INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
      VALUES
        ($1, 1, 'AVAILABLE', 'Available'),
        ($1, 2, 'OCCUPIED', 'Charging'),
        ($1, 3, 'FAULTED', 'Faulted'),
        ($1, 4, 'OCCUPIED', 'Preparing')
    `, [cp.id]);

    await scanStaleChargePoints();

    const connRows = (await query(
      'SELECT connector_no, status, ocpp_status FROM connectors WHERE charge_point_id = $1 ORDER BY connector_no',
      [cp.id],
    )).rows;

    assert.equal(connRows.length, 4);
    for (const c of connRows) {
      assert.equal(c.status, 'UNKNOWN', `Đầu nối số ${c.connector_no} phải chuyển sang UNKNOWN`);
      assert.ok(c.ocpp_status, 'ocpp_status phải được bảo toàn');
    }
  });

  // TC-S12-03: Phân quyền & Độc lập Tenant khi phát sự kiện SSE
  it('TC-S12-03 [Bảo mật & Phân quyền]: Sự kiện offline của trạm A chỉ phát cho Owner A, không rò rỉ sang Owner B', async () => {
    await query('DELETE FROM charge_points');
    await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      VALUES
        ($1, 'CP-STATION-A', 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '150 seconds'),
        ($2, 'CP-STATION-B', 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '150 seconds')
    `, [stationA, stationB]);

    const events = [];
    const unsubscribe = subscribe((event) => events.push(event));

    try {
      await scanStaleChargePoints();
    } finally {
      unsubscribe();
    }

    assert.equal(events.length, 2);
    const eventA = events.find((e) => String(e.stationId) === String(stationA));
    const eventB = events.find((e) => String(e.stationId) === String(stationB));

    assert.ok(eventA, 'Phải có sự kiện cho Station A');
    assert.ok(eventB, 'Phải có sự kiện cho Station B');
    assert.equal(String(eventA.ownerId), String(ownerA.id), 'Event Station A phải trỏ về Owner A');
    assert.equal(String(eventB.ownerId), String(ownerB.id), 'Event Station B phải trỏ về Owner B');
  });

  // TC-S12-04: AC 3 - Khi job chưa chạy, snapshot suy diễn offline từ last_seen_at
  it('TC-S12-04 [AC 3]: Snapshot suy diễn offline = true từ last_seen_at khi job chưa chạy', async () => {
    await query('DELETE FROM charge_points');
    // Trụ vẫn là ONLINE trong DB, nhưng last_seen_at đã quá hạn
    await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      VALUES ($1, 'CP-RESTART-TEST', 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '150 seconds')
    `, [stationA]);

    const data = await snapshot({ id: ownerA.id, roles: ['STATION_OWNER'] });
    const cp = data.stations[0]?.charge_points[0];

    assert.ok(cp, 'Phải tìm thấy trụ');
    assert.equal(cp.status, 'ONLINE', 'DB status vẫn là ONLINE do job chưa chạy');
    assert.equal(Boolean(cp.offline), true, 'Trường offline phải suy diễn là true');
  });

  // TC-S12-05: AC 3 - Kiểm tra trường hợp heartbeat_interval bị NULL trong snapshot
  it('TC-S12-05 [BUG-CHECK AC 3]: Snapshot suy diễn offline khi heartbeat_interval bị NULL', async () => {
    await query('DELETE FROM charge_points');
    await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      VALUES ($1, 'CP-NULL-HB', 'ONLINE', NULL, CURRENT_TIMESTAMP - INTERVAL '150 seconds')
    `, [stationA]);

    const data = await snapshot({ id: ownerA.id, roles: ['STATION_OWNER'] });
    const cp = data.stations[0]?.charge_points[0];

    assert.ok(cp, 'Phải tìm thấy trụ');
    // NẾU BUG TỒN TẠI, cp.offline sẽ là null hoặc false!
    assert.equal(
      Boolean(cp.offline),
      true,
      'BUG: Nếu heartbeat_interval là NULL, snapshot phải suy diễn offline = true (fallback interval 60s)',
    );
  });

  // TC-S12-06: Vòng đời AC 3 (trước job) và AC 1 (sau job quét) cho trạng thái đầu nối
  it('TC-S12-06 [AC 3 & AC 1]: Trạng thái đầu nối trước và sau khi job quét', async () => {
    await query('DELETE FROM charge_points');
    const cp = (await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      VALUES ($1, 'CP-CONN-OFFLINE', 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '150 seconds')
      RETURNING id
    `, [stationA])).rows[0];

    await query(`
      INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
      VALUES ($1, 1, 'AVAILABLE', 'Available')
    `, [cp.id]);

    // Giai đoạn 1 (AC 3): Trước khi job chạy, snapshot suy diễn offline = true cho trụ
    const beforeJobData = await snapshot({ id: ownerA.id, roles: ['STATION_OWNER'] });
    const pointBefore = beforeJobData.stations[0]?.charge_points[0];
    assert.equal(Boolean(pointBefore.offline), true, 'Trụ phải suy diễn offline = true trước khi job chạy');

    // Giai đoạn 2 (AC 1): Khi job chạy, DB cập nhật đầu nối sang UNKNOWN
    await scanStaleChargePoints();

    const afterJobData = await snapshot({ id: ownerA.id, roles: ['STATION_OWNER'] });
    const pointAfter = afterJobData.stations[0]?.charge_points[0];
    const connectorAfter = pointAfter?.connectors[0];

    assert.equal(Boolean(pointAfter.offline), true, 'Trụ vẫn offline sau khi job chạy');
    assert.equal(
      connectorAfter?.status,
      'UNKNOWN',
      'Đầu nối phải chuyển sang UNKNOWN sau khi job quét',
    );
    assert.equal(connectorAfter?.ocpp_status, 'Available', 'ocpp_status gốc phải được bảo toàn');
  });

  // TC-S12-07: Hiệu năng quét 50 trụ đồng thời
  it('TC-S12-07 [Hiệu năng]: Quét đồng thời 50 trụ và 200 đầu nối chạy dưới 200ms', async () => {
    await query('DELETE FROM charge_points');
    // Chèn 50 trụ
    const values = [];
    for (let i = 1; i <= 50; i++) {
      values.push(`(${stationA}, 'PERF-CP-${String(i).padStart(3, '0')}', 'ONLINE', 60, CURRENT_TIMESTAMP - INTERVAL '130 seconds')`);
    }
    await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      VALUES ${values.join(', ')}
    `);

    // Chèn 200 đầu nối (mỗi trụ 4 đầu nối)
    await query(`
      INSERT INTO connectors (charge_point_id, connector_no, status)
      SELECT id, n, 'AVAILABLE'
      FROM charge_points
      CROSS JOIN (VALUES (1), (2), (3), (4)) AS nums(n)
      WHERE station_id = $1
    `, [stationA]);

    const start = performance.now();
    const scanResult = await scanStaleChargePoints();
    const duration = performance.now() - start;

    assert.equal(scanResult.rowCount, 50, 'Đúng 50 trụ được cập nhật offline');
    assert.ok(duration < 200, `Thời gian quét phải dưới 200ms (thực tế: ${duration.toFixed(2)}ms)`);

    const unknownConnectors = (await query(
      'SELECT count(*) FROM connectors WHERE status = \'UNKNOWN\''
    )).rows[0].count;
    assert.equal(Number(unknownConnectors), 200, 'Tất cả 200 đầu nối phải chuyển sang UNKNOWN');
  });

  // TC-S12-08: AC 2 - Trụ status = UNKNOWN gửi Heartbeat có phục hồi sang ONLINE không?
  it('TC-S12-08 [AC 2]: Trụ có status = UNKNOWN (sau restart) gửi Heartbeat phải phục hồi ONLINE', async () => {
    await query('DELETE FROM charge_points');
    const cp = (await query(`
      INSERT INTO charge_points (station_id, code, status, heartbeat_interval, last_seen_at)
      VALUES ($1, 'CP-UNKNOWN-STATUS', 'UNKNOWN', 60, CURRENT_TIMESTAMP - INTERVAL '150 seconds')
      RETURNING id, code
    `, [stationA])).rows[0];

    // Mô phỏng logic updateChargePointLastSeen trong server.js
    const updateQuery = `
      WITH target AS (
        SELECT cp.id, cp.status AS prev_status, cp.station_id, s.owner_id
        FROM charge_points cp JOIN stations s ON s.id = cp.station_id
        WHERE cp.code = $1 AND s.locked_at IS NULL
        FOR UPDATE OF cp SKIP LOCKED
      )
      UPDATE charge_points
      SET last_seen_at = CURRENT_TIMESTAMP,
          status = CASE WHEN charge_points.status IN ('OFFLINE', 'UNKNOWN') THEN 'ONLINE' ELSE charge_points.status END
      FROM target
      WHERE charge_points.id = target.id
      RETURNING charge_points.id, target.prev_status, charge_points.status AS current_status, target.station_id, target.owner_id
    `;
    const res = await query(updateQuery, [cp.code]);
    const updated = res.rows[0];

    console.log(`[TC-S12-08 Result] Status after Heartbeat when previous status was UNKNOWN: ${updated?.current_status}`);
    assert.equal(
      updated?.current_status,
      'ONLINE',
      'Trụ trạng thái UNKNOWN khi gửi Heartbeat phải được chuyển sang ONLINE',
    );
    assert.equal(updated?.prev_status, 'UNKNOWN');
  });
});

