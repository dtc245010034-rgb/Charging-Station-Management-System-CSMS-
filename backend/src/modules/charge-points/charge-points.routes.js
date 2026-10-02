const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { idParam, stationIdParam } = require('../../lib/schemas');
const { BadRequestError } = require('../../lib/errors');
const { CHARGE_POINT_CODE_PATTERN, CHARGE_POINT_CODE_MESSAGE } = require('../../lib/constants');
const service = require('./charge-points.service');
const { createBody, updateBody } = require('./charge-points.schema');

const router = secureRouter();

router.get('/charge-points', { access: access('charge-points:read') }, async (req, res) => res.json(await service.list(req.user)));
router.get('/charge-points/check-code', { access: access('charge-points:read') }, async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code.trim().toUpperCase() : '';
  if (!code || !CHARGE_POINT_CODE_PATTERN.test(code)) throw new BadRequestError(CHARGE_POINT_CODE_MESSAGE);
  res.json({ is_available: await service.isCodeAvailable(code) });
});
router.get('/charge-points/:id', { access: access('charge-points:read') }, async (req, res) => {
  res.json(await service.get(req.user, idParam.parse(req.params).id));
});
router.post('/stations/:stationId/charge-points', { access: access('charge-points:write') }, async (req, res) => {
  const { stationId } = stationIdParam.parse(req.params);
  res.status(201).json(await service.create(req.user, stationId, createBody.parse(req.body ?? {})));
});
router.patch('/charge-points/:id', { access: access('charge-points:write') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await service.update(req.user, id, updateBody.parse(req.body ?? {})));
});

module.exports = router;
