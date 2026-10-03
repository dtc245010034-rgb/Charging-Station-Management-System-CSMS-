const { CHARGE_POINT_OFFLINE_STATUS, safeLog, sanitizeErrorMessage } = require('../../lib/constants');

function createConnectionRateLimiter({ maxMessagesPerSecond = 50, now = Date.now } = {}) {
	let windowStart = now();
	let count = 0;
	let exceeded = false;

	return {
		checkLimit() {
			if (exceeded) return false;
			const currentTime = now();
			if (currentTime - windowStart >= 1000) {
				windowStart = currentTime;
				count = 0;
			}
			count += 1;
			if (count > maxMessagesPerSecond) {
				exceeded = true;
				return false;
			}
			return true;
		},
		isExceeded() {
			return exceeded;
		},
	};
}

function startKeepalive(wss, { pingIntervalMs = 30000, logWarning = console.warn } = {}) {
	const timer = setInterval(() => {
		wss.clients.forEach((ws) => {
			if (ws.isAlive === false) {
				const code = ws.chargePointCode || 'UNKNOWN';
				logWarning(`[OCPP] Keepalive timeout (no pong received) | chargePoint: ${safeLog(code)}. Terminating socket.`);
				try {
					ws.terminate();
				} catch {
					/* ignore */
				}
				return;
			}
			ws.isAlive = false;
			try {
				ws.ping();
			} catch {
				try {
					ws.terminate();
				} catch {
					/* ignore */
				}
			}
		});
	}, pingIntervalMs);

	if (typeof timer.unref === 'function') {
		timer.unref();
	}

	const stop = () => {
		clearInterval(timer);
	};

	wss.on('close', stop);

	return { timer, stop };
}

function registerOcppConnection(ws, code, {
	connections,
	ocppMessages,
	pool,
	rateLimitMax = 50,
	now = Date.now,
	logWarning = console.warn,
	logError = console.error,
}) {
	ws.chargePointCode = code;
	ws.stationId = ws.stationId ?? ws.chargePoint?.station_id;
	ws.isAlive = true;

	ws.on('pong', () => {
		ws.isAlive = true;
	});

	const rateLimiter = createConnectionRateLimiter({ maxMessagesPerSecond: rateLimitMax, now });

	connections.connect(code, ws, { stationId: ws.stationId });

	ws.on('error', (err) => {
		logError(`[OCPP] WebSocket error | chargePoint: ${safeLog(code)}:`, sanitizeErrorMessage(err?.message || ''));
	});

	ws.on('close', async () => {
		const isCurrent = connections.disconnect(code, ws);
		ocppMessages.closeConnection(ws);

		// B8: Chỉ cập nhật DB sang offline nếu socket vừa đóng là kết nối hiện hành và không bị thay thế bởi kết nối đôi S-13
		if (isCurrent && !ws.isReplacedByNewConnection && pool) {
			try {
				await pool.query(
					'UPDATE charge_points SET status = $1 WHERE code = $2',
					[CHARGE_POINT_OFFLINE_STATUS, code]
				);
			} catch (err) {
				logError(
					`[OCPP] Failed to update offline status on disconnect | chargePoint: ${safeLog(code)}:`,
					sanitizeErrorMessage(err?.message || '')
				);
			}
		}
	});

	ws.on('message', (raw) => {
		if (ws.readyState !== 1) return;

		if (!rateLimiter.checkLimit()) {
			if (!ws.rateLimitLogged) {
				ws.rateLimitLogged = true;
				logWarning(`[OCPP] Rate limit exceeded | chargePoint: ${safeLog(code)} | limit: ${rateLimitMax}/s. Closing connection.`);
				try {
					ws.close(1008, 'Policy Violation: Rate limit exceeded');
				} catch {
					try {
						ws.terminate();
					} catch {
						/* ignore */
					}
				}
			}
			return;
		}

		void ocppMessages.handleMessage(ws, raw);
	});
}

module.exports = {
	createConnectionRateLimiter,
	startKeepalive,
	registerOcppConnection,
};
