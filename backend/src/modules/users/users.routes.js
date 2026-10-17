const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./users.service');
const { adminCreateUserBody } = require('./users.schema');
const { z } = require('zod');
const { BadRequestError } = require('../../lib/errors');

const router = secureRouter();
const userIdParam = z.object({ userId: z.string().regex(/^[1-9]\d*$/).transform(Number) });
const roleBody = z.object({ role: z.enum(['DRIVER', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT', 'ADMIN']) });

function parseUserId(params) {
  const parsed = userIdParam.safeParse(params);
  if (!parsed.success) throw new BadRequestError('userId không hợp lệ', parsed.error.issues);
  return parsed.data.userId;
}

router.get('/roles', { access: access('roles:read') }, async (req, res) => res.json(await service.listRoles()));
router.post('/admin/users', { access: access('users:create') }, async (req, res) => {
  res.status(201).json({ user: await service.createByAdmin(req.user, adminCreateUserBody.parse(req.body ?? {})) });
});
router.get('/admin/users', { access: access('users:manage') }, async (req, res) => {
  res.json({ users: await service.listAdminUsers() });
});
router.put('/admin/users/:userId/role', { access: access('users:manage') }, async (req, res) => {
  const body = roleBody.safeParse(req.body ?? {});
  if (!body.success) throw new BadRequestError('Dữ liệu không hợp lệ', body.error.issues);
  const user = await service.assignRole(req.user, parseUserId(req.params), body.data.role);
  res.json({ user });
});
router.post('/admin/users/:userId/disable', { access: access('users:manage') }, async (req, res) => {
  const user = await service.setDisabled(req.user, parseUserId(req.params), true);
  res.json({ user });
});
router.post('/admin/users/:userId/enable', { access: access('users:manage') }, async (req, res) => {
  const user = await service.setDisabled(req.user, parseUserId(req.params), false);
  res.json({ user });
});

module.exports = router;
