const http = require('node:http');
const { WebSocketServer } = require('ws');
const env = require('./config/env');
const app = require('./app');
const { migrate } = require('./db/migrate');
const { pool } = require('./db/pool');
const connections = require('./modules/charge-points/connection-registry');
const { createOcppUpgradeHandler } = require('./modules/ocpp/ocpp-upgrade');
const { createOcppMessageHandler } = require('./modules/ocpp/message-handler');
const { bootNotificationHandler } = require('./modules/ocpp/handlers/boot-notification');
const { createStatusNotificationHandler } = require('./modules/ocpp/handlers/status-notification');
const { startKeepalive, registerOcppConnection } = require('./modules/ocpp/ws-connection');
const { markAllChargePointsOffline } = require('./modules/charge-points/presence');
const { startChargePointOfflineJob } = require('./modules/charge-points/offline-job');
const { createShutdown } = require('./modules/ocpp/shutdown');

const { MAX_WS_PAYLOAD, safeLog, sanitizeErrorMessage } = require('./lib/constants');

const { publish } = require('./modules/fleet-status/fleet-status.events');

const server = http.createServer(app);
const now = () => new Date().toISOString();
async function updateChargePointLastSeen(connection) {
	const code = connection?.chargePointCode || connection?.chargePoint?.code;
	if (!code || connection?.isStationLocked) return;
	try {
		// SKIP LOCKED: hàng đang bị giao dịch khác giữ thì bỏ qua lần này, không để Heartbeat chờ khoá và giữ kết nối pool.
		const result = await pool.query(
			`WITH target AS (
			   SELECT cp.id, cp.status AS prev_status, cp.station_id, s.owner_id
			   FROM charge_points cp JOIN stations s ON s.id = cp.station_id
			   WHERE cp.code = $1 AND s.locked_at IS NULL
			   FOR UPDATE OF cp SKIP LOCKED
			 )
			 UPDATE charge_points
			 SET last_seen_at = CURRENT_TIMESTAMP,
			     status = CASE WHEN charge_points.status IN ('OFFLINE', 'UNKNOWN') THEN 'ONLINE' ELSE charge_points.status END
			 FROM target
			 WHERE charge_points.id = target.id
			 RETURNING charge_points.id, target.prev_status, charge_points.status AS current_status, target.station_id, target.owner_id`,
			[code]
		);
		const updated = result.rows?.[0];
		if (updated && updated.prev_status !== 'ONLINE' && updated.current_status === 'ONLINE') {
			publish({
				ownerId: updated.owner_id,
				stationId: updated.station_id,
				chargePointId: updated.id,
			});
		}
	} catch (error) {
		console.warn(`[OCPP] Failed to update last_seen_at for ${safeLog(code)}: ${sanitizeErrorMessage(error?.message || error)}`);
	}
}

const ocppMessages = createOcppMessageHandler({
	handlers: {
		BootNotification: bootNotificationHandler,
		Heartbeat: async () => ({ currentTime: now() }),
		StatusNotification: createStatusNotificationHandler({ pool, errorDedupSeconds: env.OCPP_ERROR_DEDUP_SECONDS }),
		Authorize: async (payload) => ({ idTagInfo: { status: payload.idTag ? 'Accepted' : 'Invalid' } }),
	},
	updateLastSeen: updateChargePointLastSeen,
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

const shutdown = createShutdown({ server, wss, pool });
let stopChargePointOfflineJob = () => {};
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
	stopChargePointOfflineJob();
	shutdown(signal);
});

async function start() {
	await migrate();
	// Chưa có kết nối OCPP nào trước khi mở cổng, nên trụ còn ONLINE là do lần chạy trước tắt đột ngột.
	const swept = await markAllChargePointsOffline(pool);
	if (swept.chargePoints > 0 || swept.connectors > 0) {
		console.log(`[CSMS] Dọn khi khởi động: ${swept.chargePoints} trụ ONLINE mồ côi, ${swept.connectors} đầu nối về UNKNOWN`);
	}
	stopChargePointOfflineJob = startChargePointOfflineJob().stop;
	server.listen(env.PORT, () => console.log(`CSMS backend listening on http://localhost:${env.PORT}`));
}
start().catch((error) => { console.error('Database startup failed:', error); process.exitCode = 1; });
