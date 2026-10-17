const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { pool } = require('../../src/db/pool');
const { scanChargePointHealth } = require('../../src/modules/charge-points/charge-point-health-job');

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
      "INSERT INTO stations (name, address, owner_id) VALUES ('S46 station', 'Test', $1) RETURNING id",
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
      'SELECT kind, notified_at FROM alerts WHERE charge_point_id = $1',
      [offlinePointId]
    );
    assert.equal(alert.rows[0].kind, 'CHARGE_POINT_OFFLINE');
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
      'SELECT kind, notified_at FROM alerts WHERE charge_point_id = $1',
      [point.rows[0].id]
    );
    assert.equal(alert.rows[0].kind, 'CHARGE_POINT_REPEATED_ERRORS');
    assert.ok(alert.rows[0].notified_at);
    assert.equal((await query("SELECT count(*)::int AS n FROM email_outbox WHERE subject = 'Trụ sạc cần kiểm tra'")).rows[0].n, 6);
  });
});
