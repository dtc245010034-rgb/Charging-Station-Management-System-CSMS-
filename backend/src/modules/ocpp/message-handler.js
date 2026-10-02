const { randomUUID } = require('node:crypto');
const { OcppFrameError, parseFrame, encodeCall, encodeCallResult, encodeCallError } = require('./frames');

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
} = {}) {
	const pendingCalls = new Map();

	function sendFrame(connection, frame) {
		try {
			return new Promise((resolve, reject) => {
				connection.send(JSON.stringify(frame), (error) => error ? reject(error) : resolve(true));
			});
		} catch (error) {
			logError('[OCPP] Failed to send response:', error.message);
			return Promise.resolve(false);
		}
	}

	function sendCallError(connection, messageId, code, description, details = {}) {
		logInfo(`[OCPP] Created CALLERROR | messageId: ${messageId} | code: ${code}`);
		return sendFrame(connection, encodeCallError(messageId, code, description, details)).catch((error) => {
			logError('[OCPP] Failed to send CALLERROR:', error.message);
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

	async function handleMessage(connection, rawMessage) {
		let request;
		try {
			request = parseFrame(rawMessage);
		} catch (error) {
			const frameError = error instanceof OcppFrameError
				? error
				: new OcppFrameError('FormationViolation', 'Invalid OCPP message');
			logWarning(`[OCPP] Invalid frame | messageId: ${frameError.messageId ?? 'unknown'} | ${frameError.code}: ${frameError.message}`);
			if (frameError.messageType === 3 || frameError.messageType === 4) return;
			await sendCallError(connection, frameError.messageId ?? '', frameError.code, frameError.message);
			return;
		}

		if (request.type !== 'CALL') {
			const pending = takePendingCall(connection, request.messageId);
			if (!pending) {
				logWarning(`[OCPP] Unmatched ${request.type} from charge point | messageId: ${request.messageId}`);
				return;
			}
			if (request.type === 'CALLRESULT') pending.resolve(request.payload);
			else pending.reject(new OcppRemoteCallError(request));
			return;
		}

		logInfo(`[OCPP] Received CALL | messageId: ${request.messageId} | action: ${request.action}`);

		if (requireBoot && !connection?.isBootAccepted && request.action !== 'BootNotification') {
			logWarning(`[OCPP] SecurityError: Action before BootNotification | messageId: ${request.messageId} | action: ${request.action}`);
			await sendCallError(connection, request.messageId, 'SecurityError', 'Charge point is not accepted yet');
			return;
		}

		const handler = Object.hasOwn(handlers, request.action) ? handlers[request.action] : undefined;
		if (typeof handler !== 'function') {
			logWarning(`[OCPP] Unsupported action | messageId: ${request.messageId} | action: ${request.action}`);
			await sendCallError(connection, request.messageId, 'NotImplemented', 'Action is not supported');
			return;
		}

		try {
			logInfo(`[OCPP] Calling handler | messageId: ${request.messageId} | action: ${request.action}`);
			const payload = await handler(request.payload, { messageId: request.messageId, connection });
			const response = encodeCallResult(request.messageId, payload);
			logInfo(`[OCPP] Created CALLRESULT | messageId: ${request.messageId} | action: ${request.action}`);
			await sendFrame(connection, response);
		} catch (error) {
			logError(`[OCPP] Handler failed | messageId: ${request.messageId} | action: ${request.action}: ${error.message}`);
			await sendCallError(connection, request.messageId, 'InternalError', 'Request could not be processed');
		}
	}

	return { handleMessage, sendCall, closeConnection };
}

module.exports = { OcppRemoteCallError, createOcppMessageHandler };