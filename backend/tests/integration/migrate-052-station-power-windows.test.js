'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema, rollbackToMigration } = require('../helpers/db');

describe('migration 052: station power windows', () => {
  let stationId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.equal(migrated.status, 0, migrated.stderr);
    const owner = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Power window owner', 'm052-owner@test.invalid', 'hash') RETURNING id"
    );
    const station = await query(
      'INSERT INTO stations (name, address, owner_id, power_limit_w) VALUES ($1, $2, $3, 22000) RETURNING id',
      ['Power window station', 'Test', owner.rows[0].id]
    );
    stationId = station.rows[0].id;
  });

  after(resetSchema);

  it('S-45 AC: rejects overlapping windows while allowing adjacent windows', async () => {
    await query(
      'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by) VALUES ($1, 1020, 1200, 11000, NULL)',
      [stationId]
    );
    await assert.rejects(
      query(
        'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by) VALUES ($1, 1199, 1260, 9000, NULL)',
        [stationId]
      ),
      (error) => error.code === '23P01'
    );
    await query(
      'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by) VALUES ($1, 1200, 1320, 8000, NULL)',
      [stationId]
    );
  });

  it('S-45 AC: migration 052 rolls back and reapplies', async () => {
    await rollbackToMigration('052_station_power_windows.sql');
    const down = run('src/db/migrate.js', ['down']);
    assert.equal(down.status, 0, down.stderr);
    const absent = await query("SELECT to_regclass('public.station_power_windows') AS table_name");
    assert.equal(absent.rows[0].table_name, null);

    const up = run('src/db/migrate.js');
    assert.equal(up.status, 0, up.stderr);
    const present = await query("SELECT to_regclass('public.station_power_windows') AS table_name");
    assert.equal(present.rows[0].table_name, 'station_power_windows');
  });
});
