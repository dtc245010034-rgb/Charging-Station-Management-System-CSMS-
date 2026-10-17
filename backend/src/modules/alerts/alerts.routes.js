const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { idParam } = require('../../lib/schemas');
const service = require('./alerts.service');
const { alertsQuery } = require('./alerts.schema');

const router = secureRouter();

router.get('/alerts', { access: access('alerts:read') }, async (req, res) => {
  const { state } = alertsQuery.parse(req.query);
  res.json(await service.list(req.user, state));
});

router.post('/alerts/:id/close', { access: access('alerts:close') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await service.close(req.user, id, { ip: req.ip }));
});

module.exports = router;
