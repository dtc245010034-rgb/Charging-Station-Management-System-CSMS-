const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./partners.service');
const { ownerIdParam, shareRateBody } = require('./partners.schema');

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

module.exports = router;
