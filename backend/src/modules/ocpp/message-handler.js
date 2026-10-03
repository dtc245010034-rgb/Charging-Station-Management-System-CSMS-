const { randomUUID } = require('node:crypto');
const { safeLog, sanitizeErrorMessage } = require('../../lib/constants');
const { OcppFrameError, OcppCallError, parseFrame, encodeCall, encodeCallResult, encodeCallError } = require('./frames');
const { hashCall, MAX_MESSAGE_ID_LENGTH } = require('./messages.repository');

class OcppRemoteCallError extends Error {
	constructor(response) {
		super(response.errorDescription);
		this.name = 'OcppRemoteCallError';
		this.code = response.errorCode;
		this.details = response.errorDetails;
		this.messageId = response.messageId;
	}
}

function createOcppMessageHandler({
	handlers = {},
	requireBoot = Object.hasOwn(handlers, 'BootNotification'),
	logInfo = console.info,
	logWarning = console.warn,
	logError = console.error,
	callTimeoutMs = 30000,
	updateLastSeen = async () => {},
	messageStore = null,
	// BootNotification ghi ONLINE và đánh dấu kết nối; phát lại câu cũ trên kết nối mới sẽ bỏ qua hai việc đó, mà xử lý lại thì vô hại.
	// Heartbeat vốn idempotent; lưu mỗi nhịp sẽ thêm hàng triệu dòng ocpp_messages mỗi ngày khi có hàng nghìn trụ.
	dedupeSkipActions = ['BootNotification', 'Heartbeat'],
} = {}) {
	const pendingCalls = new Map();

	function sendFrame(connection, frame) {
		try {
			return new Promise((resolve, reject) => {
				connection.send(JSON.stringify(frame), (error) => error ? reject(error) : resolve(true));
			});
		} catch (error) {
			logError('[OCPP] Failed to send response:', sanitizeErrorMessage(error.message));
			return Promise.resolve(false);
		}
	}

	function sendCallError(connection, messageId, code, description, details = {}) {
		logInfo(`[OCPP] Created CALLERROR | messageId: ${safeLog(messageId)} | code: ${code}`);
		return sendFrame(connection, encodeCallError(messageId, code, description, details)).catch((error) => {
			logError('[OCPP] Failed to send CALLERROR:', sanitizeErrorMessage(error.message));
			return false;
		});
	}

	function takePendingCall(connection, messageId) {
		const calls = pendingCalls.get(connection);
		const pending = calls?.get(messageId);
		if (!pending) return undefined;
		calls.delete(messageId);
		if (calls.size === 0) pendingCalls.delete(connection);
		clearTimeout(pending.timeout);
		return pending;
	}

	function sendCall(connection, action, payload, { timeoutMs = callTimeoutMs } = {}) {
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive number');
		const messageId = randomUUID();
		const frame = encodeCall(messageId, action, payload);
		let calls = pendingCalls.get(connection);
		if (!calls) {
			calls = new Map();
			pendingCalls.set(connection, calls);
		}
		if (calls.has(messageId)) throw new Error('Generated duplicate OCPP messageId');

		return new Promise((resolve, reject) => {
			const pending = {
				resolve,
				reject,
				timeout: setTimeout(() => {
					takePendingCall(connection, messageId);
					reject(new Error(`OCPP call timed out: ${action}`));
				}, timeoutMs),
			};
			calls.set(messageId, pending);
			sendFrame(connection, frame).then((sent) => {
				if (sent) return;
				const failed = takePendingCall(connection, messageId);
				failed?.reject(new Error(`Failed to send OCPP call: ${action}`));
			}).catch((error) => {
				const failed = takePendingCall(connection, messageId);
				failed?.reject(error);
			});
		});
	}

	function closeConnection(connection, reason = new Error('OCPP connection closed')) {
		const calls = pendingCalls.get(connection);
		if (!calls) return;
		pendingCalls.delete(connection);
		for (const pending of calls.values()) {
			clearTimeout(pending.timeout);
			pending.reject(reason);
		}
	}

	// Tin trùng (cùng trụ, cùng messageId) nhận lại đúng câu trả lời đã lưu và không chạy handler lần hai (K-01).
	async function runOnce(connection, request, handler) {
		const invoke = () => handler(request.payload, { messageId: request.messageId, connection });
		const code = connection?.chargePointCode || connection?.chargePoint?.code;
		if (!messageStore || !code || dedupeSkipActions.includes(request.action)) return invoke();
		if (request.messageId.length > MAX_MESSAGE_ID_LENGTH) {
			logWarning(`[OCPP] messageId quá dài, bỏ qua chống trùng | action: ${safeLog(request.action)}`);
			return invoke();
		}

		const begun = await messageStore.begin(code, request.messageId, request.action, hashCall(request.action, request.payload));
		if (begun.state === 'replay') {
			logInfo(`[OCPP] Duplicate CALL, replaying stored response | messageId: ${safeLog(request.messageId)} | action: ${safeLog(request.action)}`);
			return begun.response;
		}

		let payload;
		try {
			payload = await invoke();
		} catch (error) {
			await messageStore.release(code, request.messageId).catch(() => {});
			throw error;
		}
		await messageStore.complete(code, request.messageId, payload).catch((error) => {
			logWarning(`[OCPP] Không lưu được câu trả lời để chống trùng | messageId: ${safeLog(request.messageId)}: ${sanitizeErrorMessage(error?.message || error)}`);
			return messageStore.release(code, request.messageId).catch(() => {});
		});
		return payload;
	}

	async function handleMessage(connection, rawMessage) {
		let request;
		try {
			request = parseFrame(rawMessage);
		} catch (error) {
			const frameError = error instanceof OcppFrameError
				? error
				: new OcppFrameError('FormationViolation', 'Invalid OCPP message');
			logWarning(`[OCPP] Invalid frame | messageId: ${safeLog(frameError.messageId ?? 'unknown')} | ${frameError.code}: ${frameError.message}`);
			if (frameError.messageType === 3 || frameError.messageType === 4) return;
			await sendCallError(connection, frameError.messageId ?? '', frameError.code, frameError.message);
			return;
		}

		if (request.type !== 'CALL') {
			const pending = takePendingCall(connection, request.messageId);
			if (!pending) {
				logWarning(`[OCPP] Unmatched ${safeLog(request.type)} from charge point | messageId: ${safeLog(request.messageId)}`);
				return;
			}
			if (request.type === 'CALLRESULT') pending.resolve(request.payload);
			else pending.reject(new OcppRemoteCallError(request));
			return;
		}

		logInfo(`[OCPP] Received CALL | messageId: ${safeLog(request.messageId)} | action: ${safeLog(request.action)}`);

		if (connection?.isStationLocked) {
			logWarning(`[OCPP] SecurityError: Station is locked | messageId: ${safeLog(request.messageId)} | action: ${safeLog(request.action)}`);
			await sendCallError(connection, request.messageId, 'SecurityError', 'Station is locked');
			return;
		}

		if (requireBoot && !connection?.isBootAccepted && request.action !== 'BootNotification') {
			logWarning(`[OCPP] SecurityError: Action before BootNotification | messageId: ${safeLog(request.messageId)} | action: ${safeLog(request.action)}`);
			await sendCallError(connection, request.messageId, 'SecurityError', 'Charge point is not accepted yet');
			return;
		}

		const handler = Object.hasOwn(handlers, request.action) ? handlers[request.action] : undefined;
		if (typeof handler !== 'function') {
			logWarning(`[OCPP] Unsupported action | messageId: ${safeLog(request.messageId)} | action: ${safeLog(request.action)}`);
			await sendCallError(connection, request.messageId, 'NotImplemented', 'Action is not supported');
			return;
		}

		try {
			await updateLastSeen(connection);
			logInfo(`[OCPP] Calling handler | messageId: ${safeLog(request.messageId)} | action: ${safeLog(request.action)}`);
			const payload = await runOnce(connection, request, handler);
			const response = encodeCallResult(request.messageId, payload);
			logInfo(`[OCPP] Created CALLRESULT | messageId: ${safeLog(request.messageId)} | action: ${safeLog(request.action)}`);
			await sendFrame(connection, response);
		} catch (error) {
			const isOcppCallError = error instanceof OcppCallError || error?.name === 'OcppCallError';
			const errorCode = isOcppCallError && typeof error.code === 'string' && error.code ? error.code : 'InternalError';
			const errorDescription = isOcppCallError && typeof error.message === 'string' && error.message ? error.message : 'Internal error';
			const errorDetails = isOcppCallError && error.details && typeof error.details === 'object' && !Array.isArray(error.details)
				? error.details
				: {};
			logError(`[OCPP] Handler failed | messageId: ${safeLog(request.messageId)} | action: ${safeLog(request.action)}: ${sanitizeErrorMessage(error?.message || error)}`);
			await sendCallError(connection, request.messageId, errorCode, errorDescription, errorDetails);
		}
	}

	return { handleMessage, sendCall, closeConnection };
}

module.exports = { OcppRemoteCallError, OcppCallError, createOcppMessageHandler };