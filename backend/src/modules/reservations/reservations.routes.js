const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { BadRequestError } = require('../../lib/errors');
const service = require('./reservations.service');
const { createReservationBody } = require('./reservations.schema');

const router = secureRouter();

router.post('/reservations', { access: access('reservations:create') }, async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!key) throw new BadRequestError('Thiếu header Idempotency-Key');
  const data = createReservationBody.parse(req.body ?? {});
  const reservation = await service.create(req.user, data, key, {
    commandSender: req.app.locals.commandSender,
    ip: req.ip,
  });
  res.status(reservation.status === 'PENDING' ? 202 : 201).json(reservation);
});

router.get('/me/reservations', { access: access('reservations:read-own') }, async (req, res) => {
  res.json(await service.listMine(req.user.id));
});

module.exports = router;