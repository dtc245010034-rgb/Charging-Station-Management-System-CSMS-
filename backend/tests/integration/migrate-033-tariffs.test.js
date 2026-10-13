const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 033: tariffs and tariff_periods append-only [GYM-54]', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: tạo bảng tariffs và tariff_periods, cho phép chèn dữ liệu hợp lệ', async () => {
    const ownerRes = await query("INSERT INTO users (name, email, password_hash) VALUES ('Owner', 'owner-m033@test.invalid', 'hash') RETURNING id");
    const ownerId = ownerRes.rows[0].id;
    const stRes = await query("INSERT INTO stations (name, address, latitude, longitude, owner_id) VALUES ('Trạm M033', 'HN', 21, 105, $1) RETURNING id", [ownerId]);
    const stationId = stRes.rows[0].id;

    const tRes = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong, created_by)
       VALUES ($1, 1, '2026-10-12', 15, 1000, $2)
       RETURNING id, version, effective_from`,
      [stationId, ownerId]
    );
    assert.equal(tRes.rows[0].version, 1);
    const tariffId = tRes.rows[0].id;

    const pRes = await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, 0, 1440, 4000, 'Cả ngày')
       RETURNING id, start_minute, end_minute`,
      [tariffId]
    );
    assert.equal(pRes.rows[0].start_minute, 0);
    assert.equal(pRes.rows[0].end_minute, 1440);
  });

  it('ràng buộc UNIQUE chặn trùng version hoặc trùng effective_from trên cùng trạm', async () => {
    const stRes = await query("SELECT id FROM stations LIMIT 1");
    const stationId = stRes.rows[0].id;

    // Trùng version 1
    await assert.rejects(
      query(
        "INSERT INTO tariffs (station_id, version, effective_from) VALUES ($1, 1, '2026-10-13')",
        [stationId]
      ),
      /uq_tariffs_station_version|unique constraint/i
    );

    // Trùng effective_from '2026-10-12'
    await assert.rejects(
      query(
        "INSERT INTO tariffs (station_id, version, effective_from) VALUES ($1, 2, '2026-10-12')",
        [stationId]
      ),
      /uq_tariffs_station_effective_from|unique constraint/i
    );
  });

  it('ràng buộc CHECK chặn start >= end hoặc giá âm', async () => {
    const tRes = await query("SELECT id FROM tariffs LIMIT 1");
    const tariffId = tRes.rows[0].id;

    // start >= end
    await assert.rejects(
      query(
        "INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong) VALUES ($1, 500, 500, 3000)",
        [tariffId]
      ),
      /chk_tariff_period_order|check constraint/i
    );

    // giá âm
    await assert.rejects(
      query(
        "INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong) VALUES ($1, 0, 500, -100)",
        [tariffId]
      ),
      /price_per_kwh_dong|check constraint/i
    );
  });

  it('trigger chặn UPDATE, DELETE, TRUNCATE trên tariffs và tariff_periods', async () => {
    const tRes = await query("SELECT id FROM tariffs LIMIT 1");
    const tariffId = tRes.rows[0].id;

    // UPDATE tariffs
    await assert.rejects(
      query("UPDATE tariffs SET idle_grace_min = 20 WHERE id = $1", [tariffId]),
      /tariffs and tariff_periods are append-only/
    );

    // DELETE tariffs
    await assert.rejects(
      query("DELETE FROM tariffs WHERE id = $1", [tariffId]),
      /tariffs and tariff_periods are append-only/
    );

    // UPDATE tariff_periods
    await assert.rejects(
      query("UPDATE tariff_periods SET price_per_kwh_dong = 5000 WHERE tariff_id = $1", [tariffId]),
      /tariffs and tariff_periods are append-only/
    );

    // DELETE tariff_periods
    await assert.rejects(
      query("DELETE FROM tariff_periods WHERE tariff_id = $1", [tariffId]),
      /tariffs and tariff_periods are append-only/
    );

    // TRUNCATE tariffs
    await assert.rejects(
      query("TRUNCATE tariffs CASCADE"),
      /tariffs and tariff_periods are append-only/
    );

    // TRUNCATE tariff_periods
    await assert.rejects(
      query("TRUNCATE tariff_periods"),
      /tariffs and tariff_periods are append-only/
    );
  });

  it('down lùi sạch, up lại thành công', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0].version !== '033_tariffs.sql') {
      assert.strictEqual(run('src/db/migrate.js', ['down']).status, 0);
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);

    const checkTable = await query("SELECT 1 FROM information_schema.tables WHERE table_name = 'tariffs'");
    assert.equal(checkTable.rows.length, 0);

    assert.strictEqual(run('src/db/migrate.js').status, 0);
    const checkTableAgain = await query("SELECT 1 FROM information_schema.tables WHERE table_name = 'tariffs'");
    assert.equal(checkTableAgain.rows.length, 1);
  });
});
