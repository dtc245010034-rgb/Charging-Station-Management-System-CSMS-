const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const tableSessions = async () => (await query("SELECT to_regclass('public.charging_sessions') AS t")).rows[0].t;
const tableMeterValues = async () => (await query("SELECT to_regclass('public.meter_values') AS t")).rows[0].t;
const tableOrphanMessages = async () => (await query("SELECT to_regclass('public.orphan_messages') AS t")).rows[0].t;

describe('migration 017-025: charging_sessions, meter_values, orphan_messages, transaction_data, remote stop', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: tạo bảng charging_sessions, meter_values, orphan_messages và cột transaction_data', async () => {
    assert.ok(await tableSessions(), 'Bảng charging_sessions phải tồn tại');
    assert.ok(await tableMeterValues(), 'Bảng meter_values phải tồn tại');
    assert.ok(await tableOrphanMessages(), 'Bảng orphan_messages phải tồn tại');

    const meterValuesColumns = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'meter_values'"
    );
    assert.deepEqual(
      meterValuesColumns.rows.map((row) => row.column_name).sort(),
      ['context', 'created_at', 'id', 'measurand', 'phase', 'raw_unit', 'reported_at', 'sampled_at', 'session_id', 'source_message_id', 'unit', 'value'].sort()
    );
    const meterValuesIndex = await query(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_meter_values_session_reported_desc'"
    );
    assert.match(meterValuesIndex.rows[0].indexdef, /\(session_id, reported_at DESC\)/);
    const streamLatestIndex = await query(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_meter_values_stream_latest'"
    );
    assert.match(streamLatestIndex.rows[0].indexdef, /\(session_id, measurand, phase, context, sampled_at DESC, id DESC\)/);

    const transactionDataColumn = await query(
      "SELECT data_type FROM information_schema.columns WHERE table_name = 'charging_sessions' AND column_name = 'transaction_data'"
    );
    assert.equal(transactionDataColumn.rows[0].data_type, 'jsonb');

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

  it('down: rollback lần lượt 025, 024, 023, 022, 019, 018, 017 và up lại sạch sẽ', async () => {
    const rollbackChecks = [
      { version: '025_remote_stop_requests', check: async () => {
        const columns = await query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'charging_sessions' AND column_name LIKE 'remote_stop_%'"
        );
        assert.equal(columns.rows.length, 0);
        const index = await query(
          "SELECT indexname FROM pg_indexes WHERE indexname = 'idx_charging_sessions_remote_stop_deadline'"
        );
        assert.equal(index.rows.length, 0);
      } },
      { version: '024_meter_values_stream_latest_index', check: async () => {
        const index = await query(
          "SELECT indexname FROM pg_indexes WHERE indexname = 'idx_meter_values_stream_latest'"
        );
        assert.equal(index.rows.length, 0);
      } },
      { version: '023_transaction_data', check: async () => {
        const column = await query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'charging_sessions' AND column_name = 'transaction_data'"
        );
        assert.equal(column.rows.length, 0);
      } },
      { version: '022_meter_values_dedup_phase', check: async () => {
        assert.ok(await tableMeterValues());
        assert.equal((await query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'meter_values' AND column_name IN ('reported_at', 'phase', 'context', 'source_message_id')"
        )).rows.length, 0);
      } },
      { version: '019_orphan_messages', check: async () => assert.equal(await tableOrphanMessages(), null) },
      { version: '018_meter_values', check: async () => assert.equal(await tableMeterValues(), null) },
      { version: '017_charging_sessions', check: async () => assert.equal(await tableSessions(), null) },
    ];

    for (const { version, check } of rollbackChecks) {
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
      await check();
      console.log(`Verified rollback ${version}`);
    }

    // Migrate up trở lại
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    assert.ok(await tableSessions());
    assert.ok(await tableMeterValues());
    assert.ok(await tableOrphanMessages());
  });
});
