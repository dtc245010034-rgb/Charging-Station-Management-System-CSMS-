const http = require('node:http');
const { WebSocketServer } = require('ws');
const env = require('./config/env');
const { createApp } = require('./app');
const { migrate } = require('./db/migrate');
const { pool, ocppPool } = require('./db/pool');
const connections = require('./modules/charge-points/connection-registry');
const { createRateLimiter } = require('./lib/rate-limit');
const { clientIpOf } = require('./lib/client-ip');
const { createOcppUpgradeHandler } = require('./modules/ocpp/ocpp-upgrade');
const { createOcppMessageHandler } = require('./modules/ocpp/message-handler');
const { createOcppHandlers } = require('./modules/ocpp/handlers');
const { startKeepalive, registerOcppConnection } = require('./modules/ocpp/ws-connection');
const { markAllChargePointsOffline, markChargePointSeen } = require('./modules/charge-points/presence');
const { startChargePointOfflineJob } = require('./modules/charge-points/offline-job');
const { startChargePointHealthJob } = require('./modules/alerts/charge-point-health-job');
const { createHealthMetrics, startHealthMetricsJob } = require('./modules/health/health-metrics');
const { createShutdown } = require('./modules/ocpp/shutdown');
const { createMessageStore } = require('./modules/ocpp/messages.repository');
const { createCommandSender } = require('./modules/ocpp/commands');
const { startRemoteStopTimeoutJob } = require('./modules/sessions/remote-stop-job');
const { startAbnormalSessionJob } = require('./modules/sessions/abnormal-job');
const { startBillingFinalizationJob } = require('./modules/billing/finalization-job');
const { startWalletAuditJob } = require('./modules/wallet/wallet-audit-job');
const { startTopupExpiryJob } = require('./modules/payments/topup-expiry-job');
const { startReservationPendingCleanupJob } = require('./modules/reservations/pending-cleanup-job');
const { startEmailJob } = require('./modules/notifications/email-job');
const { startIdleFeeNotificationJob } = require('./modules/notifications/idle-fee-notification-job');
const { startPowerProfileRetryJob } = require('./modules/power/profile-retry-job');
const { startPowerScheduleJob } = require('./modules/power/schedule-job');
const { createPowerRebalancer } = require('./modules/power/rebalance');

const { MAX_WS_PAYLOAD, safeLog, sanitizeErrorMessage } = require('./lib/constants');

const healthMetrics = createHealthMetrics();
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
let powerRebalancer = null;
const ocppMessages = createOcppMessageHandler({
	handlers: createOcppHandlers({
		ocppPool,
		env,
		now,
		rebalanceStation: (...args) => powerRebalancer.rebalanceStation(...args),
	}),
	updateLastSeen: updateChargePointLastSeen,
	recordOcppCall: healthMetrics.recordOcppCall,
	messageStore,
	callTimeoutMs: env.OCPP_COMMAND_TIMEOUT_SECONDS * 1000,
});

const commandSender = createCommandSender({
	getConnection: connections.getConnection,
	sendCall: (...args) => ocppMessages.sendCall(...args),
	timeoutMs: env.OCPP_COMMAND_TIMEOUT_SECONDS * 1000,
});
powerRebalancer = createPowerRebalancer({
	pool,
	commandSender,
	minIntervalMs: env.POWER_REBALANCE_MIN_INTERVAL_MS,
});
const server = http.createServer(createApp({ commandSender, powerRebalancer }));

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
		const orphanPurged = await pool.query(
			"DELETE FROM orphan_messages WHERE received_at < CURRENT_TIMESTAMP - make_interval(days => $1::int)",
			[env.OCPP_MESSAGE_RETENTION_DAYS]
		);
		if (orphanPurged.rowCount > 0) console.log(`[CSMS] Đã dọn ${orphanPurged.rowCount} tin orphan_messages cũ hơn ${env.OCPP_MESSAGE_RETENTION_DAYS} ngày`);
	} catch (error) {
		console.error('[CSMS] Lỗi dọn bảng ocpp_messages / orphan_messages:', sanitizeErrorMessage(error?.message || error));
	}
}

const shutdown = createShutdown({ server, wss, pool: { query: (...args) => pool.query(...args), end: () => Promise.all([pool.end(), ocppPool.end()]) } });
let stopChargePointOfflineJob = () => {};
let stopChargePointHealthJob = () => {};
let stopHealthMetricsJob = () => {};
let stopRemoteStopJob = () => {};
let stopAbnormalSessionJob = () => {};
let stopBillingFinalizationJob = () => {};
let stopWalletAuditJob = () => {};
let stopTopupExpiryJob = () => {};
let stopReservationPendingCleanupJob = () => {};
let stopEmailJob = () => {};
let stopIdleFeeNotificationJob = () => {};
let stopPowerProfileRetryJob = () => {};
let stopPowerScheduleJob = () => {};
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
	stopChargePointOfflineJob();
	stopChargePointHealthJob();
	stopHealthMetricsJob();
	stopRemoteStopJob();
	stopAbnormalSessionJob();
	stopBillingFinalizationJob();
	stopWalletAuditJob();
	stopTopupExpiryJob();
	stopReservationPendingCleanupJob();
	stopEmailJob();
	stopIdleFeeNotificationJob();
	stopPowerProfileRetryJob();
	stopPowerScheduleJob();
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
	stopChargePointHealthJob = startChargePointHealthJob({ db: pool }).stop;
	stopHealthMetricsJob = startHealthMetricsJob({ db: pool, metrics: healthMetrics }).stop;
	stopRemoteStopJob = startRemoteStopTimeoutJob().stop;
	stopAbnormalSessionJob = startAbnormalSessionJob({
	  abnormalAfterSeconds: env.SESSION_ABNORMAL_AFTER_SECONDS,
	}).stop;
	stopBillingFinalizationJob = startBillingFinalizationJob({
		db: pool,
		intervalMs: env.BILLING_JOB_INTERVAL_MS,
		idleMaxWaitMinutes: env.IDLE_MAX_WAIT_MIN,
	}).stop;
	stopWalletAuditJob = startWalletAuditJob({
		db: pool,
		intervalMs: env.WALLET_AUDIT_INTERVAL_MS,
	}).stop;
	stopTopupExpiryJob = startTopupExpiryJob({
		db: pool,
	}).stop;
	stopReservationPendingCleanupJob = startReservationPendingCleanupJob({ db: pool }).stop;
	stopEmailJob = startEmailJob({
		db: pool,
		transport: env.EMAIL_TRANSPORT,
	}).stop;
	stopIdleFeeNotificationJob = startIdleFeeNotificationJob({ db: pool }).stop;
	stopPowerProfileRetryJob = startPowerProfileRetryJob({
		db: pool,
		commandSender,
		commandTimeoutSeconds: env.OCPP_COMMAND_TIMEOUT_SECONDS + 5,
	}).stop;
	stopPowerScheduleJob = startPowerScheduleJob({
		rebalanceStation: (...args) => powerRebalancer.rebalanceStation(...args),
		db: pool,
		intervalMs: env.POWER_SCHEDULE_TICK_MS,
	}).stop;
	server.listen(env.PORT, () => console.log(`CSMS backend listening on http://localhost:${env.PORT}`));
}
start().catch((error) => { console.error('Database startup failed:', error); process.exitCode = 1; });
