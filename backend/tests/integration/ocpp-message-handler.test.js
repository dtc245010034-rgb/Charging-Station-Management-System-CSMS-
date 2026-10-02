const http = require('node:http');
const { once } = require('node:events');
const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket, WebSocketServer } = require('ws');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');

const CHARGE_POINT_CODE = 'S07-INTEGRATION-CP';

describe('OCPP message handler', () => {
	let server;
	let wss;
	let client;
	let serverConnection;
	let url;
	let ocppMessages;
	const logs = [];

	function receiveFrame() {
		return new Promise((resolve) => client.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
	}

	before(async () => {
		server = http.createServer();
		wss = new WebSocketServer({
			noServer: true,
			handleProtocols: (protocols) => protocols.has('ocpp1.6') ? 'ocpp1.6' : false,
		});
		ocppMessages = createOcppMessageHandler({
			handlers: { Heartbeat: async () => ({ currentTime: '2026-10-01T00:00:00.000Z' }) },
			callTimeoutMs: 50,
			logInfo: (message) => logs.push(message),
			logWarning: (message) => logs.push(message),
			logError: (message) => logs.push(message),
		});
		wss.on('connection', (connection) => {
			serverConnection = connection;
			connection.on('message', (raw) => { void ocppMessages.handleMessage(connection, raw); });
		});
		server.on('upgrade', createOcppUpgradeHandler({
			wss,
			lookupChargePoint: async (code) => code === CHARGE_POINT_CODE
				? { id: 1, code, station_status: 'ACTIVE' }
				: null,
			logWarning: (message) => logs.push(message),
		}));
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		url = `ws://127.0.0.1:${server.address().port}`;
		client = new WebSocket(`${url}/ocpp/${CHARGE_POINT_CODE}`, ['ocpp1.6']);
		await once(client, 'open');
		assert.equal(client.protocol, 'ocpp1.6');
	});

	after(async () => {
		if (client?.readyState === WebSocket.OPEN) {
			client.close();
			await once(client, 'close');
		}
		if (wss) await new Promise((resolve) => wss.close(resolve));
		if (server?.listening) await new Promise((resolve) => server.close(resolve));
	});

	it('returns CALLERROR for an invalid CALL, then handles a valid CALL on the same connection', async () => {
		const invalidResponse = receiveFrame();
		client.send(JSON.stringify([2, 'invalid-1', 'Heartbeat', []]));
		assert.deepEqual(await invalidResponse, [4, 'invalid-1', 'FormationViolation', 'CALL payload must be an object', {}]);
		assert.equal(client.readyState, WebSocket.OPEN);

		const validResponse = receiveFrame();
		client.send(JSON.stringify([2, 'valid-2', 'Heartbeat', {}]));
		assert.deepEqual(await validResponse, [3, 'valid-2', { currentTime: '2026-10-01T00:00:00.000Z' }]);
		assert.equal(client.readyState, WebSocket.OPEN);
	});

	it('returns the correct error for each malformed CALL and keeps processing on the socket', async () => {
		const cases = [
			['{', '', 'FormationViolation', 'Message is not valid JSON'],
			['{}', '', 'FormationViolation', 'Message must be an array'],
			[[], '', 'FormationViolation', 'Message is empty'],
			[[9, 'unsupported'], 'unsupported', 'ProtocolError', 'Message type is not supported'],
			[[2], '', 'FormationViolation', 'messageId must be a string'],
			[[2, 'missing-action'], 'missing-action', 'FormationViolation', 'CALL must contain four elements'],
			[[2, 'missing-payload', 'Heartbeat'], 'missing-payload', 'FormationViolation', 'CALL must contain four elements'],
			[[2, 42, 'Heartbeat', {}], '', 'FormationViolation', 'messageId must be a string'],
			[[2, 'bad-payload', 'Heartbeat', []], 'bad-payload', 'FormationViolation', 'CALL payload must be an object'],
		];

		for (const [input, messageId, errorCode, description] of cases) {
			const response = receiveFrame();
			client.send(typeof input === 'string' ? input : JSON.stringify(input));
			assert.deepEqual(await response, [4, messageId, errorCode, description, {}]);
			assert.equal(client.readyState, WebSocket.OPEN);

			const heartbeat = receiveFrame();
			client.send(JSON.stringify([2, `after-${messageId || errorCode}`, 'Heartbeat', {}]));
			assert.deepEqual(await heartbeat, [3, `after-${messageId || errorCode}`, { currentTime: '2026-10-01T00:00:00.000Z' }]);
		}
	});

	it('returns ProtocolError for an unsupported frame type without closing the connection', async () => {
		const response = receiveFrame();
		client.send(JSON.stringify([9, 'protocol-2']));
		assert.deepEqual(await response, [4, 'protocol-2', 'ProtocolError', 'Message type is not supported', {}]);
		assert.equal(client.readyState, WebSocket.OPEN);
	});

	it('returns NotImplemented for an unknown action and logs it without losing messageId', async () => {
		const response = receiveFrame();
		client.send(JSON.stringify([2, 'unknown-3', 'UnknownAction', {}]));
		assert.deepEqual(await response, [4, 'unknown-3', 'NotImplemented', 'Action is not supported', {}]);
		assert.ok(logs.some((message) => message.includes('Unsupported action') && message.includes('unknown-3')));
		assert.ok(logs.some((message) => message.includes('Created CALLERROR') && message.includes('unknown-3')));
	});

	it('does not treat inherited object properties as registered handlers', async () => {
		const response = receiveFrame();
		client.send(JSON.stringify([2, 'prototype-4', 'constructor', {}]));
		assert.deepEqual(await response, [4, 'prototype-4', 'NotImplemented', 'Action is not supported', {}]);
	});

	it('does not answer a malformed CALLERROR with another CALLERROR', async () => {
		const response = receiveFrame();
		client.send(JSON.stringify([4, 'bad-error', 'ProtocolError']));
		client.send(JSON.stringify([2, 'after-error', 'Heartbeat', {}]));
		assert.deepEqual(await response, [3, 'after-error', { currentTime: '2026-10-01T00:00:00.000Z' }]);
		assert.equal(client.readyState, WebSocket.OPEN);
	});

	it('generates unique outgoing messageIds and matches concurrent responses by messageId', async () => {
		const firstPromise = ocppMessages.sendCall(serverConnection, 'Reset', { type: 'Soft' });
		const firstCall = await receiveFrame();
		const secondPromise = ocppMessages.sendCall(serverConnection, 'Reset', { type: 'Hard' });
		const secondCall = await receiveFrame();

		assert.equal(firstCall[0], 2);
		assert.equal(secondCall[0], 2);
		assert.match(firstCall[1], /^[0-9a-f-]{36}$/i);
		assert.match(secondCall[1], /^[0-9a-f-]{36}$/i);
		assert.notEqual(firstCall[1], secondCall[1]);

		client.send(JSON.stringify([3, secondCall[1], { status: 'Accepted' }]));
		client.send(JSON.stringify([3, firstCall[1], { status: 'Rejected' }]));
		assert.deepEqual(await secondPromise, { status: 'Accepted' });
		assert.deepEqual(await firstPromise, { status: 'Rejected' });
	});

	it('rejects an outgoing CALL with the matching remote CALLERROR', async () => {
		const callPromise = ocppMessages.sendCall(serverConnection, 'Reset', { type: 'Soft' });
		const call = await receiveFrame();
		client.send(JSON.stringify([4, call[1], 'InternalError', 'Reset failed', { reason: 'offline' }]));
		await assert.rejects(callPromise, (error) => {
			assert.equal(error.name, 'OcppRemoteCallError');
			assert.equal(error.code, 'InternalError');
			assert.equal(error.messageId, call[1]);
			assert.deepEqual(error.details, { reason: 'offline' });
			return true;
		});
	});

	it('times out an unanswered outgoing CALL and continues using the connection', async () => {
		const callPromise = ocppMessages.sendCall(serverConnection, 'Reset', { type: 'Soft' });
		const call = await receiveFrame();
		assert.equal(call[0], 2);
		await assert.rejects(callPromise, /OCPP call timed out: Reset/);

		const heartbeat = receiveFrame();
		client.send(JSON.stringify([2, 'after-timeout', 'Heartbeat', {}]));
		assert.deepEqual(await heartbeat, [3, 'after-timeout', { currentTime: '2026-10-01T00:00:00.000Z' }]);
	});

	it('B4: messageId chứa ký tự xuống dòng không tạo dòng log giả mạo riêng biệt', async () => {
		const injectedMessageId = 'msg-fake\n[OCPP] FAKE LINE CREATED BY ATTACKER\n';
		const logCountBefore = logs.length;

		const responsePromise = receiveFrame();
		client.send(JSON.stringify([2, injectedMessageId, 'Heartbeat', {}]));
		const response = await responsePromise;

		assert.equal(response[0], 3);
		assert.equal(response[1], injectedMessageId);

		const newLogs = logs.slice(logCountBefore);
		assert.ok(newLogs.length > 0, 'Phải có log được ghi nhận');

		for (const logLine of newLogs) {
			assert.doesNotMatch(logLine, /\r?\n/, 'Không được có ký tự xuống dòng trần trong bất kỳ dòng log nào');
			assert.notEqual(logLine, '[OCPP] FAKE LINE CREATED BY ATTACKER', 'Không được tạo ra dòng log giả mạo');
		}

		// Kiểm tra messageId được escape an toàn bằng JSON.stringify
		assert.ok(newLogs.some((l) => l.includes(JSON.stringify(injectedMessageId))));
	});
});