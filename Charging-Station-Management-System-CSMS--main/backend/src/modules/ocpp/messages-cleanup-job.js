const { sanitizeErrorMessage } = require('../../lib/constants');

const MESSAGE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function createMessageCleanupJob({
	messageStore,
	retentionDays,
	intervalMs = MESSAGE_CLEANUP_INTERVAL_MS,
	logInfo = console.info,
	logError = console.error,
} = {}) {
	if (!messageStore || typeof messageStore.purgeOlderThan !== 'function') {
		throw new TypeError('messageStore.purgeOlderThan is required');
	}
	if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
		throw new TypeError('retentionDays must be a positive integer');
	}

	let running = false;
	let timer = null;

	async function run() {
		if (running) return 0;
		running = true;
		try {
			const removed = await messageStore.purgeOlderThan(retentionDays);
			if (removed > 0) logInfo(`[Job] Removed ${removed} OCPP message(s) older than ${retentionDays} day(s)`);
			return removed;
		} catch (error) {
			logError(`[Job] Failed to remove old OCPP messages: ${sanitizeErrorMessage(error?.message || error)}`);
			return 0;
		} finally {
			running = false;
		}
	}

	function start() {
		if (timer) return;
		timer = setInterval(() => { void run(); }, intervalMs);
		timer.unref?.();
	}

	function stop() {
		if (!timer) return;
		clearInterval(timer);
		timer = null;
	}

	return { run, start, stop };
}

module.exports = { MESSAGE_CLEANUP_INTERVAL_MS, createMessageCleanupJob };
