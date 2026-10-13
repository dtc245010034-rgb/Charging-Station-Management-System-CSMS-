const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { AppError } = require('../../lib/errors');
const service = require('./sessions.service');
const { subscribe } = require('./sessions.events');
const { registerStream } = require('../../lib/sse-registry');
const { idParam } = require('../../lib/schemas');

const router = secureRouter();

router.get('/sessions', { access: access('sessions:read') }, async (req, res) => {
  res.json(await service.getActiveSessions(req.user));
});

router.get('/sessions/unexpected', { access: access('sessions:unexpected:read') }, async (req, res) => {
  res.json(await service.getUnexpectedSessions());
});

router.post('/sessions/:id/close', { access: access('sessions:unexpected:close') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 1000) {
    throw new AppError(400, 'INVALID_MANUAL_CLOSE_REASON', 'Lý do đóng phiên phải có từ 1 đến 1000 ký tự');
  }
  const allowZeroEnergy = Boolean(req.body?.allow_zero_energy || req.body?.allowZeroEnergy);
  const result = await service.closeUnexpectedSession(req.user, id, reason, { ip: req.ip, allowZeroEnergy });
  res.status(200).json(result);
});

// T-47: Lấy phiên đang sạc hiện tại của tài xế đăng nhập (204 nếu không có phiên)
router.get('/me/sessions/current', { access: access('sessions:read-own') }, async (req, res) => {
  const session = await service.getCurrentSessionForDriver(req.user);
  if (!session) {
    return res.status(204).end();
  }
  return res.status(200).json(session);
});

router.get('/me/sessions/history', { access: access('sessions:read-own') }, async (req, res) => {
  const month = typeof req.query.month === 'string' && req.query.month.trim() !== ''
    ? req.query.month.trim()
    : null;
  const page = req.query.page !== undefined ? Number(req.query.page) : null;
  const limit = req.query.limit !== undefined ? Number(req.query.limit) : null;
  res.json(await service.getDriverSessionHistory(req.user, {
    cursor: req.query.cursor,
    month,
    page,
    limit,
  }));
});

// T-48: Luồng SSE thời gian thực cho tài xế (lọc theo driver_id, heartbeat 20s, tự đóng khi JWT hết hạn)
function handleSessionEvents(req, res) {
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
    if (closed) return;
    const data = JSON.stringify({
      session_id: event.sessionId,
      status: event.status,
      current_kwh: event.currentKwh,
      latest_power_w: event.latestPowerW,
      latest_current_a: event.latestCurrentA,
      latest_soc: event.latestSoc,
      latest_sampled_at: event.sampledAt,
      type: event.type,
      session: event.session,
    });
    send(`data: ${data}\n\n`);
  }, { driverId: req.user.id });

  heartbeat = setInterval(() => send(': keep-alive\n\n'), 20000);

  // Đóng luồng khi JWT hết hạn theo mẫu fleet-status
  if (Number.isFinite(req.user.exp)) {
    expiry = setTimeout(() => {
      cleanup();
      res.end();
    }, Math.min(Math.max(req.user.exp * 1000 - Date.now(), 0), 2 ** 31 - 1));
  }

  res.on('close', cleanup);
  res.on('error', cleanup);
  res.flushHeaders();
  res.write('retry: 1000\n\n');
}

router.get('/me/sessions/events', { access: access('sessions:read-own') }, handleSessionEvents);
router.get('/sessions/events', { access: access('sessions:read-own') }, handleSessionEvents);

router.post('/sessions/:id/stop', { access: access('sessions:stop') }, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const result = await service.requestRemoteStop(req.user, id, { commandSender: req.app.locals.commandSender, ip: req.ip });
  res.status(202).json(result);
});

// T-47: Lấy chi tiết phiên theo id (bảo vệ IDOR, ghi audit_logs nếu trái quyền)
router.get('/sessions/:id', { access: [...access('sessions:read-own'), ...access('sessions:read')] }, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(400, 'BAD_REQUEST', 'Mã phiên sạc không hợp lệ');
  }
  const session = await service.getSessionById(req.user, id);
  return res.status(200).json(session);
});

module.exports = router;
