const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const tableSessions = async () => (await query("SELECT to_regclass('public.charging_sessions') AS t")).rows[0].t;
const tableMeterValues = async () => (await query("SELECT to_regclass('public.meter_values') AS t")).rows[0].t;
const tableOrphanMessages = async () => (await query("SELECT to_regclass('public.orphan_messages') AS t")).rows[0].t;

describe('migrations 017-035: charging sessions, billing, and append-only audit logs', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: tạo bảng charging_sessions, meter_values, orphan_messages và cột transaction_data', async () => {
    assert.ok(await tableSessions(), 'Bảng charging_sessions phải tồn tại');
    assert.ok(await tableMeterValues(), 'Bảng meter_values phải tồn tại');
    assert.ok(await tableOrphanMessages(), 'Bảng orphan_messages phải tồn tại');
    assert.ok((await query("SELECT to_regclass('public.remote_start_requests') AS t")).rows[0].t, 'Bảng remote_start_requests phải tồn tại');
    assert.equal((await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'charging_sessions' AND column_name IN ('manual_close_reason', 'manual_closed_by')")).rowCount, 2);
    assert.equal((await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'id_tags' AND column_name = 'is_virtual'")).rowCount, 1);
    assert.equal((await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'result'")).rowCount, 1);
    assert.equal((await query("SELECT tgname FROM pg_trigger WHERE tgname = 'audit_logs_no_truncate' AND NOT tgisinternal")).rowCount, 1);
    assert.equal((await query("SELECT indexname FROM pg_indexes WHERE indexname IN ('audit_logs_created_at_idx', 'audit_logs_entity_entity_id_idx', 'audit_logs_user_id_idx')")).rowCount, 3);
    assert.equal((await query("SELECT indexname FROM pg_indexes WHERE indexname IN ('charge_points_code_trgm_idx', 'users_name_trgm_idx', 'users_email_trgm_idx')")).rowCount, 3);
    const orderedAuditIndex = await query("SELECT indexdef FROM pg_indexes WHERE indexname = 'audit_logs_created_at_idx'");
    assert.match(orderedAuditIndex.rows[0].indexdef, /\(created_at DESC, id DESC\)/);
    assert.equal((await query("SELECT indexname FROM pg_indexes WHERE indexname = 'remote_start_one_pending_per_connector'")).rowCount, 1);
    assert.equal((await query("SELECT indexname FROM pg_indexes WHERE indexname = 'remote_start_one_pending_per_driver'")).rowCount, 1);

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

  it('audit_logs rejects UPDATE, DELETE, and TRUNCATE at the database layer', async () => {
    const inserted = await query(
      "INSERT INTO audit_logs (action, entity, metadata) VALUES ('APPEND_ONLY_TEST', 'test', '{}'::jsonb) RETURNING id"
    );
    const { id } = inserted.rows[0];

    await assert.rejects(
      query("UPDATE audit_logs SET action = 'CHANGED' WHERE id = $1", [id]),
      (error) => error.code === '55000'
    );
    await assert.rejects(
      query('DELETE FROM audit_logs WHERE id = $1', [id]),
      (error) => error.code === '55000'
    );
    await assert.rejects(
      query('TRUNCATE audit_logs'),
      (error) => error.code === '55000'
    );
    assert.equal((await query('SELECT action FROM audit_logs WHERE id = $1', [id])).rows[0].action, 'APPEND_ONLY_TEST');
  });

  it('down: rollback lần lượt 035 tới 017 và up lại sạch sẽ', async () => {
    for (const version of ['037_audit_logs_driver_id_index.sql', '036_wallets.sql']) {
      const latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
      assert.equal(latest.rows[0].version, version);
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
    }

    const rollbackChecks = [
      { version: '035_session_invoices', check: async () => {
        assert.equal((await query("SELECT to_regclass('public.session_invoices') AS t")).rows[0].t, null);
        assert.equal((await query("SELECT to_regclass('public.invoice_lines') AS t")).rows[0].t, null);
        assert.equal((await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'charging_sessions' AND column_name = 'billing_status'")).rowCount, 0);
      } },
      { version: '034_connector_status_events', check: async () => {
        assert.equal((await query("SELECT to_regclass('public.connector_status_events') AS t")).rows[0].t, null);
      } },
      { version: '033_tariffs', check: async () => {
        assert.equal((await query("SELECT to_regclass('public.tariffs') AS t")).rows[0].t, null);
        assert.equal((await query("SELECT to_regclass('public.tariff_periods') AS t")).rows[0].t, null);
      } },
      { version: '032_stations_timezone', check: async () => {
        assert.equal((await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'stations' AND column_name = 'timezone'")).rowCount, 0);
      } },
      { version: '031_audit_logs_no_truncate', check: async () => {
        assert.equal((await query("SELECT tgname FROM pg_trigger WHERE tgname = 'audit_logs_no_truncate' AND NOT tgisinternal")).rowCount, 0);
      } },
      { version: '030_audit_logs_query_indexes', check: async () => {
        assert.equal((await query("SELECT indexname FROM pg_indexes WHERE indexname IN ('charge_points_code_trgm_idx', 'users_name_trgm_idx', 'users_email_trgm_idx')")).rowCount, 0);
        const createdAtIndex = await query("SELECT indexdef FROM pg_indexes WHERE indexname = 'audit_logs_created_at_idx'");
        assert.match(createdAtIndex.rows[0].indexdef, /\(created_at\)/);
      } },
      { version: '029_audit_logs_append_only', check: async () => {
        assert.equal((await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'result'")).rowCount, 0);
        assert.equal((await query("SELECT tgname FROM pg_trigger WHERE tgname = 'audit_logs_append_only' AND NOT tgisinternal")).rowCount, 0);
      } },
      { version: '028_manual_session_closure', check: async () => {
        assert.equal((await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'charging_sessions' AND column_name IN ('manual_close_reason', 'manual_closed_by')")).rowCount, 0);
      } },
      { version: '027_remote_start_one_pending_per_driver', check: async () => {
        assert.equal((await query("SELECT indexname FROM pg_indexes WHERE indexname = 'remote_start_one_pending_per_driver'")).rowCount, 0);
      } },
      { version: '026_remote_start_requests', check: async () => {
        assert.equal((await query("SELECT to_regclass('public.remote_start_requests') AS t")).rows[0].t, null);
        assert.equal((await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'id_tags' AND column_name = 'is_virtual'")).rowCount, 0);
        assert.equal((await query("SELECT indexname FROM pg_indexes WHERE indexname = 'id_tags_one_virtual_per_user'")).rowCount, 0);
      } },
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
