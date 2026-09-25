const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./users.service');
const { adminCreateUserBody } = require('./users.schema');

const router = secureRouter();

router.get('/roles', { access: access('roles:read') }, async (req, res) => res.json(await service.listRoles()));
router.get('/admin/station-owners', { access: access('users:read') }, async (req, res) => res.json(await service.listStationOwners()));
router.post('/admin/users', { access: access('users:create') }, async (req, res) => {
  res.status(201).json({ user: await service.createByAdmin(req.user, adminCreateUserBody.parse(req.body ?? {})) });
});

module.exports = router;
