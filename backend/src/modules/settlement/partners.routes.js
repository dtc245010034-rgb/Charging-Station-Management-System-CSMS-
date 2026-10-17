const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./partners.service');
const { ownerIdParam, shareRateBody } = require('./partners.schema');
const { accountingPeriodMonth } = require('../../lib/schemas');
const statements = require('./statements.service');

const router = secureRouter();

router.get('/partners', { access: access('partner-rates:read') }, async (req, res) => {
  res.json(await service.listPartners(req.user));
});

router.get('/partners/:ownerId/share-rates', { access: access('partner-rates:read') }, async (req, res) => {
  const { ownerId } = ownerIdParam.parse(req.params);
  res.json(await service.listRates(req.user, ownerId));
});

router.post('/partners/:ownerId/share-rates', { access: access('partner-rates:manage') }, async (req, res) => {
  const { ownerId } = ownerIdParam.parse(req.params);
  const data = shareRateBody.parse(req.body ?? {});
  res.status(201).json(await service.createRate(req.user, ownerId, data));
});

router.post('/accounting/settlements/:month/generate', { access: access('settlements:manage') }, async (req, res) => {
  const month = accountingPeriodMonth.parse(req.params.month);
  res.status(201).json(await statements.generate(req.user, month));
});

router.get('/accounting/settlements/:month', { access: access('settlements:read') }, async (req, res) => {
  const month = accountingPeriodMonth.parse(req.params.month);
  res.json(await statements.get(req.user, month));
});

module.exports = router;
