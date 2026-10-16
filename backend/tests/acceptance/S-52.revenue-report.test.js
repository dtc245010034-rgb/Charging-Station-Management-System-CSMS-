const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-52 AC: revenue report groups final invoices by connector and scopes station owners', () => {
  let owner;
  let otherOwner;
  let driver;
  let stationId;
  let otherStationId;
  let connectors;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('revenue-owner@test.invalid', 'STATION_OWNER');
    otherOwner = await createUser('other-revenue-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('revenue-driver@test.invalid', 'DRIVER');

    const ownStation = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ('Revenue Station', 'Test', $1, 'ACTIVE') RETURNING id",
      [owner.id]
    );
    const otherStation = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ('Other Revenue Station', 'Test', $1, 'ACTIVE') RETURNING id",
      [otherOwner.id]
    );
    stationId = ownStation.rows[0].id;
    otherStationId = otherStation.rows[0].id;
    const chargePoint = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'REV-CP-01', 'ONLINE') RETURNING id",
      [stationId]
    );
    connectors = [];
    for (let connectorNo = 1; connectorNo <= 2; connectorNo += 1) {
      const connector = await query(
        "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, $2, 'AVAILABLE', 'Available') RETURNING id",
        [chargePoint.rows[0].id, connectorNo]
      );
      connectors.push(connector.rows[0].id);
    }
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong, created_by)
       VALUES ($1, 1, '2026-01-01', 15, 1000, $2) RETURNING id`,
      [stationId, owner.id]
    );
    const fixture = require('../fixtures/billing/hand-cases.json');
    const expectedCases = ['C01', 'C14', 'C02', 'C17'];

    for (const [index, caseId] of expectedCases.entries()) {
      const billingCase = fixture.find((item) => item.id === caseId);
      const connectorIndex = index < 2 ? 0 : 1;
      const connectorNo = connectorIndex + 1;
      const session = await query(
        `INSERT INTO charging_sessions (
           charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
           meter_start, meter_stop, started_at, stopped_at, status, billing_status
         )
         SELECT cp.id, $1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED', 'FINAL'
         FROM charge_points cp WHERE cp.station_id = $9
         RETURNING id`,
        [
          connectors[connectorIndex],
          connectorNo,
          driver.id,
          `REV-TAG-${caseId}`,
          billingCase.input.meterStartWh,
          billingCase.input.meterStopWh,
          billingCase.input.startedAt,
          billingCase.input.stoppedAt,
          stationId,
        ]
      );
      const totalDong = billingCase.expected.totalDong;
      const invoice = await query(
        `INSERT INTO session_invoices (
           session_id, driver_id, station_id, tariff_id, tariff_snapshot, timezone,
           total_dong, period_date
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, 'Asia/Ho_Chi_Minh', $6, '2026-10-12')
         RETURNING id`,
        [
          session.rows[0].id,
          driver.id,
          stationId,
          tariff.rows[0].id,
          JSON.stringify(billingCase.input.tariff),
          totalDong,
        ]
      );
      for (const [lineIndex, line] of billingCase.expected.lines.entries()) {
        await query(
          `INSERT INTO invoice_lines (
             invoice_id, seq, kind, local_date, from_at, to_at, wh,
             price_per_kwh, minutes, per_min_dong, amount_dong
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            invoice.rows[0].id,
            lineIndex + 1,
            line.kind,
            line.localDate,
            line.from,
            line.to,
            line.wh,
            line.pricePerKwh,
            line.minutes || null,
            line.perMinDong || null,
            line.amountDong,
          ]
        );
      }
    }
  });

  after(async () => {
    await resetSchema();
    run('src/db/migrate.js');
    await closePool();
  });

  it('S-52 AC: returns fixed fixture totals per connector and for the station', async () => {
    const response = await request(app)
      .get('/api/reports/revenue?from=2026-10-01&to=2026-10-31')
      .set('Cookie', owner.cookie);

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body.rows, [
      {
        stationName: 'Revenue Station',
        chargePointCode: 'REV-CP-01',
        connectorNo: 1,
        sessions: 2,
        totalWh: '20000',
        energyDong: '80000',
        idleDong: '38000',
        totalDong: '118000',
      },
      {
        stationName: 'Revenue Station',
        chargePointCode: 'REV-CP-01',
        connectorNo: 2,
        sessions: 2,
        totalWh: '3001',
        energyDong: '7503',
        idleDong: '0',
        totalDong: '7503',
      },
    ]);
    assert.deepStrictEqual(response.body.total, {
      sessions: 4,
      totalWh: '23001',
      energyDong: '87503',
      idleDong: '38000',
      totalDong: '125503',
    });
  });

  it('S-52 AC: a station owner cannot request another owner’s station', async () => {
    const response = await request(app)
      .get(`/api/reports/revenue?from=2026-10-01&to=2026-10-31&stationId=${otherStationId}`)
      .set('Cookie', owner.cookie);

    assert.strictEqual(response.status, 403);
    assert.strictEqual(response.body.error.code, 'FORBIDDEN');
    const denied = await query(
      "SELECT action FROM audit_logs WHERE user_id = $1 AND entity = 'station' AND entity_id = $2 ORDER BY id DESC LIMIT 1",
      [owner.id, otherStationId]
    );
    assert.strictEqual(denied.rows[0]?.action, 'ACCESS_DENIED');
  });
});
