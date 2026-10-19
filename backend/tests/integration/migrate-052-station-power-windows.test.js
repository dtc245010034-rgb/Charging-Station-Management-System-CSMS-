'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 052: station_power_windows [GYM-71]', () => {
  let stationId;
  let ownerId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);

    const user = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Owner', 'owner-052@test.invalid', 'hash') RETURNING id"
    );
    ownerId = user.rows[0].id;
    const station = await query(
      "INSERT INTO stations (name, address, owner_id, power_limit_w) VALUES ('Station 052', 'Addr', $1, 22000) RETURNING id",
      [ownerId]
    );
    stationId = station.rows[0].id;
  });

  after(resetSchema);

  it('W09: chèn khung hợp lệ, khung liền kề và chặn khung chồng lấn (EXCLUDE 23P01)', async () => {
    // Chèn khung 17:00-20:00 (1020-1200)
    const ins1 = await query(
      'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [stationId, 1020, 1200, 11000, ownerId]
    );
    assert.ok(ins1.rows[0].id);

    // Chèn khung liền kề 20:00-22:00 (1200-1320) -> hợp lệ
    const ins2 = await query(
      'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [stationId, 1200, 1320, 15000, ownerId]
    );
    assert.ok(ins2.rows[0].id);

    // Chèn khung chồng lấn 18:00-21:00 (1080-1260) -> bị chặn bởi EXCLUDE constraint (code 23P01)
    await assert.rejects(
      query(
        'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by) VALUES ($1, $2, $3, $4, $5)',
        [stationId, 1080, 1260, 12000, ownerId]
      ),
      (err) => err.code === '23P01'
    );
  });

  it('Xoá mềm (deleted_at IS NOT NULL) cho phép chèn lại cùng khung giờ', async () => {
    // Đánh dấu xoá mềm khung 20:00-22:00
    await query(
      'UPDATE station_power_windows SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE start_minute = 1200 AND station_id = $2',
      [ownerId, stationId]
    );

    // Chèn lại khung 20:00-22:00 -> thành công vì WHERE deleted_at IS NULL
    const ins3 = await query(
      'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [stationId, 1200, 1320, 18000, ownerId]
    );
    assert.ok(ins3.rows[0].id);
  });

  it('Chặn end_minute <= start_minute và limit_w <= 0', async () => {
    await assert.rejects(
      query(
        'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w) VALUES ($1, 600, 600, 10000)',
        [stationId]
      ),
      (err) => err.code === '23514'
    );

    await assert.rejects(
      query(
        'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w) VALUES ($1, 600, 500, 10000)',
        [stationId]
      ),
      (err) => err.code === '23514'
    );

    await assert.rejects(
      query(
        'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w) VALUES ($1, 100, 200, 0)',
        [stationId]
      ),
      (err) => err.code === '23514'
    );
  });
});
