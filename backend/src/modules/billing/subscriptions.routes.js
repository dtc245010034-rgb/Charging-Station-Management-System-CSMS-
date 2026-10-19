'use strict';

const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./subscriptions.service');
const { BadRequestError } = require('../../lib/errors');
const { createPlanSchema, buySubscriptionSchema } = require('./subscriptions.schema');

const router = secureRouter();

router.get('/subscription-plans', { access: access('plans:read') }, async (req, res) => {
  res.json(await service.listPlans(req.user));
});

router.post('/subscription-plans', { access: access('plans:manage') }, async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!key) throw new BadRequestError('Thiếu header Idempotency-Key');
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new BadRequestError('Idempotency-Key không hợp lệ');
  const data = createPlanSchema.parse(req.body ?? {});
  const plan = await service.createPlan(req.user, data, key, req.ip);
  res.status(201).json(plan);
});

router.post('/subscription-plans/:id/retire', { access: access('plans:manage') }, async (req, res) => {
  res.json(await service.retirePlan(req.user, req.params.id, req.ip));
});

router.post('/me/subscriptions', { access: access('subscriptions:buy') }, async (req, res) => {
  const idempotencyKey = req.header('idempotency-key');
  const data = buySubscriptionSchema.parse(req.body ?? {});
  const { subscription } = await service.buySubscription(req.user, data, idempotencyKey, { ip: req.ip });
  res.status(201).json(subscription);
});

router.get('/me/subscriptions', { access: access('subscriptions:read-own') }, async (req, res) => {
  res.json(await service.listMySubscriptions(req.user));
});

module.exports = router;
