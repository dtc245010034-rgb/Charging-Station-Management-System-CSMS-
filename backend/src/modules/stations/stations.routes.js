const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { idParam } = require('../../lib/schemas');
const service = require('./stations.service');
const { createBody, updateBody } = require('./stations.schema');

const router = secureRouter();

router.get('/stations', { access: access('stations:read') }, async (req, res) => res.json(await service.list()));
router.post('/stations', { access: access('stations:write') }, async (req, res) => {
  res.status(201).json(await service.create(req.user, createBody.parse(req.body ?? {})));
});
router.get('/stations/:id', { access: access('stations:read') }, async (req, res) => {
  res.json(await service.get(idParam.parse(req.params).id));
});
router.patch('/stations/:id', { access: access('stations:write') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await service.update(req.user, id, updateBody.parse(req.body ?? {})));
});

module.exports = router;
