const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-57 AC: driver erasure anonymizes history and preserves financial totals', () => {
  let admin;
  let driver;
  let balanceDriver;
  let debtDriver;
  let activeDriver;
  let stationId;
  let chargePointId;
  let connectorId;
  let tariffId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('erasure-admin@test.invalid', 'ADMIN');
    driver = await createUser('erasure-driver@test.invalid', 'DRIVER', 'old-password-123');
    balanceDriver = await createUser('erasure-balance@test.invalid', 'DRIVER');
    debtDriver = await createUser('erasure-debt@test.invalid', 'DRIVER');
    activeDriver = await createUser('erasure-active@test.invalid', 'DRIVER');
    const station = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ('Erasure Station', 'Test', $1, 'ACTIVE') RETURNING id",
      [admin.id]
    );
    stationId = station.rows[0].id;
    const point = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'ERASURE-CP', 'ONLINE') RETURNING id",
      [stationId]
    );
    chargePointId = point.rows[0].id;
    const connector = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status) VALUES ($1, 1, 'AVAILABLE') RETURNING id",
      [chargePointId]
    );
    connectorId = connector.rows[0].id;
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong, created_by)
       VALUES ($1, 1, '2026-01-01', 0, 0, $2) RETURNING id`,
      [stationId, admin.id]
    );
    tariffId = tariff.rows[0].id;

    for (const user of [driver]) {
      await query(
        "INSERT INTO wallets (driver_id, balance_dong) VALUES ($1, 0)",
        [user.id]
      );
    }
    await query(
      'INSERT INTO wallets (driver_id, balance_dong) VALUES ($1, 15000)',
      [balanceDriver.id]
    );
    await query(
      "INSERT INTO wallets (driver_id, balance_dong) VALUES ($1, -1000)",
      [debtDriver.id]
    );
    await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, receipt_code, period_date)
       VALUES ($1, 'TOPUP_MANUAL', 15000, 15000, 'ERASURE-TOPUP', '2026-10-01')`,
      [balanceDriver.id]
    );
  });

  after(async () => {
    await resetSchema();
    run('src/db/migrate.js');
    await closePool();
  });

  async function addSessionInvoice({ owner, tag, startWh, stopWh, amountDong, date }) {
    const session = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status, billing_status
       ) VALUES ($1, $2, 1, $3, $4, $5, $6,
         ($7::date + TIME '01:00'), ($7::date + TIME '02:00'), 'COMPLETED', 'FINAL')
       RETURNING id`,
      [chargePointId, connectorId, owner.id, tag, startWh, stopWh, date]
    );
    const invoice = await query(
      `INSERT INTO session_invoices (
         session_id, driver_id, station_id, tariff_id, tariff_snapshot, timezone, total_dong, period_date
       ) VALUES ($1, $2, $3, $4, $5::jsonb, 'Asia/Ho_Chi_Minh', $6, $7::date)
       RETURNING id`,
      [
        session.rows[0].id,
        owner.id,
        stationId,
        tariffId,
        JSON.stringify({
          periods: [{ startMin: 0, endMin: 1440, pricePerKwh: 4000 }],
          idle: { graceMin: 0, perMinDong: 0 },
        }),
        amountDong,
        date,
      ]
    );
    await query(
      `INSERT INTO invoice_lines (
         invoice_id, seq, kind, local_date, from_at, to_at, wh, price_per_kwh, amount_dong
       ) VALUES ($1, 1, 'ENERGY', $2::date, ($2::date + TIME '01:00'),
         ($2::date + TIME '02:00'), $3, 4000, $4)`,
      [invoice.rows[0].id, date, stopWh - startWh, amountDong]
    );
    return { sessionId: session.rows[0].id, invoiceId: invoice.rows[0].id };
  }

  async function createAndApprove(user) {
    const created = await request(app)
      .post('/api/me/erasure-requests')
      .set('Cookie', user.cookie)
      .send({});
    assert.strictEqual(created.status, 201);
    const approved = await request(app)
      .post(`/api/admin/erasure-requests/${created.body.id}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    return { created, approved };
  }

  it('S-57 AC E01/E03/E04/E05: anonymizes closed-period history once, revokes login, and preserves totals', async () => {
    const sessions = [];
    sessions.push(await addSessionInvoice({ owner: driver, tag: 'ERASE-TAG-1', startWh: 0, stopWh: 10000, amountDong: 40000, date: '2026-09-10' }));
    sessions.push(await addSessionInvoice({ owner: driver, tag: 'ERASE-TAG-2', startWh: 0, stopWh: 10000, amountDong: 78000, date: '2026-10-10' }));
    sessions.push(await addSessionInvoice({ owner: driver, tag: 'ERASE-TAG-3', startWh: 1000, stopWh: 4001, amountDong: 7503, date: '2026-10-11' }));
    await query(
      "INSERT INTO id_tags (tag, user_id, status, is_virtual) VALUES ('ERASURE-CLEAR-TAG', $1, 'ACTIVE', FALSE)",
      [driver.id]
    );
    await query(
      `INSERT INTO notifications (user_id, kind, session_id, payload)
       VALUES ($1, 'SESSION_ENDED', $2, '{}')`,
      [driver.id, sessions[0].sessionId]
    );
    await query(
      "INSERT INTO email_outbox (user_id, subject, body, status) VALUES ($1, 'Thông báo', 'Nội dung', 'PENDING')",
      [driver.id]
    );
    await query(
      "INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, receipt_code, period_date) VALUES ($1, 'TOPUP_MANUAL', 125503, 125503, 'ERASURE-PRIMARY-TOPUP', '2026-10-01')",
      [driver.id]
    );
    let balance = 125503n;
    for (const [index, amount] of [-40000n, -78000n, -7503n].entries()) {
      balance += amount;
      await query(
        `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, session_id, period_date)
         VALUES ($1, 'SESSION_DEBIT', $2, $3, $4, '2026-10-01')`,
        [driver.id, amount.toString(), balance.toString(), sessions[index].sessionId]
      );
    }
    await query("UPDATE wallets SET balance_dong = 0 WHERE driver_id = $1", [driver.id]);
    await query("INSERT INTO accounting_periods (month, status) VALUES ('2026-09-01', 'OPEN')");
    await query("UPDATE accounting_periods SET status = 'CLOSED' WHERE month = '2026-09-01'");

    const revenueBefore = await request(app)
      .get('/api/reports/revenue?from=2026-09-01&to=2026-10-31')
      .set('Cookie', admin.cookie);
    assert.strictEqual(revenueBefore.status, 200);
    const ledgerBefore = await query(
      'SELECT COALESCE(SUM(amount_dong), 0)::text AS total FROM wallet_ledger WHERE driver_id = $1',
      [driver.id]
    );

    const { created, approved } = await createAndApprove(driver);
    assert.strictEqual(approved.status, 200);
    assert.strictEqual(approved.body.status, 'COMPLETED');

    const sessionState = await query(
      'SELECT COUNT(*)::int AS count FROM charging_sessions WHERE driver_id = $1',
      [driver.id]
    );
    assert.strictEqual(sessionState.rows[0].count, 0);
    const anonymized = await query(
      `SELECT COUNT(*)::int AS count
       FROM charging_sessions
       WHERE id = ANY($1::bigint[]) AND driver_id IS NULL AND id_tag_id IS NULL
         AND id_tag_masked = 'ER-' || upper(to_hex(id))`,
      [sessions.map((entry) => entry.sessionId)]
    );
    assert.strictEqual(anonymized.rows[0].count, 3);
    const invoices = await query(
      'SELECT COUNT(*)::int AS count FROM session_invoices WHERE session_id = ANY($1::bigint[]) AND driver_id IS NULL',
      [sessions.map((entry) => entry.sessionId)]
    );
    assert.strictEqual(invoices.rows[0].count, 3);

    const user = await query('SELECT name, email, password_hash, token_version FROM users WHERE id = $1', [driver.id]);
    assert.strictEqual(user.rows[0].name, 'Đã xoá');
    assert.strictEqual(user.rows[0].email, `erased-${driver.id}@erased.invalid`);
    assert.ok(user.rows[0].password_hash.startsWith('$argon2'));
    assert.strictEqual(user.rows[0].token_version, 1);
    assert.strictEqual((await query('SELECT 1 FROM id_tags WHERE user_id = $1', [driver.id])).rowCount, 0);
    assert.strictEqual((await query('SELECT 1 FROM notifications WHERE user_id = $1', [driver.id])).rowCount, 0);
    assert.strictEqual((await query('SELECT 1 FROM email_outbox WHERE user_id = $1', [driver.id])).rowCount, 0);
    assert.strictEqual((await query('SELECT 1 FROM users WHERE email = $1', ['erasure-driver@test.invalid'])).rowCount, 0);

    const oldToken = await request(app).get('/api/auth/me').set('Cookie', driver.cookie);
    assert.strictEqual(oldToken.status, 401);
    const oldLogin = await request(app).post('/api/auth/login').send({ email: 'erasure-driver@test.invalid', password: 'old-password-123' });
    assert.strictEqual(oldLogin.status, 401);
    const secondRequest = await request(app).post('/api/me/erasure-requests').set('Cookie', driver.cookie).send({});
    assert.strictEqual(secondRequest.status, 401);

    const revenueAfter = await request(app)
      .get('/api/reports/revenue?from=2026-09-01&to=2026-10-31')
      .set('Cookie', admin.cookie);
    assert.deepStrictEqual(revenueAfter.body.total, revenueBefore.body.total);
    const ledgerAfter = await query(
      'SELECT COALESCE(SUM(amount_dong), 0)::text AS total FROM wallet_ledger WHERE driver_id = $1',
      [driver.id]
    );
    assert.strictEqual(ledgerAfter.rows[0].total, ledgerBefore.rows[0].total);

    const audits = await query(
      `SELECT action, metadata::text AS metadata
       FROM audit_logs
       WHERE action = 'DATA_ERASURE_COMPLETED' AND entity_id = $1`,
      [created.body.id]
    );
    assert.strictEqual(audits.rowCount, 1);
    assert.doesNotMatch(audits.rows[0].metadata, /erasure-driver|ERASE-TAG|Đã xoá/i);
  });

  it('S-57 AC E02: blocks positive balance and debt until balance is zero', async () => {
    const positive = await request(app)
      .post('/api/me/erasure-requests')
      .set('Cookie', balanceDriver.cookie)
      .send({});
    assert.strictEqual(positive.status, 201);
    const blockedBalance = await request(app)
      .post(`/api/admin/erasure-requests/${positive.body.id}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    assert.strictEqual(blockedBalance.status, 409);
    assert.strictEqual(blockedBalance.body.error.code, 'BLOCKED_BALANCE');

    const adjustment = await request(app)
      .post(`/api/admin/wallets/${balanceDriver.id}/adjustments`)
      .set('Cookie', admin.cookie)
      .send({ amountDong: '-15000', reason: 'Hoàn tiền theo yêu cầu xóa dữ liệu' });
    assert.strictEqual(adjustment.status, 201);
    const approved = await request(app)
      .post(`/api/admin/erasure-requests/${positive.body.id}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    assert.strictEqual(approved.status, 200);

    const negative = await request(app)
      .post('/api/me/erasure-requests')
      .set('Cookie', debtDriver.cookie)
      .send({});
    const blockedDebt = await request(app)
      .post(`/api/admin/erasure-requests/${negative.body.id}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    assert.strictEqual(blockedDebt.status, 409);
    assert.strictEqual(blockedDebt.body.error.code, 'BLOCKED_DEBT');
  });

  it('S-57 AC E06: blocks erasure while a session is charging', async () => {
    const active = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, started_at, status
       ) VALUES ($1, $2, 1, $3, 'ACTIVE-ERASURE-TAG', 0, CURRENT_TIMESTAMP, 'CHARGING')
       RETURNING id`,
      [chargePointId, connectorId, activeDriver.id]
    );
    const requested = await request(app)
      .post('/api/me/erasure-requests')
      .set('Cookie', activeDriver.cookie)
      .send({});
    const blocked = await request(app)
      .post(`/api/admin/erasure-requests/${requested.body.id}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    assert.strictEqual(blocked.status, 409);
    assert.strictEqual(blocked.body.error.code, 'BLOCKED_ACTIVE');
    assert.ok(active.rows[0].id);
  });
});
