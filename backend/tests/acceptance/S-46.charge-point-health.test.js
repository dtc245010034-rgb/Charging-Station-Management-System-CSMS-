const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { pool } = require('../../src/db/pool');
const { scanChargePointHealth } = require('../../src/modules/alerts/charge-point-health-job');

describe('S-46 AC: prolonged offline and repeated charge-point errors notify operators', () => {
  let admin;
  let operator;
  let owner;
  let stationId;
  let offlinePointId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.equal(migrated.status, 0, migrated.stderr);
    admin = await createUser('s46-admin@test.invalid', 'ADMIN');
    operator = await createUser('s46-operator@test.invalid', 'OPERATOR');
    owner = await createUser('s46-owner@test.invalid', 'STATION_OWNER');
    const station = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ('S46 station', 'Test', $1, 'ACTIVE') RETURNING id",
      [owner.id]
    );
    stationId = station.rows[0].id;
    const point = await query(
      `INSERT INTO charge_points (station_id, code, status, last_seen_at)
       VALUES ($1, 'S46-OFFLINE', 'OFFLINE', CURRENT_TIMESTAMP - INTERVAL '11 minutes')
       RETURNING id`,
      [stationId]
    );
    offlinePointId = point.rows[0].id;
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('tạo alert và enqueue email cho ADMIN, OPERATOR, chủ trạm; lần quét sau không gửi trùng', async () => {
    const first = await scanChargePointHealth({ db: pool });
    assert.equal(first.created, 1);
    const alert = await query(
      'SELECT kind, dedup_key, notified_at FROM alerts WHERE charge_point_id = $1',
      [offlinePointId]
    );
    assert.equal(alert.rows[0].kind, 'CP_OFFLINE');
    assert.equal(alert.rows[0].dedup_key, `cp:${offlinePointId}`);
    assert.ok(alert.rows[0].notified_at);

    const recipients = await query(
      `SELECT u.id FROM email_outbox e JOIN users u ON u.id = e.user_id
       WHERE e.subject = 'Trụ sạc cần kiểm tra' ORDER BY u.id`
    );
    assert.deepEqual(recipients.rows.map((row) => String(row.id)).sort(), [String(admin.id), String(operator.id), String(owner.id)].sort());

    const second = await scanChargePointHealth({ db: pool });
    assert.equal(second.created, 0);
    assert.equal((await query("SELECT count(*)::int AS n FROM email_outbox WHERE subject = 'Trụ sạc cần kiểm tra'")).rows[0].n, 3);
  });

  it('tạo cảnh báo khi có đúng 5 lỗi trong 30 phút, không cảnh báo ở 4 lỗi', async () => {
    const point = await query(
      `INSERT INTO charge_points (station_id, code, status, last_seen_at)
       VALUES ($1, 'S46-ERROR', 'ONLINE', CURRENT_TIMESTAMP)
       RETURNING id`,
      [stationId]
    );
    for (let index = 0; index < 4; index += 1) {
      await query(
        `INSERT INTO connector_errors (charge_point_id, error_code, recorded_at)
         VALUES ($1, 'InternalError', CURRENT_TIMESTAMP - INTERVAL '1 minute')`,
        [point.rows[0].id]
      );
    }
    assert.equal((await scanChargePointHealth({ db: pool })).created, 0);
    await query(
      `INSERT INTO connector_errors (charge_point_id, error_code, recorded_at)
       VALUES ($1, 'InternalError', CURRENT_TIMESTAMP)`,
      [point.rows[0].id]
    );

    assert.equal((await scanChargePointHealth({ db: pool })).created, 1);
    const alert = await query(
      'SELECT kind, dedup_key, notified_at FROM alerts WHERE charge_point_id = $1',
      [point.rows[0].id]
    );
    assert.equal(alert.rows[0].kind, 'CP_ERRORS');
    assert.equal(alert.rows[0].dedup_key, `cp:${point.rows[0].id}`);
    assert.ok(alert.rows[0].notified_at);
    assert.equal((await query("SELECT count(*)::int AS n FROM email_outbox WHERE subject = 'Trụ sạc cần kiểm tra'")).rows[0].n, 6);
  });

  it('A06: trạm đang MAINTENANCE hoặc INACTIVE thì không cảnh báo', async () => {
    const maintStation = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ('Maint station', 'Test', $1, 'MAINTENANCE') RETURNING id",
      [owner.id]
    );
    await query(
      `INSERT INTO charge_points (station_id, code, status, last_seen_at)
       VALUES ($1, 'S46-MAINT-OFFLINE', 'OFFLINE', CURRENT_TIMESTAMP - INTERVAL '15 minutes')`,
      [maintStation.rows[0].id]
    );
    const res = await scanChargePointHealth({ db: pool });
    assert.equal(res.created, 0);
  });

  it('K4/A08: lỗi gửi email không làm mất cảnh báo, notified_at giữ NULL', async () => {
    const point = await query(
      `INSERT INTO charge_points (station_id, code, status, last_seen_at)
       VALUES ($1, 'S46-FAIL-EMAIL', 'OFFLINE', CURRENT_TIMESTAMP - INTERVAL '20 minutes')
       RETURNING id`,
      [stationId]
    );
    const res = await scanChargePointHealth({ db: pool, simulateEmailFailure: true });
    assert.equal(res.created, 1);
    const alert = await query(
      'SELECT kind, notified_at FROM alerts WHERE charge_point_id = $1',
      [point.rows[0].id]
    );
    assert.equal(alert.rows[0].kind, 'CP_OFFLINE');
    assert.equal(alert.rows[0].notified_at, null);
  });
});
