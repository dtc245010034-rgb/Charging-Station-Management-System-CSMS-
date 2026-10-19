const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 041: accounting period locks [GYM-81]', () => {
  let driverId;
  let chargePointId;
  let connectorId;
  let tariffId;
  let lockedSessionId;
  let secondSessionId;
  let invoiceId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);

    const driver = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Lock Test', 'period-lock@test.invalid', 'hash') RETURNING id"
    );
    driverId = driver.rows[0].id;
    const station = await query(
      "INSERT INTO stations (name, address, owner_id, timezone) VALUES ('Lock Station', 'Test', $1, 'Asia/Ho_Chi_Minh') RETURNING id",
      [driverId]
    );
    const chargePoint = await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'LOCK-CP') RETURNING id",
      [station.rows[0].id]
    );
    chargePointId = chargePoint.rows[0].id;
    const connector = await query(
      "INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id",
      [chargePointId]
    );
    connectorId = connector.rows[0].id;
    const tariff = await query(
      "INSERT INTO tariffs (station_id, version, effective_from, created_by) VALUES ($1, 1, '2026-01-01', $2) RETURNING id",
      [station.rows[0].id, driverId]
    );
    tariffId = tariff.rows[0].id;
    await query("INSERT INTO accounting_periods (month, status) VALUES ('2026-09-01', 'OPEN')");

    const sessions = [];
    for (const tag of ['LOCK-A', 'LOCK-B']) {
      const session = await query(
        `INSERT INTO charging_sessions (
           charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
           meter_start, meter_stop, started_at, stopped_at, status, billing_status
         ) VALUES ($1, $2, 1, $3, $4, 0, 1000,
           '2026-09-10T01:00:00Z', '2026-09-10T02:00:00Z', 'COMPLETED', 'FINAL')
         RETURNING id`,
        [chargePointId, connectorId, driverId, tag]
      );
      sessions.push(session.rows[0].id);
    }
    [lockedSessionId, secondSessionId] = sessions;
    const invoice = await query(
      `INSERT INTO session_invoices (
         session_id, driver_id, station_id, tariff_id, tariff_snapshot, timezone, total_dong, period_date
       ) VALUES ($1, $2, (SELECT station_id FROM charge_points WHERE id = $3), $4, '{}', 'Asia/Ho_Chi_Minh', 100, '2026-09-10')
       RETURNING id`,
      [lockedSessionId, driverId, chargePointId, tariffId]
    );
    invoiceId = invoice.rows[0].id;
    await query(
      `INSERT INTO invoice_lines (invoice_id, seq, kind, local_date, from_at, to_at, wh, amount_dong)
       VALUES ($1, 1, 'ENERGY', '2026-09-10', '2026-09-10T01:00:00Z', '2026-09-10T02:00:00Z', 1000, 100)`,
      [invoiceId]
    );
    await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, period_date)
       VALUES ($1, 'ADJUSTMENT', 100, 100, '2026-09-10')`,
      [driverId]
    );
  });

  after(resetSchema);

  it('S-55 AC: blocks invoice, invoice-line, ledger inserts and session edits in closed periods', async () => {
    await query("UPDATE accounting_periods SET status = 'CLOSED' WHERE month = '2026-09-01'");

    await assert.rejects(
      query(
        `INSERT INTO session_invoices (
           session_id, station_id, tariff_id, tariff_snapshot, timezone, total_dong, period_date
         ) VALUES ($1, (SELECT station_id FROM charge_points WHERE id = $2), $3, '{}', 'Asia/Ho_Chi_Minh', 0, '2026-09-10')`,
        [secondSessionId, chargePointId, tariffId]
      ),
      (error) => error.code === '55000' && error.message.includes('PERIOD_CLOSED')
    );
    await assert.rejects(
      query(
        `INSERT INTO invoice_lines (invoice_id, seq, kind, local_date, from_at, to_at, wh, amount_dong)
         VALUES ($1, 2, 'ENERGY', '2026-09-10', '2026-09-10T02:00:00Z', '2026-09-10T03:00:00Z', 1, 1)`,
        [invoiceId]
      ),
      (error) => error.code === '55000' && error.message.includes('PERIOD_CLOSED')
    );
    await assert.rejects(
      query(
        `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, period_date)
         VALUES ($1, 'ADJUSTMENT', 1, 101, '2026-09-10')`,
        [driverId]
      ),
      (error) => error.code === '55000' && error.message.includes('PERIOD_CLOSED')
    );
    await assert.rejects(
      query("UPDATE charging_sessions SET stop_reason = 'changed' WHERE id = $1", [lockedSessionId]),
      (error) => error.code === '55000' && error.message.includes('PERIOD_CLOSED')
    );

    await query("UPDATE session_invoices SET driver_id = NULL WHERE id = $1", [invoiceId]);
    await query(
      "UPDATE charging_sessions SET driver_id = NULL, id_tag_id = NULL, id_tag_masked = 'ER-' || upper(to_hex(id)) WHERE id = $1",
      [lockedSessionId]
    );
  });

  it('S-55 AC: reopening restores writes and migration 041 rolls back and reapplies', async () => {
    await query("UPDATE accounting_periods SET status = 'OPEN' WHERE month = '2026-09-01'");
    await query("UPDATE charging_sessions SET stop_reason = 'changed after reopen' WHERE id = $1", [secondSessionId]);
    await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, period_date)
       VALUES ($1, 'ADJUSTMENT', 1, 101, '2026-09-10')`,
      [driverId]
    );

    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0]?.version !== '041_accounting_period_locks.sql') {
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    const absent = await query("SELECT to_regprocedure('reject_closed_session_update()') AS trigger_function");
    assert.strictEqual(absent.rows[0].trigger_function, null);
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    const present = await query("SELECT to_regprocedure('reject_closed_session_update()') AS trigger_function");
    assert.ok(present.rows[0].trigger_function);
  });
});
