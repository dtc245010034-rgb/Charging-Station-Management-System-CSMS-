const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { finalizeSession } = require('../../src/modules/billing/finalize-session');

describe('S-33/S-64: Driver invoices and session history', () => {
  let server;
  let baseUrl;
  let driver;
  let otherDriver;
  let invoiceSessionId;
  const historySessionIds = [];

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    driver = await createUser('driver-history@test.invalid', 'DRIVER');
    otherDriver = await createUser('other-history@test.invalid', 'DRIVER');
    const owner = await createUser('owner-history@test.invalid', 'STATION_OWNER');
    const station = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ('History Station', 'Test address', $1, 'ACTIVE') RETURNING id",
      [owner.id]
    );
    const chargePoint = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'CP-HISTORY-API', 'ONLINE') RETURNING id",
      [station.rows[0].id]
    );
    const connector = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id",
      [chargePoint.rows[0].id]
    );
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong, created_by)
       VALUES ($1, 1, '2026-01-01', 0, 0, $2) RETURNING id`,
      [station.rows[0].id, owner.id]
    );
    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, 0, 1440, 25000, 'All day')`,
      [tariff.rows[0].id]
    );

    for (let index = 0; index < 21; index += 1) {
      const stoppedAt = new Date(Date.parse('2026-10-10T00:00:00.000Z') + index * 3_600_000);
      const startedAt = new Date(stoppedAt.getTime() - 30 * 60_000);
      const session = await query(
        `INSERT INTO charging_sessions (
           charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
           meter_start, meter_stop, started_at, stopped_at, status
         ) VALUES ($1, $2, 1, $3, $4, 10000, 11000, $5, $6, 'COMPLETED')
         RETURNING id`,
        [
          chargePoint.rows[0].id,
          connector.rows[0].id,
          driver.id,
          `TAG${String(index).padStart(4, '0')}`,
          startedAt,
          stoppedAt,
        ]
      );
      historySessionIds.push(session.rows[0].id);
      if (index === 0) invoiceSessionId = session.rows[0].id;
    }
    await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status
       ) VALUES ($1, $2, 1, $3, 'OTHER1', 10000, 12000,
         '2026-10-11T00:30:00.000Z', '2026-10-11T01:00:00.000Z', 'COMPLETED')`,
      [chargePoint.rows[0].id, connector.rows[0].id, otherDriver.id]
    );
    assert.equal((await finalizeSession(invoiceSessionId)).status, 'FINAL');

    server = require('node:http').createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('S-33: returns the caller-owned immutable invoice and its price breakdown', async () => {
    const response = await fetch(`${baseUrl}/api/sessions/${invoiceSessionId}/invoice`, {
      headers: { Cookie: driver.cookie },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.billingStatus, 'FINAL');
    assert.equal(body.invoice.totalDong, '25000');
    assert.equal(body.invoice.lines.length, 1);
    assert.equal(body.invoice.lines[0].kind, 'ENERGY');
    assert.equal(body.invoice.lines[0].amountDong, '25000');
  });

  it('S-33: another driver cannot read the invoice', async () => {
    const response = await fetch(`${baseUrl}/api/sessions/${invoiceSessionId}/invoice`, {
      headers: { Cookie: otherDriver.cookie },
    });
    assert.equal(response.status, 403);
  });

  it('S-64: returns only the driver’s completed sessions with a stable cursor', async () => {
    const firstResponse = await fetch(`${baseUrl}/api/me/sessions/history`, {
      headers: { Cookie: driver.cookie },
    });
    assert.equal(firstResponse.status, 200);
    const firstPage = await firstResponse.json();
    assert.equal(firstPage.items.length, 20);
    assert.ok(firstPage.nextCursor);
    assert.ok(firstPage.items.every((item) => historySessionIds.some((id) => String(id) === item.id)));
    assert.equal(firstPage.items[0].invoiceTotalDong, null);

    const secondResponse = await fetch(
      `${baseUrl}/api/me/sessions/history?cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      { headers: { Cookie: driver.cookie } }
    );
    assert.equal(secondResponse.status, 200);
    const secondPage = await secondResponse.json();
    assert.equal(secondPage.items.length, 1);
    assert.equal(secondPage.items[0].id, String(historySessionIds[0]));
    assert.equal(secondPage.items[0].invoiceTotalDong, '25000');
    assert.equal(secondPage.nextCursor, null);
  });

  it('S-64: rejects malformed cursors and unauthenticated requests', async () => {
    const malformed = await fetch(`${baseUrl}/api/me/sessions/history?cursor=invalid`, {
      headers: { Cookie: driver.cookie },
    });
    assert.equal(malformed.status, 400);
    const unauthenticated = await fetch(`${baseUrl}/api/me/sessions/history`);
    assert.equal(unauthenticated.status, 401);
  });
});
