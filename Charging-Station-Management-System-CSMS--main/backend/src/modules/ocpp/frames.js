class OcppFrameError extends Error {
	constructor(code, message, { messageType, messageId } = {}) {
		super(message);
		this.name = 'OcppFrameError';
		this.code = code;
		this.messageType = messageType;
		this.messageId = messageId;
	}
}

class OcppCallError extends Error {
	constructor(code, message, details = {}) {
		super(message);
		this.name = 'OcppCallError';
		this.code = code;
		this.details = details;
	}
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireMessageId(messageId) {
	if (typeof messageId !== 'string') throw new TypeError('messageId must be a string');
}

function requirePayload(payload, name = 'payload') {
	if (!isRecord(payload)) throw new TypeError(`${name} must be an object`);
}

function parseFrame(message) {
	let frame;
	try {
		frame = Buffer.isBuffer(message) || typeof message === 'string' ? JSON.parse(message.toString()) : message;
	} catch {
		throw new OcppFrameError('FormationViolation', 'Message is not valid JSON');
	}

	if (!Array.isArray(frame)) throw new OcppFrameError('FormationViolation', 'Message must be an array');
	const messageType = frame[0];
	const candidateMessageId = typeof frame[1] === 'string' ? frame[1] : undefined;
	const context = { messageType, messageId: candidateMessageId };

	if (frame.length === 0) throw new OcppFrameError('FormationViolation', 'Message is empty', context);
	if (![2, 3, 4].includes(messageType)) throw new OcppFrameError('ProtocolError', 'Message type is not supported', context);
	if (typeof frame[1] !== 'string') throw new OcppFrameError('FormationViolation', 'messageId must be a string', context);

	if (messageType === 2) {
		if (frame.length !== 4) throw new OcppFrameError('FormationViolation', 'CALL must contain four elements', context);
		if (typeof frame[2] !== 'string' || !frame[2]) throw new OcppFrameError('FormationViolation', 'CALL action must be a non-empty string', context);
		if (!isRecord(frame[3])) throw new OcppFrameError('FormationViolation', 'CALL payload must be an object', context);
		return { type: 'CALL', messageId: frame[1], action: frame[2], payload: frame[3] };
	}

	if (messageType === 3) {
		if (frame.length !== 3) throw new OcppFrameError('FormationViolation', 'CALLRESULT must contain three elements', context);
		if (!isRecord(frame[2])) throw new OcppFrameError('FormationViolation', 'CALLRESULT payload must be an object', context);
		return { type: 'CALLRESULT', messageId: frame[1], payload: frame[2] };
	}

	if (frame.length !== 5) throw new OcppFrameError('FormationViolation', 'CALLERROR must contain five elements', context);
	if (typeof frame[2] !== 'string' || !frame[2]) throw new OcppFrameError('FormationViolation', 'CALLERROR errorCode must be a non-empty string', context);
	if (typeof frame[3] !== 'string') throw new OcppFrameError('FormationViolation', 'CALLERROR errorDescription must be a string', context);
	if (!isRecord(frame[4])) throw new OcppFrameError('FormationViolation', 'CALLERROR errorDetails must be an object', context);
	return {
		type: 'CALLERROR',
		messageId: frame[1],
		errorCode: frame[2],
		errorDescription: frame[3],
		errorDetails: frame[4],
	};
}

function encodeCall(messageId, action, payload) {
	requireMessageId(messageId);
	if (typeof action !== 'string' || !action) throw new TypeError('action must be a non-empty string');
	requirePayload(payload);
	return [2, messageId, action, payload];
}

function encodeCallResult(messageId, payload) {
	requireMessageId(messageId);
	requirePayload(payload);
	return [3, messageId, payload];
}

function encodeCallError(messageId, errorCode, errorDescription, errorDetails) {
	requireMessageId(messageId);
	if (typeof errorCode !== 'string' || !errorCode) throw new TypeError('errorCode must be a non-empty string');
	if (typeof errorDescription !== 'string') throw new TypeError('errorDescription must be a string');
	requirePayload(errorDetails, 'errorDetails');
	return [4, messageId, errorCode, errorDescription, errorDetails];
}

module.exports = { OcppFrameError, OcppCallError, parseFrame, encodeCall, encodeCallResult, encodeCallError };