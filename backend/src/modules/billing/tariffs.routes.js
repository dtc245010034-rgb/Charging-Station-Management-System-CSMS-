const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { idParam } = require('../../lib/schemas');
const service = require('./tariffs.service');
const { tariffCreateBody } = require('./tariffs.schema');

const router = secureRouter();

router.get('/stations/:id/tariffs', { access: access('tariffs:read') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await service.list(req.user, id));
});

router.post('/stations/:id/tariffs', { access: access('tariffs:write') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = tariffCreateBody.parse(req.body ?? {});
  res.status(201).json(await service.create(req.user, id, data));
});

module.exports = router;
