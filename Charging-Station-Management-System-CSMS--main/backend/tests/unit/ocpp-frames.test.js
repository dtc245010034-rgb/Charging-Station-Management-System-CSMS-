const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
	parseFrame,
	encodeCall,
	encodeCallResult,
	encodeCallError,
} = require('../../src/modules/ocpp/frames');

describe('OCPP frame codec', () => {
	const frames = [
		{
			name: 'CALL',
			frame: [2, 'call-123', 'BootNotification', { chargePointModel: 'ModelX' }],
			encode: (value) => encodeCall(value.messageId, value.action, value.payload),
		},
		{
			name: 'CALLRESULT',
			frame: [3, 'result-123', { status: 'Accepted' }],
			encode: (value) => encodeCallResult(value.messageId, value.payload),
		},
		{
			name: 'CALLERROR',
			frame: [4, 'error-123', 'NotImplemented', 'Action is not supported', {}],
			encode: (value) => encodeCallError(value.messageId, value.errorCode, value.errorDescription, value.errorDetails),
		},
	];

	for (const { name, frame, encode } of frames) {
		it(`parses and encodes ${name} with a stable round trip`, () => {
			const parsed = parseFrame(frame);
			assert.deepEqual(parseFrame(JSON.stringify(frame)), parsed);
			assert.deepEqual(encode(parsed), frame);
			assert.deepEqual(parseFrame(encode(parsed)), parsed);
		});
	}

	it('rejects malformed frames with the applicable OCPP error code', () => {
		const cases = [
			['invalid JSON syntax', '{', 'FormationViolation'],
			['not an array', '{}', 'FormationViolation'],
			['empty array', [], 'FormationViolation'],
			['missing frame type', ['message-id'], 'ProtocolError'],
			['unsupported frame type', [9, 'message-id'], 'ProtocolError'],
			['CALL missing messageId', [2], 'FormationViolation'],
			['CALL missing action', [2, 'message-id'], 'FormationViolation'],
			['CALL missing payload', [2, 'message-id', 'Heartbeat'], 'FormationViolation'],
			['messageId has the wrong type', [2, 123, 'Heartbeat', {}], 'FormationViolation'],
			['payload has the wrong type', [2, 'message-id', 'Heartbeat', []], 'FormationViolation'],
			['CALLERROR missing errorCode', [4, 'message-id'], 'FormationViolation'],
			['CALLERROR missing errorDescription', [4, 'message-id', 'ProtocolError'], 'FormationViolation'],
			['CALLERROR missing errorDetails', [4, 'message-id', 'ProtocolError', 'Invalid frame'], 'FormationViolation'],
		];

		for (const [name, frame, code] of cases) {
			assert.throws(() => parseFrame(frame), (error) => {
				assert.equal(error.code, code, name);
				return true;
			}, name);
		}
	});
});