const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./fleet-status.service');
const { subscribe } = require('./fleet-status.events');

const router = secureRouter();

router.get('/fleet-status', { access: access('stations:read') }, async (req, res) => {
  res.json(await service.snapshot(req.user));
});

router.get('/fleet-status/events', { access: access('stations:read') }, (req, res) => {
  const roles = req.user.roles || [req.user.role];
  const seesAllStations = roles.includes('ADMIN') || roles.includes('OPERATOR');
  let closed = false;
  let heartbeat;
  let unsubscribe;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe?.();
  };

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  unsubscribe = subscribe((event) => {
    if (closed || (!seesAllStations && String(event.ownerId) !== String(req.user.id))) return;
    const data = JSON.stringify({
      station_id: event.stationId,
      charge_point_id: event.chargePointId,
      connector_id: event.connectorId,
    });
    if (!res.write(`data: ${data}\n\n`)) res.end();
  });
  heartbeat = setInterval(() => {
    if (!res.write(': keep-alive\n\n')) res.end();
  }, 20000);
  res.on('close', cleanup);
  res.flushHeaders();
  res.write('retry: 1000\n\n');
});

module.exports = router;
