const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const tableExists = async (tableName) => (await query(
  'SELECT 1 FROM information_schema.tables WHERE table_name = $1',
  [tableName]
)).rowCount === 1;

describe('migration 035: session_invoices, invoice_lines and billing_status [GYM-59]', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);

    for (const version of [
      '045_zero_watt_profile_limits.sql',
      '044_alerts_power_profile_log.sql',
      '043_station_power_limits.sql',
      '042_data_erasure_requests.sql',
      '041_accounting_period_locks.sql',
      '040_accounting_periods.sql',
      '039_notifications_and_email_outbox.sql',
      '038_wallet_topups.sql',
      '037_audit_logs_driver_id_index.sql',
      '036_wallets.sql',
      '035_session_invoices.sql',
    ]) {
      const latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
      assert.equal(latest.rows[0].version, version);
      const rollback = run('src/db/migrate.js', ['down']);
      assert.strictEqual(rollback.status, 0, rollback.stderr);
    }

    const ownerRes = await query("INSERT INTO users (name, email, password_hash) VALUES ('Legacy Owner', 'owner-legacy-m035@test.invalid', 'hash') RETURNING id");
    const stationRes = await query(
      "INSERT INTO stations (name, address, latitude, longitude, owner_id) VALUES ('Legacy Station', 'HN', 21, 105, $1) RETURNING id",
      [ownerRes.rows[0].id]
    );
    const pointRes = await query("INSERT INTO charge_points (station_id, code) VALUES ($1, 'CP-LEGACY-035') RETURNING id", [stationRes.rows[0].id]);
    const connectorRes = await query("INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id", [pointRes.rows[0].id]);
    await query(
      `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, id_tag_masked, status, meter_start, meter_stop, started_at, stopped_at)
       VALUES ($1, $2, 1, 'TAG-LEGACY', 'COMPLETED', 0, 1000, '2026-10-12T01:00:00Z', '2026-10-12T02:00:00Z')`,
      [pointRes.rows[0].id, connectorRes.rows[0].id]
    );

    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: bảng và cột tồn tại; phiên COMPLETED cũ nhận billing_status = SKIPPED', async () => {
    assert.ok(await tableExists('session_invoices'), 'session_invoices phải tồn tại');
    assert.ok(await tableExists('invoice_lines'), 'invoice_lines phải tồn tại');

    const col = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'charging_sessions' AND column_name = 'billing_status'"
    );
    assert.equal(col.rowCount, 1);

    const legacySession = await query(
      "SELECT billing_status, billing_reason FROM charging_sessions WHERE id_tag_masked = 'TAG-LEGACY'"
    );
    assert.deepEqual(legacySession.rows[0], {
      billing_status: 'SKIPPED',
      billing_reason: 'EXISTING_COMPLETED_BEFORE_TARIFF',
    });
  });

  it('trigger bất biến: chặn UPDATE khác, DELETE, TRUNCATE; cho phép duy nhất driver_id -> NULL', async () => {
    // Tạo user và station và tariff và session để test
    const userRes = await query("INSERT INTO users (name, email, password_hash) VALUES ('Driver', 'driver-inv@test.invalid', 'hash') RETURNING id");
    const driverId = userRes.rows[0].id;
    const ownerRes = await query("INSERT INTO users (name, email, password_hash) VALUES ('Owner', 'owner-inv@test.invalid', 'hash') RETURNING id");
    const ownerId = ownerRes.rows[0].id;

    const stRes = await query(
      "INSERT INTO stations (name, address, latitude, longitude, owner_id) VALUES ('Station Inv', 'HN', 21.0, 105.8, $1) RETURNING id",
      [ownerId]
    );
    const stationId = stRes.rows[0].id;

    const cpRes = await query("INSERT INTO charge_points (station_id, code) VALUES ($1, 'CP-INV-01') RETURNING id", [stationId]);
    const cpId = cpRes.rows[0].id;
    const connRes = await query("INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id", [cpId]);
    const connId = connRes.rows[0].id;

    const tariffRes = await query(
      "INSERT INTO tariffs (station_id, version, effective_from) VALUES ($1, 1, '2026-10-10') RETURNING id",
      [stationId]
    );
    const tariffId = tariffRes.rows[0].id;

    const sessionRes = await query(
      `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, driver_id, id_tag_masked, status, meter_start, meter_stop, started_at, stopped_at)
       VALUES ($1, $2, 1, $3, 'TAG-01', 'COMPLETED', 0, 1000, '2026-10-12T01:00:00Z', '2026-10-12T02:00:00Z') RETURNING id`,
      [cpId, connId, driverId]
    );
    const sessionId = sessionRes.rows[0].id;

    // Chèn hoá đơn
    const invRes = await query(
      `INSERT INTO session_invoices (session_id, driver_id, station_id, tariff_id, tariff_snapshot, timezone, total_dong, period_date)
       VALUES ($1, $2, $3, $4, '{"version":1}', 'Asia/Ho_Chi_Minh', 50000, '2026-10-12') RETURNING id`,
      [sessionId, driverId, stationId, tariffId]
    );
    const invoiceId = invRes.rows[0].id;

    // Chèn dòng hoá đơn
    await query(
      `INSERT INTO invoice_lines (invoice_id, seq, kind, local_date, from_at, to_at, wh, price_per_kwh, amount_dong)
       VALUES ($1, 1, 'ENERGY', '2026-10-12', '2026-10-12T01:00:00Z', '2026-10-12T02:00:00Z', 1000, 5000, 50000)`,
      [invoiceId]
    );

    // 1. Thử UPDATE cột khác của session_invoices (total_dong) => phải bị chặn
    await assert.rejects(
      () => query('UPDATE session_invoices SET total_dong = 1000 WHERE id = $1', [invoiceId]),
      /session_invoices is immutable/
    );

    // 2. Thử DELETE session_invoices => phải bị chặn
    await assert.rejects(
      () => query('DELETE FROM session_invoices WHERE id = $1', [invoiceId]),
      /session_invoices is immutable/
    );

    // 3. Thử TRUNCATE session_invoices, invoice_lines CASCADE => phải bị chặn
    await assert.rejects(
      () => query('TRUNCATE session_invoices, invoice_lines CASCADE'),
      /TRUNCATE forbidden/
    );

    // 4. Thử UPDATE invoice_lines => phải bị chặn
    await assert.rejects(
      () => query('UPDATE invoice_lines SET amount_dong = 1000 WHERE invoice_id = $1', [invoiceId]),
      /invoice_lines is immutable/
    );

    // 5. Thử DELETE invoice_lines => phải bị chặn
    await assert.rejects(
      () => query('DELETE FROM invoice_lines WHERE invoice_id = $1', [invoiceId]),
      /invoice_lines is immutable/
    );

    // 6. Thử TRUNCATE invoice_lines => phải bị chặn
    await assert.rejects(
      () => query('TRUNCATE invoice_lines'),
      /TRUNCATE forbidden/
    );

    // 7. Duy nhất ngoại lệ: UPDATE driver_id từ NOT NULL sang NULL (ẩn danh hoá) => được phép!
    const anonRes = await query('UPDATE session_invoices SET driver_id = NULL WHERE id = $1 RETURNING driver_id', [invoiceId]);
    assert.equal(anonRes.rows[0].driver_id, null);
  });

  it('down xoá các bảng hoá đơn và cột; up lại sạch', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0].version !== '035_session_invoices.sql') {
      assert.strictEqual(run('src/db/migrate.js', ['down']).status, 0);
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.equal(await tableExists('session_invoices'), false);
    assert.equal(await tableExists('invoice_lines'), false);

    assert.strictEqual(run('src/db/migrate.js').status, 0);
    assert.ok(await tableExists('session_invoices'));
    assert.ok(await tableExists('invoice_lines'));
  });
});
