const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-54 AC: settlement statements are generated from closed periods', () => {
  let admin;
  let accountant;
  let ownerA;
  let ownerB;
  let driver;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('settlement-admin@test.invalid', 'ADMIN');
    accountant = await createUser('settlement-accountant@test.invalid', 'ACCOUNTANT');
    ownerA = await createUser('settlement-owner-a@test.invalid', 'STATION_OWNER');
    ownerB = await createUser('settlement-owner-b@test.invalid', 'STATION_OWNER');
    driver = await createUser('settlement-driver@test.invalid', 'DRIVER');
    await createInvoiceFixture(ownerA, 'SETTLEMENT-A', 10000, 2000);
    await createInvoiceFixture(ownerB, 'SETTLEMENT-B', 5000, 4000);
    await query(
      "INSERT INTO accounting_periods (month, status, closed_at, closed_by) VALUES ('2026-09-01', 'CLOSED', CURRENT_TIMESTAMP, $1)",
      [accountant.id]
    );
  });

  after(async () => {
    await resetSchema();
    run('src/db/migrate.js');
    await closePool();
  });

  async function createInvoiceFixture(owner, code, energyDong, idleDong) {
    const station = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ($1, 'Test', $2, 'ACTIVE') RETURNING id",
      [code, owner.id]
    );
    const chargePoint = await query(
      'INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, $3) RETURNING id',
      [station.rows[0].id, code, 'ONLINE']
    );
    const connector = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id",
      [chargePoint.rows[0].id]
    );
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong, created_by)
       VALUES ($1, 1, '2026-01-01', 0, 0, $2) RETURNING id`,
      [station.rows[0].id, admin.id]
    );
    const session = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status, billing_status
       ) VALUES ($1, $2, 1, $3, $4, 0, 1000,
         '2026-09-15T01:00:00Z', '2026-09-15T02:00:00Z', 'COMPLETED', 'FINAL')
       RETURNING id`,
      [chargePoint.rows[0].id, connector.rows[0].id, driver.id, code]
    );
    const invoice = await query(
      `INSERT INTO session_invoices (
         session_id, driver_id, station_id, tariff_id, tariff_snapshot, timezone,
         total_dong, period_date
       ) VALUES ($1, $2, $3, $4, '{}'::jsonb, 'Asia/Ho_Chi_Minh', $5, '2026-09-15')
       RETURNING id`,
      [session.rows[0].id, driver.id, station.rows[0].id, tariff.rows[0].id, energyDong + idleDong]
    );
    await query(
      `INSERT INTO invoice_lines (
         invoice_id, seq, kind, local_date, from_at, to_at, wh, price_per_kwh, amount_dong
       ) VALUES
         ($1, 1, 'ENERGY', '2026-09-15', '2026-09-15T01:00:00Z', '2026-09-15T01:30:00Z', 1000, 10000, $2),
         ($1, 2, 'IDLE', '2026-09-15', '2026-09-15T01:30:00Z', '2026-09-15T02:00:00Z', 0, NULL, $3)`,
      [invoice.rows[0].id, energyDong, idleDong]
    );
  }

  it('S-54 AC: refuses missing rates, generates fixed totals, and rejects duplicate statements', async () => {
    const missingRate = await request(app)
      .post('/api/accounting/settlements/2026-09/generate')
      .set('Cookie', accountant.cookie)
      .send({});
    assert.equal(missingRate.status, 409);
    assert.equal(missingRate.body.error.code, 'MISSING_RATE');
    assert.equal(missingRate.body.error.details.length, 2);

    await query(
      `INSERT INTO partner_share_rates (owner_id, share_bp, include_idle, effective_from, created_by)
       VALUES ($1, 5000, TRUE, '2026-01-01', $3),
              ($2, 8000, FALSE, '2026-01-01', $3)`,
      [ownerA.id, ownerB.id, accountant.id]
    );
    const generated = await request(app)
      .post('/api/accounting/settlements/2026-09/generate')
      .set('Cookie', accountant.cookie)
      .send({});
    assert.equal(generated.status, 201);
    assert.equal(generated.body.version, 1);
    assert.deepStrictEqual(generated.body.totals, {
      revenueDong: '21000',
      shareDong: '10000',
      platformDong: '11000',
    });
    assert.equal(generated.body.lines.length, 2);

    const duplicate = await request(app)
      .post('/api/accounting/settlements/2026-09/generate')
      .set('Cookie', accountant.cookie)
      .send({});
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'SETTLEMENT_EXISTS');

    const audit = await query(
      "SELECT metadata FROM audit_logs WHERE action = 'SETTLEMENT_STATEMENT_CREATED' AND entity_id = $1",
      [generated.body.id]
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].metadata.version, 1);
  });

  it('S-54 AC: filters statement lines and totals to the requesting station owner', async () => {
    const own = await request(app)
      .get('/api/accounting/settlements/2026-09')
      .set('Cookie', ownerA.cookie);
    assert.equal(own.status, 200);
    assert.equal(own.body.lines.length, 1);
    assert.equal(own.body.lines[0].ownerId, String(ownerA.id));
    assert.deepStrictEqual(own.body.totals, {
      revenueDong: '12000',
      shareDong: '6000',
      platformDong: '6000',
    });

    const other = await request(app)
      .get('/api/accounting/settlements/2026-09')
      .set('Cookie', ownerB.cookie);
    assert.equal(other.status, 200);
    assert.deepStrictEqual(other.body.lines.map((line) => line.ownerId), [String(ownerB.id)]);
  });

  it('S-54 AC: creates a new immutable version after the period is reopened and reclosed', async () => {
    const reopened = await request(app)
      .post('/api/accounting/periods/2026-09/reopen')
      .set('Cookie', admin.cookie)
      .send({ reason: 'Điều chỉnh sau khi kiểm tra' });
    assert.equal(reopened.status, 200);

    const openAttempt = await request(app)
      .post('/api/accounting/settlements/2026-09/generate')
      .set('Cookie', accountant.cookie)
      .send({});
    assert.equal(openAttempt.status, 409);
    assert.equal(openAttempt.body.error.code, 'PERIOD_NOT_CLOSED');

    const closed = await request(app)
      .post('/api/accounting/periods/2026-09/close')
      .set('Cookie', accountant.cookie)
      .send({});
    assert.equal(closed.status, 200);

    const generated = await request(app)
      .post('/api/accounting/settlements/2026-09/generate')
      .set('Cookie', accountant.cookie)
      .send({});
    assert.equal(generated.status, 201);
    assert.equal(generated.body.version, 2);
    assert.equal(String(generated.body.supersedesId), String(1));
  });
});
