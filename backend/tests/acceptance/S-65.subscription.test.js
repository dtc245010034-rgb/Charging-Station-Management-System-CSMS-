'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { finalizeSession } = require('../../src/modules/billing/finalize-session');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');

describe('S-65 AC: monthly VIP subscription', { concurrency: false }, () => {
  let driver;
  let lowBalanceDriver;
  let stationId;

  const subscription = (user = driver) => request(app)
    .get('/api/me/subscription')
    .set('Cookie', user.cookie);

  const purchase = (key, user = driver) => request(app)
    .post('/api/me/subscription')
    .set('Cookie', user.cookie)
    .set('Idempotency-Key', key)
    .send({});

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    driver = await createUser('s65-driver@test.invalid', 'DRIVER');
    lowBalanceDriver = await createUser('s65-low-driver@test.invalid', 'DRIVER');
    const owner = await createUser('s65-owner@test.invalid', 'STATION_OWNER');
    const station = await postStation(owner, stationBody({ name: 'S-65 subscription station' }));
    stationId = station.body.id;
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [stationId]);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
       VALUES ($1, 1, $2::date, 0, 0) RETURNING id`,
      [stationId, today]
    );
    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, 0, 1440, 4000, 'Standard')`,
      [tariff.rows[0].id]
    );
    await withTransaction((client) => postEntry(client, {
      driverId: driver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 1000000,
      receiptCode: `S65-TOPUP-${Date.now()}`,
    }));
    await withTransaction((client) => postEntry(client, {
      driverId: lowBalanceDriver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 1000,
      receiptCode: `S65-LOW-TOPUP-${Date.now()}`,
    }));
  });

  after(async () => {
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('S-65 AC: purchases VIP from the wallet once per idempotency key and extends by 30 days', async () => {
    const planResponse = await subscription();
    assert.equal(planResponse.status, 200);
    assert.deepEqual(planResponse.body.plan, {
      code: 'VIP',
      name: 'VIP',
      feeDong: 299000,
      pricePerKwhDong: 30000,
      durationDays: 30,
    });
    assert.equal(planResponse.body.current, null);

    const first = await purchase('s65-vip-first-purchase');
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.subscription.planName, 'VIP');
    assert.equal(first.body.subscription.feeDong, 299000);
    assert.equal(first.body.subscription.pricePerKwhDong, 30000);

    const replay = await purchase('s65-vip-first-purchase');
    assert.equal(replay.status, 201);
    assert.equal(replay.body.subscription.id, first.body.subscription.id);

    const second = await purchase('s65-vip-second-purchase');
    assert.equal(second.status, 201, JSON.stringify(second.body));
    const periods = await query(
      `SELECT EXTRACT(EPOCH FROM (next.starts_at - prior.expires_at)) AS gap_seconds
       FROM driver_subscriptions prior
       JOIN driver_subscriptions next ON next.id = $2
       WHERE prior.id = $1`,
      [first.body.subscription.id, second.body.subscription.id]
    );
    assert.equal(Number(periods.rows[0].gap_seconds), 0);

    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id]);
    const fees = await query(
      "SELECT count(*)::int AS count FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'SUBSCRIPTION_FEE'",
      [driver.id]
    );
    assert.equal(wallet.rows[0].balance_dong, '402000');
    assert.equal(fees.rows[0].count, 2);
  });

  it('S-65 AC: rejects purchase when the wallet cannot cover the fee', async () => {
    const response = await purchase('s65-low-balance-purchase', lowBalanceDriver);
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'INSUFFICIENT_BALANCE');
    const purchases = await query('SELECT id FROM driver_subscriptions WHERE driver_id = $1', [lowBalanceDriver.id]);
    assert.equal(purchases.rowCount, 0);
  });

  it('S-65 AC: bills an active VIP session at the package rate and snapshots the plan on its invoice', async () => {
    const current = await query(
      `SELECT starts_at FROM driver_subscriptions
       WHERE driver_id = $1 ORDER BY id LIMIT 1`,
      [driver.id]
    );
    const startedAt = new Date(new Date(current.rows[0].starts_at).getTime() + 1000);
    const stoppedAt = new Date(startedAt.getTime() + 60000);
    const point = await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'S65-INVOICE-CP') RETURNING id",
      [stationId]
    );
    const connector = await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
      [point.rows[0].id]
    );
    const session = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         status, meter_start, meter_stop, started_at, stopped_at
       ) VALUES ($1, $2, 1, $3, 'S65-***', 'COMPLETED', 1000, 2000, $4, $5)
       RETURNING id`,
      [point.rows[0].id, connector.rows[0].id, driver.id, startedAt.toISOString(), stoppedAt.toISOString()]
    );

    const outcome = await finalizeSession(session.rows[0].id);
    assert.equal(outcome.status, 'FINAL');
    assert.equal(String(outcome.invoice.totalDong), '30000');
    assert.equal(outcome.invoice.tariffSnapshot.subscription.planName, 'VIP');
    assert.equal(outcome.invoice.tariffSnapshot.subscription.pricePerKwhDong, 30000);

    const response = await request(app)
      .get(`/api/sessions/${session.rows[0].id}/invoice`)
      .set('Cookie', driver.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.invoice.tariffSnapshot.subscription.planName, 'VIP');
  });
});
