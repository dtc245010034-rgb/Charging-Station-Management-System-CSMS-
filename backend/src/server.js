const http = require('node:http');
const { WebSocketServer } = require('ws');
const env = require('./config/env');
const app = require('./app');
const { migrate } = require('./db/migrate');
const { pool, ocppPool } = require('./db/pool');
const connections = require('./modules/charge-points/connection-registry');
const { createRateLimiter } = require('./lib/rate-limit');
const { clientIpOf } = require('./lib/client-ip');
const { createOcppUpgradeHandler } = require('./modules/ocpp/ocpp-upgrade');
const { createOcppMessageHandler } = require('./modules/ocpp/message-handler');
const { bootNotificationHandler } = require('./modules/ocpp/handlers/boot-notification');
const { createHeartbeatHandler } = require('./modules/ocpp/handlers/heartbeat');
const { createAuthorizeHandler } = require('./modules/ocpp/handlers/authorize');
const { createStatusNotificationHandler } = require('./modules/ocpp/handlers/status-notification');
const { startKeepalive, registerOcppConnection } = require('./modules/ocpp/ws-connection');
const { markAllChargePointsOffline, markChargePointSeen } = require('./modules/charge-points/presence');
const { startChargePointOfflineJob } = require('./modules/charge-points/offline-job');
const { createShutdown } = require('./modules/ocpp/shutdown');
const { createMessageStore } = require('./modules/ocpp/messages.repository');

const { MAX_WS_PAYLOAD, safeLog, sanitizeErrorMessage } = require('./lib/constants');

const server = http.createServer(app);
const now = () => new Date().toISOString();
async function updateChargePointLastSeen(connection) {
	const code = connection?.chargePointCode || connection?.chargePoint?.code;
	if (!code || connection?.isStationLocked) return;
	try {
		await markChargePointSeen(pool, code, { notify: Boolean(connection.isBootAccepted) });
	} catch (error) {
		console.warn(`[OCPP] Failed to update last_seen_at for ${safeLog(code)}: ${sanitizeErrorMessage(error?.message || error)}`);
	}
}

const messageStore = createMessageStore(pool, { replayWindowSeconds: env.OCPP_DUPLICATE_REPLAY_WINDOW_SECONDS });
const ocppMessages = createOcppMessageHandler({
	handlers: {
		BootNotification: bootNotificationHandler,
		Heartbeat: createHeartbeatHandler({ now }),
		StatusNotification: createStatusNotificationHandler({ pool: ocppPool, errorDedupSeconds: env.OCPP_ERROR_DEDUP_SECONDS }),
		Authorize: createAuthorizeHandler({ pool: ocppPool }),
	},
	updateLastSeen: updateChargePointLastSeen,
	messageStore,
});

const wss = new WebSocketServer({
	noServer: true,
	maxPayload: MAX_WS_PAYLOAD,
	handleProtocols: (protocols) => protocols.has('ocpp1.6') ? 'ocpp1.6' : false,
});

startKeepalive(wss, {
	pingIntervalMs: env.OCPP_PING_INTERVAL * 1000,
});

server.on('upgrade', createOcppUpgradeHandler({
	wss,
	handshakeLimiter: createRateLimiter({ limit: env.OCPP_HANDSHAKE_LIMIT_PER_10S, windowMs: 10000 }),
	clientIpOf: (request) => clientIpOf(request, env.TRUST_PROXY),
	lookupChargePoint: async (code) => {
		const result = await pool.query(
			'SELECT cp.id, cp.code, cp.station_id, s.status AS station_status FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.code = $1 LIMIT 1',
			[code]
		);
		return result.rows[0] || null;
	},
}));

wss.on('connection', (ws, code) => {
	registerOcppConnection(ws, code, {
		connections,
		ocppMessages,
		pool,
		rateLimitMax: env.OCPP_RATE_LIMIT_MAX,
	});
});

const PURGE_INTERVAL_MS = 60 * 60 * 1000;
let purgeTimer = null;
async function purgeOldMessages() {
	try {
		const removed = await messageStore.purgeOlderThan(env.OCPP_MESSAGE_RETENTION_DAYS);
		if (removed > 0) console.log(`[CSMS] Đã dọn ${removed} tin OCPP cũ hơn ${env.OCPP_MESSAGE_RETENTION_DAYS} ngày`);
	} catch (error) {
		console.error('[CSMS] Lỗi dọn bảng ocpp_messages:', sanitizeErrorMessage(error?.message || error));
	}
}

const shutdown = createShutdown({ server, wss, pool: { query: (...args) => pool.query(...args), end: () => Promise.all([pool.end(), ocppPool.end()]) } });
let stopChargePointOfflineJob = () => {};
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
	stopChargePointOfflineJob();
	if (purgeTimer) clearInterval(purgeTimer);
	shutdown(signal);
});

async function start() {
	await migrate();
	// Chưa có kết nối OCPP nào trước khi mở cổng, nên trụ còn ONLINE là do lần chạy trước tắt đột ngột.
	const swept = await markAllChargePointsOffline(pool);
	if (swept.chargePoints > 0 || swept.connectors > 0) {
		console.log(`[CSMS] Dọn khi khởi động: ${swept.chargePoints} trụ ONLINE mồ côi, ${swept.connectors} đầu nối về UNKNOWN`);
	}
	await purgeOldMessages();
	purgeTimer = setInterval(purgeOldMessages, PURGE_INTERVAL_MS);
	purgeTimer.unref();
	stopChargePointOfflineJob = startChargePointOfflineJob().stop;
	server.listen(env.PORT, () => console.log(`CSMS backend listening on http://localhost:${env.PORT}`));
}
start().catch((error) => { console.error('Database startup failed:', error); process.exitCode = 1; });
