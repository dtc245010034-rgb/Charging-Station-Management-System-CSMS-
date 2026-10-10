const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { idParam } = require('../../lib/schemas');
const service = require('./remote-start.service');

const router = secureRouter();

router.get('/driver/charge-points', { access: access('charge-points:read-driver') }, async (req, res) => {
  res.json(await service.listDriverChargePoints());
});

router.post('/connectors/:id/start', { access: access('remote-start:create') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const result = await service.requestRemoteStart(req.user, Number(id), { commandSender: req.app.locals.commandSender });
  res.status(202).json(result);
});

router.get('/me/remote-start-requests/:id', { access: access('remote-start:create') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await service.getRemoteStartRequest(req.user.id, Number(id)));
});

module.exports = router;
