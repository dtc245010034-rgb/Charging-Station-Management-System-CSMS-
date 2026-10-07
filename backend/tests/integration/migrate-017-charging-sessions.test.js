const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const tableSessions = async () => (await query("SELECT to_regclass('public.charging_sessions') AS t")).rows[0].t;
const tableMeterValues = async () => (await query("SELECT to_regclass('public.meter_values') AS t")).rows[0].t;
const tableOrphanMessages = async () => (await query("SELECT to_regclass('public.orphan_messages') AS t")).rows[0].t;

describe('migration 017-019: charging_sessions, meter_values, orphan_messages', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: tạo bảng charging_sessions, meter_values, orphan_messages với đầy đủ ràng buộc và index', async () => {
    assert.ok(await tableSessions(), 'Bảng charging_sessions phải tồn tại');
    assert.ok(await tableMeterValues(), 'Bảng meter_values phải tồn tại');
    assert.ok(await tableOrphanMessages(), 'Bảng orphan_messages phải tồn tại');

    const meterValuesColumns = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'meter_values'"
    );
    assert.deepEqual(
      meterValuesColumns.rows.map((row) => row.column_name).sort(),
      ['created_at', 'id', 'measurand', 'raw_unit', 'sampled_at', 'session_id', 'unit', 'value'].sort()
    );
    const meterValuesIndex = await query(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_meter_values_session_sampled_desc'"
    );
    assert.match(meterValuesIndex.rows[0].indexdef, /\(session_id, sampled_at DESC\)/);

    // Kiểm tra các index quan trọng của charging_sessions
    const idx = await query("SELECT indexname FROM pg_indexes WHERE tablename = 'charging_sessions'");
    const names = idx.rows.map((r) => r.indexname);
    assert.ok(names.includes('idx_charging_sessions_active_connector'), 'Thiếu index unique có điều kiện trên connector_id');
    assert.ok(names.includes('idx_charging_sessions_natural_key'), 'Thiếu index natural key chống trùng D4');
    assert.ok(names.includes('idx_charging_sessions_driver_status'), 'Thiếu index driver_status');
    assert.ok(names.includes('idx_charging_sessions_status_updated'), 'Thiếu index status_updated');

    // Kiểm tra check constraint status
    await assert.rejects(
      query(`
        INSERT INTO charging_sessions (
          charge_point_id, connector_id, connector_no, id_tag_masked, meter_start, started_at, status
        ) VALUES (1, 1, 1, '1234', 0, NOW(), 'INVALID_STATUS')
      `),
      /check constraint/
    );
  });

  it('down: rollback lần lượt các migration 019, 018, 017 và up lại sạch sẽ', async () => {
    // Rollback 019
    let down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.equal(await tableOrphanMessages(), null, 'orphan_messages phải bị xoá');
    assert.ok(await tableMeterValues(), 'meter_values vẫn còn trước khi rollback');

    // Rollback 018
    down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.equal(await tableMeterValues(), null, 'meter_values phải bị xoá');
    assert.ok(await tableSessions(), 'charging_sessions vẫn còn trước khi rollback');

    // Rollback 017
    down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.equal(await tableSessions(), null, 'charging_sessions phải bị xoá');

    // Migrate up trở lại
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    assert.ok(await tableSessions());
    assert.ok(await tableMeterValues());
    assert.ok(await tableOrphanMessages());
  });
});
