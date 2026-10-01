const http = require('node:http');
const { once } = require('node:events');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { WebSocket, WebSocketServer } = require('ws');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { pool } = require('../../src/db/pool');
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');

describe('S-06: OCPP WebSocket handshake', () => {
	let server;
	let wss;
	let url;
	let stationId;
	const clients = new Set();
	const warnings = [];
	const serverConnections = [];
	let lookupCalls = 0;

	function connect(code, protocols, options = {}, query = '') {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(`${url}/ocpp/${encodeURIComponent(code)}${query}`, protocols, options);
			clients.add(ws);
			let settled = false;
			const finish = (callback, value) => {
				if (settled) return;
				settled = true;
				callback(value);
			};
			ws.once('open', () => finish(resolve, { ws }));
			ws.once('unexpected-response', (request, response) => {
				response.resume();
				finish(resolve, { ws, statusCode: response.statusCode });
			});
			ws.once('error', (error) => finish(reject, error));
		});
	}

	async function closeClient(ws) {
		if (ws.readyState === WebSocket.OPEN) {
			await new Promise((resolve) => {
				ws.once('close', resolve);
				ws.close();
			});
		} else if (ws.readyState === WebSocket.CONNECTING) {
			ws.terminate();
		}
	}

	before(async () => {
		await resetSchema();
		assert.strictEqual(run('src/db/migrate.js').status, 0);
		await truncateAll();
		const owner = await createUser('ocpp-owner@example.com', 'STATION_OWNER');
		const station = await postStation(owner, stationBody({ name: 'OCPP Test Station' }));
		assert.strictEqual(station.status, 201);
		stationId = station.body.id;
		await query('INSERT INTO charge_points (station_id, code) VALUES ($1, $2)', [stationId, 'CP-S06-VALID']);

		server = http.createServer();
		wss = new WebSocketServer({
			noServer: true,
			handleProtocols: (protocols) => protocols.has('ocpp1.6') ? 'ocpp1.6' : false,
		});
		wss.on('connection', (ws) => serverConnections.push(ws));
		server.on('upgrade', createOcppUpgradeHandler({
			wss,
			lookupChargePoint: async (code) => {
				lookupCalls += 1;
				const result = await pool.query(
					'SELECT cp.id, cp.code, s.status AS station_status FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.code = $1 LIMIT 1',
					[code]
				);
				return result.rows[0] || null;
			},
			logWarning: (message) => warnings.push(message),
			logError: () => {},
		}));
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		url = `ws://127.0.0.1:${server.address().port}`;
	});

	after(async () => {
		await Promise.all([...clients].map(closeClient));
		if (wss) await new Promise((resolve) => wss.close(resolve));
		if (server?.listening) await new Promise((resolve) => server.close(resolve));
		await resetSchema();
		await closePool();
	});

	it('accepts a registered code and keeps the WebSocket open with station metadata', async () => {
		const connected = once(wss, 'connection');
		const result = await connect('cp-s06-valid', ['ocpp1.6']);
		assert.ok(result.ws);
		assert.strictEqual(result.ws.protocol, 'ocpp1.6');
		assert.strictEqual(result.ws.readyState, WebSocket.OPEN);
		const [serverSocket] = await connected;
		assert.strictEqual(serverSocket.stationStatus, 'INACTIVE');
		await closeClient(result.ws);
	});

	it('accepts a temporarily inactive station so it can report status', async () => {
		await query('UPDATE stations SET status = $1 WHERE id = $2', ['MAINTENANCE', stationId]);
		const connected = once(wss, 'connection');
		const result = await connect('CP-S06-VALID', ['ocpp1.6']);
		assert.ok(result.ws);
		const [serverSocket] = await connected;
		assert.strictEqual(serverSocket.stationStatus, 'MAINTENANCE');
		await closeClient(result.ws);
	});

	it('rejects unknown codes within one second and logs exactly one safe warning', async () => {
		const startedAt = Date.now();
		const result = await connect('UNKNOWN-999-INJECTED', ['ocpp1.6'], { headers: { Cookie: 'secret-cookie' } }, '?token=secret');
		assert.strictEqual(result.statusCode, 403);
		assert.ok(Date.now() - startedAt < 1000);
		assert.strictEqual(warnings.length, 1);
		assert.match(warnings[0], /127\.0\.0\.1/);
		assert.match(warnings[0], /UNKNOWN-999/);
		assert.doesNotMatch(warnings[0], /secret|Cookie|token/i);
		assert.doesNotMatch(warnings[0], /[\r\n]/);
	});

	it('rejects invalid, null-byte, and overlong codes before querying the database', async () => {
		const lookupCount = lookupCalls;
		for (const code of ['CP-S06\0VALID', 'CP-S06.INVALID', 'A'.repeat(51), 'CP-S06/VALID']) {
			const result = await connect(code, ['ocpp1.6']);
			assert.strictEqual(result.statusCode, 400, `Expected ${JSON.stringify(code)} to be rejected`);
		}
		assert.strictEqual(lookupCalls, lookupCount);
	});

	it('rejects unsupported subprotocols during the HTTP handshake without logging a charge-point warning', async () => {
		const result = await connect('CP-S06-VALID', ['ocpp2.0.1']);
		assert.strictEqual(result.statusCode, 400);
		assert.strictEqual(warnings.length, 1);
	});
});