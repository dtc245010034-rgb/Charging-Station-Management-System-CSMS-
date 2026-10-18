'use strict';

const repo = require('./subscriptions.repository');
const audit = require('../audit/audit.repository');
const { withTransaction } = require('../../db/tx');
const { postEntry } = require('../wallet/ledger.service');
const { BadRequestError, NotFoundError, ConflictError, AppError } = require('../../lib/errors');
const { normalizePeriods, minutesToTime } = require('./tariff-periods');

function formatPlan(plan, periods = []) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    priceDong: plan.price_dong,
    durationDays: plan.duration_days,
    idleGraceMin: plan.idle_grace_min,
    idlePerMinDong: plan.idle_per_min_dong,
    active: plan.active,
    createdBy: plan.created_by,
    createdAt: plan.created_at,
    periods: periods.map((p) => ({
      startMinute: p.start_minute,
      endMinute: p.end_minute,
      from: minutesToTime(p.start_minute),
      to: minutesToTime(p.end_minute),
      pricePerKwh: p.price_per_kwh_dong,
      label: p.label,
    })),
  };
}

function formatSubscription(sub) {
  return {
    id: sub.id,
    driverId: sub.driver_id,
    planId: sub.plan_id,
    planCode: sub.plan_code,
    planName: sub.plan_name,
    startsAt: sub.starts_at,
    endsAt: sub.ends_at,
    priceDong: sub.price_dong,
    idempotencyKey: sub.idempotency_key,
    createdAt: sub.created_at,
  };
}

async function listPlans(actor) {
  const roles = actor?.roles || [];
  const isAdminOrAccountant = roles.includes('ADMIN') || roles.includes('ACCOUNTANT');
  const rawPlans = await repo.listPlans(undefined, { activeOnly: !isAdminOrAccountant });

  const result = [];
  for (const plan of rawPlans) {
    const periods = await repo.periodsOfPlan(undefined, plan.id);
    result.push(formatPlan(plan, periods));
  }
  return result;
}

async function createPlan(actor, data, ip = null) {
  const normalized = normalizePeriods(data.periods);
  if (!normalized.ok) {
    const err = new BadRequestError('Biểu giá của gói phải phủ kín 24 giờ và không chồng lấn');
    err.details = { errors: normalized.errors };
    throw err;
  }

  const existing = await repo.findPlanByCode(undefined, data.code);
  if (existing) {
    throw new ConflictError('Mã gói thuê bao đã tồn tại');
  }

  const periodsToInsert = normalized.periods.map((p) => ({
    startMinute: p.startMin,
    endMinute: p.endMin,
    pricePerKwhDong: p.pricePerKwh,
    label: p.label,
  }));

  const created = await withTransaction(async (client) => {
    const plan = await repo.insertPlan(client, {
      code: data.code,
      name: data.name,
      priceDong: data.priceDong,
      durationDays: data.durationDays,
      idleGraceMin: data.idleGraceMin,
      idlePerMinDong: data.idlePerMinDong,
      createdBy: actor.id,
    });
    await repo.insertPeriods(client, plan.id, periodsToInsert);

    await audit.record(
      actor.id,
      'SUBSCRIPTION_PLAN_CREATED',
      'subscription_plan',
      plan.id,
      { code: plan.code, priceDong: plan.price_dong, durationDays: plan.duration_days },
      ip,
      null,
      'COMPLETED'
    );

    return plan;
  });

  return formatPlan(created, periodsToInsert);
}

async function retirePlan(actor, planId, ip = null) {
  const parsedId = Number(planId);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
    throw new BadRequestError('Mã gói không hợp lệ');
  }

  const plan = await repo.findPlanById(undefined, parsedId);
  if (!plan) {
    throw new NotFoundError('Không tìm thấy gói thuê bao');
  }

  if (!plan.active) {
    throw new ConflictError('Gói thuê bao đã ngừng bán trước đó');
  }

  const retired = await repo.retirePlan(undefined, parsedId);
  await audit.record(
    actor.id,
    'SUBSCRIPTION_PLAN_RETIRED',
    'subscription_plan',
    parsedId,
    { code: plan.code },
    ip,
    null,
    'COMPLETED'
  );

  return { id: retired.id, code: retired.code, active: false };
}

async function buySubscription(driver, { planId }, idempotencyKey, { ip = null, now = new Date() } = {}) {
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw new BadRequestError('Idempotency-Key không hợp lệ');
  }

  const parsedPlanId = Number(planId);
  if (!Number.isSafeInteger(parsedPlanId) || parsedPlanId <= 0) {
    throw new BadRequestError('Mã gói không hợp lệ');
  }

  const currentTime = now instanceof Date ? now : new Date(now);

  const purchased = await withTransaction(async (client) => {
    // Advisory lock theo idempotency key của tài xế
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `subscription:${driver.id}:${idempotencyKey}`,
    ]);

    const prior = await repo.findSubscriptionByIdempotencyKey(client, driver.id, idempotencyKey);
    if (prior) {
      return { subscription: prior, replayed: true };
    }

    const plan = await repo.findPlanById(client, parsedPlanId);
    if (!plan) {
      throw new NotFoundError('Không tìm thấy gói thuê bao');
    }
    if (!plan.active) {
      throw new AppError(409, 'PLAN_NOT_ACTIVE', 'Gói thuê bao không còn hiệu lực để mua');
    }

    const startsAt = currentTime.toISOString();
    const durationDays = plan.duration_days || 30;
    const endsAt = new Date(currentTime.getTime() + durationDays * 86400000).toISOString();

    let newSub;
    try {
      newSub = await repo.insertSubscription(client, {
        driverId: driver.id,
        planId: plan.id,
        startsAt,
        endsAt,
        priceDong: plan.price_dong,
        idempotencyKey,
      });
    } catch (err) {
      if (err.code === '23P01') {
        throw new AppError(409, 'SUBSCRIPTION_ACTIVE', 'Bạn đang có gói thuê bao còn hiệu lực.');
      }
      if (err.code === '23505') {
        const replay = await repo.findSubscriptionByIdempotencyKey(client, driver.id, idempotencyKey);
        if (replay) return { subscription: replay, replayed: true };
      }
      throw err;
    }

    // Trừ tiền ví qua postEntry (SUBSCRIPTION_FEE, âm).
    // Nếu ví không đủ tiền, postEntry sẽ ném InsufficientBalanceError (409 INSUFFICIENT_BALANCE)
    await postEntry(client, {
      driverId: driver.id,
      entryType: 'SUBSCRIPTION_FEE',
      amountDong: (-BigInt(plan.price_dong)).toString(),
      subscriptionId: newSub.id,
      reason: `Mua gói ${plan.code}`,
    });

    await audit.record(
      driver.id,
      'SUBSCRIPTION_PURCHASED',
      'subscription',
      newSub.id,
      {
        planId: plan.id,
        planCode: plan.code,
        priceDong: plan.price_dong,
        startsAt,
        endsAt,
      },
      ip,
      null,
      'COMPLETED'
    );

    newSub.plan_code = plan.code;
    newSub.plan_name = plan.name;
    return { subscription: newSub, replayed: false };
  });

  return formatSubscription(purchased.subscription);
}

async function listMySubscriptions(driver) {
  const subscriptions = await repo.listSubscriptionsForDriver(undefined, driver.id);
  return subscriptions.map(formatSubscription);
}

module.exports = {
  listPlans,
  createPlan,
  retirePlan,
  buySubscription,
  listMySubscriptions,
};
