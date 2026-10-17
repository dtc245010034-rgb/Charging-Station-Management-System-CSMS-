const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./users.service');
const {
  adminCreateUserBody,
  adminUsersQuery,
  adminUserIdParam,
  adminUserRoleBody,
  adminUserStatusBody,
} = require('./users.schema');

const router = secureRouter();

router.get('/roles', { access: access('roles:read') }, async (req, res) => res.json(await service.listRoles()));
router.get('/admin/users', { access: access('users:manage') }, async (req, res) => (
  res.json(await service.listForAdmin(adminUsersQuery.parse(req.query)))
));
router.post('/admin/users', { access: access('users:create') }, async (req, res) => {
  res.status(201).json({ user: await service.createByAdmin(req.user, adminCreateUserBody.parse(req.body ?? {})) });
});
router.patch('/admin/users/:id/role', { access: access('users:manage') }, async (req, res) => {
  const { id } = adminUserIdParam.parse(req.params);
  const { role } = adminUserRoleBody.parse(req.body ?? {});
  res.json({ user: await service.changeRole(req.user, id, role) });
});
router.patch('/admin/users/:id/status', { access: access('users:manage') }, async (req, res) => {
  const { id } = adminUserIdParam.parse(req.params);
  const { isActive } = adminUserStatusBody.parse(req.body ?? {});
  res.json({ user: await service.setActive(req.user, id, isActive) });
});

module.exports = router;
