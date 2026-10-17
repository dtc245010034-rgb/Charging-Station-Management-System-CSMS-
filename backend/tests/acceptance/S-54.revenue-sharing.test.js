const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-54 AC: monthly partner revenue sharing', () => {
  let admin;
  let owner;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.equal(migrated.status, 0, migrated.stderr);
    admin = await createUser('s54-admin@test.invalid', 'ADMIN');
    owner = await createUser('s54-owner@test.invalid', 'STATION_OWNER');

    const station = await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('S54 station', 'Test', $1) RETURNING id",
      [owner.id]
    );
    const chargePoint = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'S54-CP', 'ONLINE') RETURNING id",
      [station.rows[0].id]
    );
    const connector = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
       VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id`,
      [chargePoint.rows[0].id]
    );
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, created_by)
       VALUES ($1, 1, '2026-01-01', $2) RETURNING id`,
      [station.rows[0].id, owner.id]
    );
    const session = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, meter_start,
         meter_stop, started_at, stopped_at, status, billing_status
       )
       VALUES ($1, $2, 1, 'S54-TAG', 0, 1000, '2026-09-12T10:00:00Z',
               '2026-09-12T10:10:00Z', 'COMPLETED', 'FINAL')
       RETURNING id`,
      [chargePoint.rows[0].id, connector.rows[0].id]
    );
    const invoice = await query(
      `INSERT INTO session_invoices (
         session_id, driver_id, station_id, tariff_id, tariff_snapshot, timezone,
         total_dong, period_date
       )
       VALUES ($1, NULL, $2, $3, '{}'::jsonb, 'Asia/Ho_Chi_Minh', 110000, '2026-09-12')
       RETURNING id`,
      [session.rows[0].id, station.rows[0].id, tariff.rows[0].id]
    );
    await query(
      `INSERT INTO invoice_lines
         (invoice_id, seq, kind, local_date, from_at, to_at, wh, amount_dong)
       VALUES
         ($1, 1, 'ENERGY', '2026-09-12', '2026-09-12T10:00:00Z', '2026-09-12T10:10:00Z', 1000, 100000),
         ($1, 2, 'IDLE', '2026-09-12', '2026-09-12T10:10:00Z', '2026-09-12T10:20:00Z', 0, 10000)`,
      [invoice.rows[0].id]
    );
    await query(
      `INSERT INTO partner_share_rates (owner_id, share_bp, include_idle, effective_from, created_by)
       VALUES ($1, 7000, true, '2026-01-01', $2)`,
      [owner.id, admin.id]
    );
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('chỉ tạo được bảng kê sau khi chốt kỳ; tiền chia dùng tỉ lệ hiệu lực và include_idle', async () => {
    const notClosed = await request(app)
      .post('/api/settlements/2026-09/generate')
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(notClosed.status, 409);
    assert.equal(notClosed.body.error.code, 'PERIOD_NOT_CLOSED');

    await query(
      "INSERT INTO accounting_periods (month, status, closed_by, closed_at) VALUES ('2026-09-01', 'CLOSED', $1, CURRENT_TIMESTAMP)",
      [admin.id]
    );
    const response = await request(app)
      .post('/api/settlements/2026-09/generate')
      .set('Cookie', admin.cookie)
      .send({});

    assert.equal(response.status, 201);
    assert.equal(response.body.statement.revenue_dong, '110000');
    assert.equal(response.body.statement.share_dong, '77000');
    assert.equal(response.body.statement.platform_dong, '33000');
    assert.equal(response.body.lines.length, 1);
    assert.equal(response.body.lines[0].base_dong, '110000');
    assert.equal(response.body.lines[0].share_dong, '77000');

    const persisted = await query(
      `SELECT s.version, s.revenue_dong, s.share_dong, l.energy_dong, l.idle_dong
       FROM settlement_statements s JOIN settlement_lines l ON l.statement_id = s.id`
    );
    assert.equal(Number(persisted.rows[0].version), 1);
    assert.equal(String(persisted.rows[0].revenue_dong), '110000');
    assert.equal(String(persisted.rows[0].share_dong), '77000');
    assert.equal(String(persisted.rows[0].energy_dong), '100000');
    assert.equal(String(persisted.rows[0].idle_dong), '10000');
  });

  it('không cho chủ trạm tạo bảng kê hệ thống', async () => {
    const response = await request(app)
      .post('/api/settlements/2026-09/generate')
      .set('Cookie', owner.cookie)
      .send({});
    assert.equal(response.status, 403);
  });
});
