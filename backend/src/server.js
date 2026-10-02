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
const { startKeepalive, registerOcppConnection } = require('./modules/ocpp/ws-connection');

const { MAX_WS_PAYLOAD, safeLog, sanitizeErrorMessage } = require('./lib/constants');

const server = http.createServer(app);
const now = () => new Date().toISOString();
async function updateChargePointLastSeen(connection) {
	const code = connection?.chargePointCode || connection?.chargePoint?.code;
	if (!code) return;
	try {
		await pool.query('UPDATE charge_points SET last_seen_at = CURRENT_TIMESTAMP WHERE code = $1', [code]);
	} catch (error) {
		console.warn(`[OCPP] Failed to update last_seen_at for ${safeLog(code)}: ${sanitizeErrorMessage(error?.message || error)}`);
	}
}

const ocppMessages = createOcppMessageHandler({
	handlers: {
		BootNotification: bootNotificationHandler,
		Heartbeat: async () => ({ currentTime: now() }),
		StatusNotification: async () => ({}),
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
			'SELECT cp.id, cp.code, s.status AS station_status FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.code = $1 LIMIT 1',
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

async function start() { await migrate(); server.listen(env.PORT, () => console.log(`CSMS backend listening on http://localhost:${env.PORT}`)); }
start().catch((error) => { console.error('Database startup failed:', error); process.exitCode = 1; });
