'use strict';

const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./subscriptions.service');
const { createPlanSchema, buySubscriptionSchema } = require('./subscriptions.schema');

const router = secureRouter();

router.get('/subscription-plans', { access: access('plans:read') }, async (req, res) => {
  res.json(await service.listPlans(req.user));
});

router.post('/subscription-plans', { access: access('plans:manage') }, async (req, res) => {
  const data = createPlanSchema.parse(req.body ?? {});
  const plan = await service.createPlan(req.user, data, req.ip);
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
