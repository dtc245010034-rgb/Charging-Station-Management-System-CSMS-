const http = require('node:http');
const { once } = require('node:events');
const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket, WebSocketServer } = require('ws');
const { createOcppMessageHandler, OcppCallError } = require('../../src/modules/ocpp/message-handler');
const { createCommandSender } = require('../../src/modules/ocpp/commands');
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');
const { createStatusNotificationHandler } = require('../../src/modules/ocpp/handlers/status-notification');

const CHARGE_POINT_CODE = 'S07-INTEGRATION-CP';
const connector = { status: 'UNKNOWN', ocpp_status: null };
const declaredConnectors = [{ connector_no: 1 }, { connector_no: 2 }];
const connectorErrors = [];

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

	function createTestCommandSender(timeoutMs = 1000) {
		return createCommandSender({
			getConnection: (code) => code === CHARGE_POINT_CODE ? serverConnection : undefined,
			sendCall: (...args) => ocppMessages.sendCall(...args),
			timeoutMs,
		});
	}

	before(async () => {
		server = http.createServer();
		wss = new WebSocketServer({
			noServer: true,
			handleProtocols: (protocols) => protocols.has('ocpp1.6') ? 'ocpp1.6' : false,
		});
		ocppMessages = createOcppMessageHandler({
			handlers: {
				Heartbeat: async () => ({ currentTime: '2026-10-01T00:00:00.000Z' }),
				StatusNotification: createStatusNotificationHandler({
					pool: {
						query: async (sql, params) => {
							if (sql.includes('UPDATE connectors')) {
								if (!declaredConnectors.some(({ connector_no }) => connector_no === params[3])) {
									return { rowCount: 0 };
								}
								connector.status = params[0];
								connector.ocpp_status = params[1];
							} else if (sql.includes('INSERT INTO connector_errors')) {
								connectorErrors.push({
									error_code: params[0],
									vendor_error_code: params[1],
									occurred_at: params[2],
									connector_id: 1,
								});
							}
							return { rowCount: 1 };
						},
					},
					logWarning: (message) => logs.push(message),
				}),
				FailWithPostgres: async () => {
					const error = new Error('relation "users" does not exist; password=secret123 host=db.internal:5432');
					error.code = '42P01';
					throw error;
				},
				FailWithOcppCallError: async () => {
					throw new OcppCallError('PropertyConstraintViolation', 'Field vendor exceeds maximum length of 20 characters', { field: 'vendor' });
				},
				FailWithGenericError: async () => {
					throw new Error('Something internal went wrong');
				},
				FailWithTypeError: async () => {
					throw new TypeError('Cannot read properties of null (reading "foo")');
				},
			},
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

	it('persists a virtual connector status within one second', async () => {
		connector.status = 'UNKNOWN';
		connector.ocpp_status = null;
		const startedAt = Date.now();
		const response = receiveFrame();
		client.send(JSON.stringify([2, 'status-1', 'StatusNotification', {
			connectorId: 1,
			errorCode: 'NoError',
			status: 'Charging',
		}]));

		assert.deepEqual(await response, [3, 'status-1', {}]);
		assert.deepEqual(connector, { status: 'OCCUPIED', ocpp_status: 'Charging' });
		assert.ok(Date.now() - startedAt < 1000);
	});

	it('appends a Faulted connector error and retains it after a later Available notification', async () => {
		connectorErrors.length = 0;
		const testTimestamp = new Date(Date.now() - 60000).toISOString();
		const faulted = receiveFrame();
		client.send(JSON.stringify([2, 'status-faulted', 'StatusNotification', {
			connectorId: 1,
			errorCode: 'GroundFailure',
			vendorErrorCode: 'VENDOR-42',
			status: 'Faulted',
			timestamp: testTimestamp,
		}]));
		assert.deepEqual(await faulted, [3, 'status-faulted', {}]);
		assert.deepEqual(connectorErrors, [{
			error_code: 'GroundFailure',
			vendor_error_code: 'VENDOR-42',
			occurred_at: testTimestamp,
			connector_id: 1,
		}]);

		const available = receiveFrame();
		client.send(JSON.stringify([2, 'status-available', 'StatusNotification', {
			connectorId: 1,
			errorCode: 'NoError',
			status: 'Available',
		}]));
		assert.deepEqual(await available, [3, 'status-available', {}]);
		assert.equal(connector.status, 'AVAILABLE');
		assert.equal(connectorErrors.length, 1);
	});

	it('ignores undeclared connectors, warns once per charge point, and returns an empty CALLRESULT', async () => {
		const warningPrefix = 'StatusNotification: Không tìm thấy đầu nối của trụ';
		const warningCountBefore = logs.filter((message) => message.includes(warningPrefix)).length;
		connectorErrors.length = 0;

		for (let index = 0; index < 5; index += 1) {
			const messageId = `undeclared-${index}`;
			const response = receiveFrame();
			client.send(JSON.stringify([2, messageId, 'StatusNotification', {
				connectorId: 3,
				errorCode: 'GroundFailure',
				status: 'Faulted',
			}]));
			assert.deepEqual(await response, [3, messageId, {}]);
		}

		const warnings = logs.filter((message) => message.includes(warningPrefix));
		assert.equal(warnings.length - warningCountBefore, 1);
		assert.ok(warnings.at(-1).includes(CHARGE_POINT_CODE));
		assert.ok(warnings.at(-1).includes('connectorId: 3'));
		assert.equal(declaredConnectors.length, 2);
		assert.equal(connectorErrors.length, 0);
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

	it('sends Reset through the shared command sender and matches the virtual charge point CALLRESULT', async () => {
		let resetCount = 0;
		const resetPromise = createTestCommandSender().send(CHARGE_POINT_CODE, 'Reset', { type: 'Soft' });
		const call = await receiveFrame();

		assert.equal(call[0], 2);
		assert.match(call[1], /^[0-9a-f-]{36}$/i);
		assert.deepEqual(call.slice(2), ['Reset', { type: 'Soft' }]);

		// The WebSocket client acts as the virtual charge point and replies to the received CALL.
		resetCount += 1;
		client.send(JSON.stringify([3, call[1], { status: 'Accepted' }]));

		assert.deepEqual(await resetPromise, { status: 'Accepted' });
		assert.equal(resetCount, 1);
	});

	it('processes another charge point CALL while an unanswered Reset is pending', async () => {
		let resetSettled = false;
		const resetPromise = createTestCommandSender(1000)
			.send(CHARGE_POINT_CODE, 'Reset', { type: 'Hard' })
			.then(
				(value) => { resetSettled = true; return value; },
				(error) => { resetSettled = true; throw error; }
			);
		const timeoutAssertion = assert.rejects(resetPromise, /OCPP call timed out: Reset/);
		const resetCall = await receiveFrame();
		assert.deepEqual(resetCall.slice(2), ['Reset', { type: 'Hard' }]);

		const heartbeatResponse = receiveFrame();
		client.send(JSON.stringify([2, 'heartbeat-while-reset-pending', 'Heartbeat', {}]));

		assert.deepEqual(
			await heartbeatResponse,
			[3, 'heartbeat-while-reset-pending', { currentTime: '2026-10-01T00:00:00.000Z' }]
		);
		assert.equal(resetSettled, false);
		await timeoutAssertion;
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

	describe('N1: Không rò rỉ mã lỗi và thông tin nội bộ của CSDL cho trụ', () => {
		it('(a) handler ném lỗi kiểu Postgres có password= và host= -> trả CALLERROR InternalError, không chứa thông tin nhạy cảm', async () => {
			const logCountBefore = logs.length;
			const responsePromise = receiveFrame();
			client.send(JSON.stringify([2, 'msg-pg-err-1', 'FailWithPostgres', {}]));
			const response = await responsePromise;

			// Trụ chỉ nhận được mã InternalError và mô tả chung cố định
			assert.deepEqual(response, [4, 'msg-pg-err-1', 'InternalError', 'Internal error', {}]);
			assert.equal(client.readyState, WebSocket.OPEN);

			const rawResponse = JSON.stringify(response);
			assert.ok(!rawResponse.includes('password'), 'Khung trả về không được chứa password');
			assert.ok(!rawResponse.includes('host'), 'Khung trả về không được chứa host');
			assert.ok(!rawResponse.includes('42P01'), 'Khung trả về không được chứa mã lỗi Postgres 42P01');
			assert.ok(!rawResponse.includes('relation'), 'Khung trả về không được chứa tên relation');
			assert.ok(!rawResponse.includes('users'), 'Khung trả về không được chứa tên bảng users');

			// Log phía server được ghi nhận nhưng password đã được làm sạch
			const newLogs = logs.slice(logCountBefore);
			assert.ok(newLogs.some((l) => l.includes('Handler failed') && l.includes('msg-pg-err-1')));
			assert.ok(!newLogs.some((l) => l.includes('password=secret123')), 'Server log không được chứa password trần');
			assert.ok(newLogs.some((l) => l.includes('password=***')), 'Server log phải thay password bằng ***');
		});

		it('(b) handler ném OcppCallError -> code và message được giữ nguyên', async () => {
			const responsePromise = receiveFrame();
			client.send(JSON.stringify([2, 'msg-ocpp-err-2', 'FailWithOcppCallError', {}]));
			const response = await responsePromise;

			assert.deepEqual(response, [
				4,
				'msg-ocpp-err-2',
				'PropertyConstraintViolation',
				'Field vendor exceeds maximum length of 20 characters',
				{ field: 'vendor' },
			]);
			assert.equal(client.readyState, WebSocket.OPEN);
		});

		it('(c) lỗi bất kỳ (Error thường, TypeError) -> trả InternalError với mô tả chung', async () => {
			const genericResponsePromise = receiveFrame();
			client.send(JSON.stringify([2, 'msg-generic-err-3', 'FailWithGenericError', {}]));
			const genericResponse = await genericResponsePromise;
			assert.deepEqual(genericResponse, [4, 'msg-generic-err-3', 'InternalError', 'Internal error', {}]);

			const typeResponsePromise = receiveFrame();
			client.send(JSON.stringify([2, 'msg-type-err-4', 'FailWithTypeError', {}]));
			const typeResponse = await typeResponsePromise;
			assert.deepEqual(typeResponse, [4, 'msg-type-err-4', 'InternalError', 'Internal error', {}]);
			assert.equal(client.readyState, WebSocket.OPEN);
		});
	});
});