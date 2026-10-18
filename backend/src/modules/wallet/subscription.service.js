'use strict';

const { pool } = require('../../db/pool');
const { withTransaction } = require('../../db/tx');
const { BadRequestError, NotFoundError } = require('../../lib/errors');
const { postEntry } = require('./ledger.service');

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function formatSubscription(row) {
  return {
    id: row.id,
    planCode: row.plan_code,
    planName: row.plan_name,
    feeDong: Number(row.fee_dong),
    pricePerKwhDong: Number(row.price_per_kwh_dong),
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
  };
}

async function getSubscription(user, db = pool) {
  const result = await db.query(
    `SELECT code, name, fee_dong, price_per_kwh_dong, duration_days
     FROM subscription_plans
     WHERE code = 'VIP' AND active = TRUE`
  );
  const plan = result.rows[0];
  if (!plan) throw new NotFoundError('Không tìm thấy gói thuê bao đang mở bán');

  const currentResult = await db.query(
    `SELECT id, plan_code, plan_name, fee_dong, price_per_kwh_dong, starts_at, expires_at
     FROM driver_subscriptions
     WHERE driver_id = $1
       AND starts_at <= CURRENT_TIMESTAMP
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY starts_at DESC, id DESC
     LIMIT 1`,
    [user.id]
  );
  return {
    plan: {
      code: plan.code,
      name: plan.name,
      feeDong: Number(plan.fee_dong),
      pricePerKwhDong: Number(plan.price_per_kwh_dong),
      durationDays: plan.duration_days,
    },
    current: currentResult.rows[0] ? formatSubscription(currentResult.rows[0]) : null,
  };
}

async function purchaseSubscription(user, idempotencyKey, db = pool) {
  if (!idempotencyKey) throw new BadRequestError('Thiếu header Idempotency-Key');
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new BadRequestError('Idempotency-Key không hợp lệ');
  }

  return withTransaction(async (client) => {
    await client.query(
      'INSERT INTO wallets (driver_id) VALUES ($1) ON CONFLICT (driver_id) DO NOTHING',
      [user.id]
    );
    await client.query('SELECT driver_id FROM wallets WHERE driver_id = $1 FOR UPDATE', [user.id]);

    const existing = await client.query(
      `SELECT id, plan_code, plan_name, fee_dong, price_per_kwh_dong, starts_at, expires_at
       FROM driver_subscriptions
       WHERE driver_id = $1 AND idempotency_key = $2`,
      [user.id, idempotencyKey]
    );
    if (existing.rows[0]) return { subscription: formatSubscription(existing.rows[0]) };

    const planResult = await client.query(
      `SELECT id, code, name, fee_dong, price_per_kwh_dong, duration_days
       FROM subscription_plans
       WHERE code = 'VIP' AND active = TRUE
       FOR SHARE`
    );
    const plan = planResult.rows[0];
    if (!plan) throw new NotFoundError('Không tìm thấy gói thuê bao đang mở bán');

    const createdResult = await client.query(
      `INSERT INTO driver_subscriptions (
         driver_id, plan_id, plan_code, plan_name, fee_dong, price_per_kwh_dong,
         starts_at, expires_at, idempotency_key
       )
       SELECT $1, $2, $3, $4, $5, $6,
              GREATEST(CURRENT_TIMESTAMP, COALESCE(MAX(expires_at), CURRENT_TIMESTAMP)),
              GREATEST(CURRENT_TIMESTAMP, COALESCE(MAX(expires_at), CURRENT_TIMESTAMP))
                + ($7::integer * INTERVAL '1 day'),
              $8
       FROM driver_subscriptions
       WHERE driver_id = $1
       RETURNING id, plan_code, plan_name, fee_dong, price_per_kwh_dong, starts_at, expires_at`,
      [
        user.id,
        plan.id,
        plan.code,
        plan.name,
        plan.fee_dong,
        plan.price_per_kwh_dong,
        plan.duration_days,
        idempotencyKey,
      ]
    );
    const subscription = createdResult.rows[0];
    await postEntry(client, {
      driverId: user.id,
      entryType: 'SUBSCRIPTION_FEE',
      amountDong: (-BigInt(plan.fee_dong)).toString(),
      subscriptionId: subscription.id,
      reason: 'SUBSCRIPTION_PURCHASE',
      allowLocked: false,
    });
    return { subscription: formatSubscription(subscription) };
  }, db);
}

module.exports = { getSubscription, purchaseSubscription, formatSubscription };
