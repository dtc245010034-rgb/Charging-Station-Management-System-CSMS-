const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-53 AC: reconciliation reports missing and mismatched billing records', () => {
  let accountant;
  let driver;
  let stationId;
  let chargePointId;
  let connectorId;
  let tariffId;
  const sessionIds = {};
  const sessionDates = {};

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    accountant = await createUser('recon-accountant@test.invalid', 'ACCOUNTANT');
    driver = await createUser('recon-driver@test.invalid', 'DRIVER');
    const station = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ('Recon Station', 'Test', $1, 'ACTIVE') RETURNING id",
      [accountant.id]
    );
    stationId = station.rows[0].id;
    const chargePoint = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'RECON-CP', 'ONLINE') RETURNING id",
      [stationId]
    );
    chargePointId = chargePoint.rows[0].id;
    const connector = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status) VALUES ($1, 1, 'AVAILABLE') RETURNING id",
      [chargePointId]
    );
    connectorId = connector.rows[0].id;
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
       VALUES ($1, 1, '2026-01-01', 0, 0) RETURNING id`,
      [stationId]
    );
    tariffId = tariff.rows[0].id;

    async function addSession(key, {
      meterStart = 0,
      meterStop = 10000,
      billingStatus = 'FINAL',
      date = '2026-09-10',
    } = {}) {
      const result = await query(
        `INSERT INTO charging_sessions (
           charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
           meter_start, meter_stop, started_at, stopped_at, status, billing_status
         ) VALUES ($1, $2, 1, $3, $4, $5, $6,
           ($7::date + TIME '01:00'), ($7::date + TIME '02:00'), 'COMPLETED', $8)
         RETURNING id`,
        [chargePointId, connectorId, driver.id, `RECON-${key}`, meterStart, meterStop, date, billingStatus]
      );
      sessionIds[key] = result.rows[0].id;
      sessionDates[key] = date;
      return result.rows[0].id;
    }

    async function addInvoice(key, { totalDong, billedWh, pricePerKwh = 4000 }) {
      const sessionId = sessionIds[key];
      const invoice = await query(
        `INSERT INTO session_invoices (
           session_id, driver_id, station_id, tariff_id, tariff_snapshot, timezone, total_dong, period_date
         ) VALUES ($1, $2, $3, $4, $5::jsonb, 'Asia/Ho_Chi_Minh', $6, $7::date)
         RETURNING id`,
        [
          sessionId,
          driver.id,
          stationId,
          tariffId,
          JSON.stringify({
            periods: [{ startMin: 0, endMin: 1440, pricePerKwh }],
            idle: { graceMin: 0, perMinDong: 0 },
          }),
          totalDong,
          sessionDates[key],
        ]
      );
      await query(
        `INSERT INTO invoice_lines (
           invoice_id, seq, kind, local_date, from_at, to_at, wh, price_per_kwh, amount_dong
         ) VALUES ($1, 1, 'ENERGY', $5::date,
           ($5::date + TIME '01:00'), ($5::date + TIME '02:00'), $2, $3, $4)`,
        [invoice.rows[0].id, billedWh, pricePerKwh, totalDong, sessionDates[key]]
      );
    }

    await addSession('X1', { meterStop: 5000, billingStatus: null });
    await addSession('X2');
    await addInvoice('X2', { totalDong: 40000, billedWh: 10000 });
    await addSession('X3');
    await addInvoice('X3', { totalDong: 40001, billedWh: 10000 });
    await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, session_id, period_date)
       VALUES ($1, 'SESSION_DEBIT', -40001, -40001, $2, $3::date)`,
      [driver.id, sessionIds.X3, sessionDates.X3]
    );
    await addSession('X4');
    await addInvoice('X4', { totalDong: 40000, billedWh: 10000 });
    await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, session_id, period_date)
       VALUES ($1, 'SESSION_DEBIT', -39999, -39999, $2, $3::date)`,
      [driver.id, sessionIds.X4, sessionDates.X4]
    );
    await addSession('X5');
    await addInvoice('X5', { totalDong: 40000, billedWh: 9999 });
    await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, session_id, period_date)
       VALUES ($1, 'SESSION_DEBIT', -40000, -40000, $2, $3::date)`,
      [driver.id, sessionIds.X5, sessionDates.X5]
    );
    await addSession('CLEAN1', { date: '2026-10-10' });
    await addInvoice('CLEAN1', { totalDong: 40000, billedWh: 10000 });
    await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, session_id, period_date)
       VALUES ($1, 'SESSION_DEBIT', -40000, -40000, $2, $3::date)`,
      [driver.id, sessionIds.CLEAN1, sessionDates.CLEAN1]
    );
    await addSession('CLEAN2', { meterStart: 1000, meterStop: 4001, date: '2026-10-10' });
    await addInvoice('CLEAN2', { totalDong: 7503, billedWh: 3001, pricePerKwh: 2500 });
    await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, session_id, period_date)
       VALUES ($1, 'SESSION_DEBIT', -7503, -7503, $2, $3::date)`,
      [driver.id, sessionIds.CLEAN2, sessionDates.CLEAN2]
    );
  });

  after(async () => {
    await resetSchema();
    run('src/db/migrate.js');
    await closePool();
  });

  it('S-53 AC: puts summary first and identifies X1-X5 with fixed discrepancy signs', async () => {
    const response = await request(app)
      .get('/api/reports/reconciliation?from=2026-09-01&to=2026-09-30')
      .set('Cookie', accountant.cookie);

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body.summary, {
      sessionsChecked: 5,
      issueCount: 5,
      totalDiffDong: '-39998',
      totalAbsDiffDong: '40002',
      whMeter: '45000',
      whBilled: '39999',
    });
    const issues = new Map(response.body.issues.map((issue) => [String(issue.sessionId), issue]));
    assert.strictEqual(issues.get(String(sessionIds.X1)).type, 'KWH_NO_INVOICE');
    assert.strictEqual(issues.get(String(sessionIds.X2)).type, 'INVOICE_NO_LEDGER');
    assert.strictEqual(issues.get(String(sessionIds.X2)).diffDong, '-40000');
    assert.strictEqual(issues.get(String(sessionIds.X3)).type, 'AMOUNT_MISMATCH');
    assert.strictEqual(issues.get(String(sessionIds.X3)).diffDong, '1');
    assert.strictEqual(issues.get(String(sessionIds.X4)).type, 'LEDGER_AMOUNT_MISMATCH');
    assert.strictEqual(issues.get(String(sessionIds.X4)).diffDong, '1');
    assert.strictEqual(issues.get(String(sessionIds.X5)).type, 'WH_MISMATCH');
    assert.strictEqual(issues.get(String(sessionIds.X5)).diffWh, '1');
  });

  it('S-53 AC: clean data returns no issues and more than 5,000 sessions is rejected', async () => {
    const clean = await request(app)
      .get('/api/reports/reconciliation?from=2026-10-10&to=2026-10-10')
      .set('Cookie', accountant.cookie);
    assert.strictEqual(clean.status, 200);
    assert.strictEqual(clean.body.summary.sessionsChecked, 2);
    assert.strictEqual(clean.body.summary.issueCount, 0);
    assert.strictEqual(clean.body.summary.totalDiffDong, '0');

    await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status, billing_status
       )
       SELECT $1, $2, 1, $3, 'RECON-BULK-' || n, 0, 0,
              '2026-01-01T01:00:00Z', '2026-01-01T02:00:00Z', 'COMPLETED', 'SKIPPED'
       FROM generate_series(1, 5001) AS n`,
      [chargePointId, connectorId, driver.id]
    );
    const tooWide = await request(app)
      .get('/api/reports/reconciliation?from=2025-12-01&to=2026-01-31')
      .set('Cookie', accountant.cookie);
    assert.strictEqual(tooWide.status, 400);
    assert.strictEqual(tooWide.body.error.code, 'BAD_REQUEST');
  });
});
