'use strict';

const { pool } = require('../../db/pool');

async function listPlans(db = pool, { activeOnly = false } = {}) {
  const query = activeOnly
    ? 'SELECT * FROM subscription_plans WHERE active = TRUE ORDER BY id ASC'
    : 'SELECT * FROM subscription_plans ORDER BY id ASC';
  const res = await db.query(query);
  return res.rows;
}

async function findPlanById(db = pool, id) {
  const res = await db.query('SELECT * FROM subscription_plans WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function findPlanByCode(db = pool, code) {
  const res = await db.query('SELECT * FROM subscription_plans WHERE code = $1', [code]);
  return res.rows[0] || null;
}

async function periodsOfPlan(db = pool, planId) {
  const res = await db.query(
    'SELECT * FROM subscription_plan_periods WHERE plan_id = $1 ORDER BY start_minute ASC',
    [planId]
  );
  return res.rows;
}

async function insertPlan(db = pool, {
  code,
  name,
  priceDong,
  durationDays = 30,
  idleGraceMin = null,
  idlePerMinDong = null,
  createdBy = null,
}) {
  const res = await db.query(
    `INSERT INTO subscription_plans (code, name, price_dong, duration_days, idle_grace_min, idle_per_min_dong, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [code, name, priceDong, durationDays, idleGraceMin, idlePerMinDong, createdBy]
  );
  return res.rows[0];
}

async function insertPeriods(db = pool, planId, periods) {
  for (const p of periods) {
    await db.query(
      `INSERT INTO subscription_plan_periods (plan_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, $2, $3, $4, $5)`,
      [planId, p.startMinute, p.endMinute, p.pricePerKwhDong, p.label]
    );
  }
}

async function retirePlan(db = pool, id) {
  const res = await db.query(
    'UPDATE subscription_plans SET active = FALSE WHERE id = $1 AND active = TRUE RETURNING *',
    [id]
  );
  return res.rows[0] || null;
}

async function findSubscriptionByIdempotencyKey(db = pool, driverId, idempotencyKey) {
  const res = await db.query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name
     FROM subscriptions s
     JOIN subscription_plans p ON s.plan_id = p.id
     WHERE s.driver_id = $1 AND s.idempotency_key = $2
     LIMIT 1`,
    [driverId, idempotencyKey]
  );
  return res.rows[0] || null;
}

async function findActiveSubscriptionForDriver(db = pool, driverId, at = new Date()) {
  const timestamp = at instanceof Date ? at.toISOString() : at;
  const res = await db.query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name, p.duration_days, p.idle_grace_min, p.idle_per_min_dong
     FROM subscriptions s
     JOIN subscription_plans p ON s.plan_id = p.id
     WHERE s.driver_id = $1 AND s.starts_at <= $2 AND $2 < s.ends_at
     ORDER BY s.id DESC
     LIMIT 1`,
    [driverId, timestamp]
  );
  return res.rows[0] || null;
}

async function listSubscriptionsForDriver(db = pool, driverId) {
  const res = await db.query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name
     FROM subscriptions s
     JOIN subscription_plans p ON s.plan_id = p.id
     WHERE s.driver_id = $1
     ORDER BY s.starts_at DESC, s.id DESC`,
    [driverId]
  );
  return res.rows;
}

async function insertSubscription(db = pool, {
  driverId,
  planId,
  startsAt,
  endsAt,
  priceDong,
  idempotencyKey,
}) {
  const res = await db.query(
    `INSERT INTO subscriptions (driver_id, plan_id, starts_at, ends_at, price_dong, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [driverId, planId, startsAt, endsAt, priceDong, idempotencyKey]
  );
  return res.rows[0];
}

module.exports = {
  listPlans,
  findPlanById,
  findPlanByCode,
  periodsOfPlan,
  insertPlan,
  insertPeriods,
  retirePlan,
  findSubscriptionByIdempotencyKey,
  findActiveSubscriptionForDriver,
  listSubscriptionsForDriver,
  insertSubscription,
};
