const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./fleet-status.service');
const { subscribe } = require('./fleet-status.events');
const { registerStream } = require('../../lib/sse-registry');

const router = secureRouter();

router.get('/fleet-status', { access: access('stations:read') }, async (req, res) => {
  res.json(await service.snapshot(req.user));
});

router.get('/fleet-status/events', { access: access('stations:read') }, (req, res) => {
  const roles = req.user.roles || [req.user.role];
  const seesAllStations = roles.includes('ADMIN') || roles.includes('OPERATOR');
  let closed = false;
  let heartbeat;
  let expiry;
  let unsubscribe;
  let releaseStream;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(expiry);
    unsubscribe?.();
    releaseStream?.();
  };

  // Client đọc chậm (write trả false): huỷ luôn kết nối để không ghi tiếp vào luồng đã đóng; EventSource tự nối lại.
  const send = (chunk) => {
    if (closed || res.destroyed || res.writableEnded) return;
    if (!res.write(chunk)) {
      cleanup();
      res.destroy();
    }
  };

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  releaseStream = registerStream(req.user.id, () => {
    cleanup();
    res.end();
  });
  unsubscribe = subscribe((event) => {
    if (closed || (!seesAllStations && String(event.ownerId) !== String(req.user.id))) return;
    const data = JSON.stringify({
      station_id: event.stationId,
      charge_point_id: event.chargePointId,
      connector_id: event.connectorId,
    });
    send(`data: ${data}\n\n`);
  });
  heartbeat = setInterval(() => send(': keep-alive\n\n'), 20000);
  // Luồng đã mở không được sống lâu hơn phiên đăng nhập: JWT hết hạn thì đóng, EventSource nối lại sẽ bị từ chối 401.
  if (Number.isFinite(req.user.exp)) {
    expiry = setTimeout(() => { cleanup(); res.end(); }, Math.min(Math.max(req.user.exp * 1000 - Date.now(), 0), 2 ** 31 - 1));
  }
  res.on('close', cleanup);
  res.on('error', cleanup);
  res.flushHeaders();
  res.write('retry: 1000\n\n');
});

module.exports = router;
