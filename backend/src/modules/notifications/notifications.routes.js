const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { notificationsQuery, notificationIdParam } = require('../../lib/schemas');
const service = require('./notifications.service');

const router = secureRouter();
const driverAccess = access('notifications:read-own');

router.get('/me/notifications', { access: driverAccess }, async (req, res) => {
  const { unread } = notificationsQuery.parse(req.query);
  res.json(await service.listNotifications(req.user.id, unread === '1'));
});

router.post('/me/notifications/:id/read', { access: driverAccess }, async (req, res) => {
  const { id } = notificationIdParam.parse(req.params);
  res.json(await service.markNotificationRead(req.user.id, id));
});

module.exports = router;
