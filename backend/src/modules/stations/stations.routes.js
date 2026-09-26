const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { idParam } = require('../../lib/schemas');
const { BadRequestError } = require('../../lib/errors');
const service = require('./stations.service');
const { createBody, updateBody } = require('./stations.schema');

const router = secureRouter();

router.get('/stations', { access: access('stations:read') }, async (req, res) => res.json(await service.list(req.user)));
router.post('/stations', { access: access('stations:write') }, async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new BadRequestError('Idempotency-Key bắt buộc và phải có từ 8 đến 128 ký tự');
  res.status(201).json(await service.create(req.user, createBody.parse(req.body ?? {}), key));
});
router.get('/stations/:id', { access: access('stations:read') }, async (req, res) => {
  res.json(await service.get(req.user, idParam.parse(req.params).id));
});
router.patch('/stations/:id', { access: access('stations:write') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await service.update(req.user, id, updateBody.parse(req.body ?? {})));
});

module.exports = router;
