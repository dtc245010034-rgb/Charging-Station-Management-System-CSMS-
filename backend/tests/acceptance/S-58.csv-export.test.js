const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-58 AC: revenue and reconciliation reports export as CSV', () => {
  let accountant;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    accountant = await createUser('csv-accountant@test.invalid', 'ACCOUNTANT');
    const driver = await createUser('csv-driver@test.invalid', 'DRIVER');
    const station = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ('=CSMS+1', 'Test', $1, 'ACTIVE') RETURNING id",
      [accountant.id]
    );
    const point = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, '@SUM(1,2)', 'ONLINE') RETURNING id",
      [station.rows[0].id]
    );
    const connector = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status) VALUES ($1, 1, 'AVAILABLE') RETURNING id",
      [point.rows[0].id]
    );
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
       VALUES ($1, 1, '2026-01-01', 0, 0) RETURNING id`,
      [station.rows[0].id]
    );
    const finalSession = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status, billing_status
       ) VALUES ($1, $2, 1, $3, 'CSV-FINAL', 0, 1000,
         '2026-09-15T01:00:00Z', '2026-09-15T02:00:00Z', 'COMPLETED', 'FINAL') RETURNING id`,
      [point.rows[0].id, connector.rows[0].id, driver.id]
    );
    const invoice = await query(
      `INSERT INTO session_invoices (
         session_id, driver_id, station_id, tariff_id, tariff_snapshot, timezone,
         total_dong, period_date
       ) VALUES ($1, $2, $3, $4, $5::jsonb, 'Asia/Ho_Chi_Minh', 4000, '2026-09-15')
       RETURNING id`,
      [
        finalSession.rows[0].id,
        driver.id,
        station.rows[0].id,
        tariff.rows[0].id,
        JSON.stringify({
          periods: [{ startMin: 0, endMin: 1440, pricePerKwh: 4000 }],
          idle: { graceMin: 0, perMinDong: 0 },
        }),
      ]
    );
    await query(
      `INSERT INTO invoice_lines (
         invoice_id, seq, kind, local_date, from_at, to_at, wh, price_per_kwh, amount_dong
       ) VALUES ($1, 1, 'ENERGY', '2026-09-15', '2026-09-15T01:00:00Z',
         '2026-09-15T02:00:00Z', 1000, 4000, 4000)`,
      [invoice.rows[0].id]
    );
    await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status, billing_status, billing_reason
       ) VALUES ($1, $2, 1, $3, 'CSV-NO-INVOICE', 0, 500,
         '2026-09-16T01:00:00Z', '2026-09-16T02:00:00Z', 'COMPLETED', 'ERROR', 'FINALIZATION_FAILED')`,
      [point.rows[0].id, connector.rows[0].id, driver.id]
    );
  });

  after(async () => {
    await resetSchema();
    run('src/db/migrate.js');
    await closePool();
  });

  it('S-58 AC: exports revenue totals with formula-safe UTF-8 CSV cells', async () => {
    const response = await request(app)
      .get('/api/reports/revenue.csv?from=2026-09-01&to=2026-09-30')
      .set('Cookie', accountant.cookie);
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/csv; charset=utf-8/);
    assert.match(response.headers['content-disposition'], /attachment; filename="revenue-2026-09-01-2026-09-30\.csv"/);
    assert.ok(response.text.startsWith('\uFEFFstation_name,charge_point_code'));
    assert.ok(response.text.includes('"\'=CSMS+1","\'@SUM(1,2)"'));
    assert.ok(response.text.includes('"TOTAL"'));
    assert.ok(response.text.includes('"1","1","1000","4000","0","4000"'));
  });

  it('S-58 AC: exports reconciliation issues without omitting discrepancy fields', async () => {
    const response = await request(app)
      .get('/api/reports/reconciliation.csv?from=2026-09-01&to=2026-09-30')
      .set('Cookie', accountant.cookie);
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/csv; charset=utf-8/);
    assert.ok(response.text.startsWith('\uFEFFsession_id,type,station_name'));
    assert.ok(response.text.includes('KWH_NO_INVOICE'));
    assert.ok(response.text.includes('INVOICE_NO_LEDGER'));
    assert.ok(response.text.includes('"500"'));
  });
});
