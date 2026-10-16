const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { idParam, erasureRejectBody } = require('../../lib/schemas');
const service = require('./erasure.service');

const router = secureRouter();

router.post('/me/erasure-requests', { access: access('erasure:request') }, async (req, res) => {
  res.status(201).json(await service.requestErasure(req.user));
});

router.get('/me/erasure-requests', { access: access('erasure:request') }, async (req, res) => {
  res.json({ requests: await service.listOwnRequests(req.user.id) });
});

router.get('/admin/erasure-requests', { access: access('erasure:manage') }, async (req, res) => {
  res.json({ requests: await service.listRequests() });
});

router.post('/admin/erasure-requests/:id/approve', { access: access('erasure:manage') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await service.approve(req.user, id));
});

router.post('/admin/erasure-requests/:id/reject', { access: access('erasure:manage') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = erasureRejectBody.parse(req.body ?? {});
  res.json(await service.reject(req.user, id, body.reason));
});

module.exports = router;
