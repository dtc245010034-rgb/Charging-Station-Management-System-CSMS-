const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./sessions.service');
const { subscribe } = require('./sessions.events');

const router = secureRouter();

// T-47: GET /api/me/sessions/current (204 nếu không có phiên)
router.get('/me/sessions/current', { access: access('sessions:read-own') }, async (req, res, next) => {
  try {
    const session = await service.getCurrentDriverSession(req.user);
    if (!session) {
      return res.status(204).end();
    }
    return res.status(200).json(session);
  } catch (err) {
    next(err);
  }
});

// T-47: GET /api/sessions/:id (403 nếu không phải của mình)
router.get('/sessions/:id', { access: access('sessions:read-own') }, async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Mã phiên sạc không hợp lệ' },
      });
    }
    const session = await service.getSessionById(sessionId, req.user);
    return res.status(200).json(session);
  } catch (err) {
    next(err);
  }
});

// T-48: SSE stream cho tài xế xem phiên sạc thời gian thực
router.get('/me/sessions/events', { access: access('sessions:read-own') }, (req, res) => {
  let closed = false;
  let heartbeat;
  let expiry;
  let unsubscribe;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(expiry);
    unsubscribe?.();
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

  unsubscribe = subscribe((event) => {
    // Chỉ chuyển tiếp sự kiện thuộc về đúng tài xế đang kết nối
    if (closed || String(event.driverId) !== String(req.user.id)) return;
    const data = JSON.stringify(event);
    send(`data: ${data}\n\n`);
  });

  heartbeat = setInterval(() => send(': keep-alive\n\n'), 20000);

  // Đóng luồng khi JWT hết hạn (tuân thủ nguyên tắc bảo mật như fleet-status)
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
});

module.exports = router;
