const http = require('node:http');
const { once } = require('node:events');
const { after, before, describe, it } = require('node:test');
const assert = require('node:assert');
const { WebSocket, WebSocketServer } = require('ws');
const connections = require('../../src/modules/charge-points/connection-registry');
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');

describe('OCPP duplicate charge-point connections', () => {
	let server;
	let wss;
	let url;
	let chargePointCode;
	let lookupCalls = 0;
	const clients = new Set();

	function createSimulator(id) {
		const ws = new WebSocket(`${url}/ocpp/${encodeURIComponent(chargePointCode)}`, ['ocpp1.6']);
		const bufferedFrames = [];
		const waiters = [];
		const closed = new Promise((resolve) => ws.once('close', (...args) => resolve(args)));
		clients.add(ws);
		ws.on('message', (raw) => {
			const frame = JSON.parse(raw.toString());
			const waiterIndex = waiters.findIndex(({ predicate }) => predicate(frame));
			if (waiterIndex === -1) bufferedFrames.push(frame);
			else waiters.splice(waiterIndex, 1)[0].resolve(frame);
		});
		ws.on('error', () => {});

		return {
			id,
			ws,
			closed,
			waitForFrame(predicate) {
				const frameIndex = bufferedFrames.findIndex(predicate);
				if (frameIndex !== -1) return Promise.resolve(bufferedFrames.splice(frameIndex, 1)[0]);
				return new Promise((resolve) => waiters.push({ predicate, resolve }));
			},
		};
	}

	function rejectCode(code) {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(`${url}/ocpp/${encodeURIComponent(code)}`, ['ocpp1.6']);
			clients.add(ws);
			ws.once('unexpected-response', (request, response) => {
				response.resume();
				resolve({ ws, statusCode: response.statusCode });
			});
			ws.once('error', reject);
		});
	}

	async function connectSimulators(ids) {
		const serverSockets = new Promise((resolve) => {
			const sockets = [];
			const onConnection = (ws) => {
				sockets.push(ws);
				if (sockets.length === ids.length) {
					wss.off('connection', onConnection);
					resolve(sockets);
				}
			};
			wss.on('connection', onConnection);
		});
		const simulators = ids.map(createSimulator);
		await Promise.all(simulators.map(({ ws }) => new Promise((resolve, reject) => {
			ws.once('open', resolve);
			ws.once('error', reject);
		})));
		const acceptedSockets = await serverSockets;
		await Promise.all(simulators.map((simulator) => simulator.waitForFrame(
			(frame) => frame[0] === 3 && frame[2]?.status === 'Connected'
		)));
		return { simulators, acceptedSockets };
	}

	async function closeClient(ws) {
		if (ws.readyState === WebSocket.CLOSED) return;
		await new Promise((resolve) => {
			ws.once('close', resolve);
			if (ws.readyState === WebSocket.OPEN) ws.close();
			else if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
		});
	}

	before(async () => {
		chargePointCode = `CP-DUP-${process.pid}-${Date.now()}`;
		server = http.createServer();
		wss = new WebSocketServer({
			noServer: true,
			handleProtocols: (protocols) => protocols.has('ocpp1.6') ? 'ocpp1.6' : false,
		});
		wss.on('connection', (ws, code) => {
			connections.connect(code, ws);
			ws.on('close', () => connections.disconnect(code, ws));
			ws.send(JSON.stringify([3, `welcome-${Date.now()}`, { chargePoint: code, status: 'Connected' }]));
			ws.on('message', (raw) => {
				try {
					const [type, id, action] = JSON.parse(raw.toString());
					const response = action === 'Heartbeat' ? { currentTime: new Date().toISOString() } : {};
					ws.send(JSON.stringify(type === 2 ? [3, id, response] : [4, id, 'NotSupported', {}]));
				} catch {
					ws.send(JSON.stringify([4, null, 'FormatViolation', {}]));
				}
			});
		});
		server.on('upgrade', createOcppUpgradeHandler({
			wss,
			lookupChargePoint: async (code) => {
				lookupCalls += 1;
				return code === chargePointCode ? { id: 1, code, station_status: 'INACTIVE' } : null;
			},
		}));
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		url = `ws://127.0.0.1:${server.address().port}`;
	});

	after(async () => {
		await Promise.all([...clients].map(closeClient));
		connections.disconnect(chargePointCode);
		if (wss) await new Promise((resolve) => wss.close(resolve));
		if (server?.listening) await new Promise((resolve) => server.close(resolve));
	});

	it('rejects invalid, null-byte, and overlong codes before charge-point lookup', async () => {
		const lookupCount = lookupCalls;
		for (const code of ['CP-DUP.INVALID', 'CP-DUP\0INVALID', 'A'.repeat(51), 'CP-DUP/INVALID']) {
			const result = await rejectCode(code);
			assert.strictEqual(result.statusCode, 400, `Expected ${JSON.stringify(code)} to be rejected`);
		}
		assert.strictEqual(lookupCalls, lookupCount);
	});

	it('S-13: replaces one of two near-simultaneous connections and handles messages on the survivor', async (t) => {
		const { simulators, acceptedSockets } = await connectSimulators(['simulator-1', 'simulator-2']);
		const closed = await Promise.race(simulators.map((simulator) => simulator.closed.then((event) => ({ simulator, event }))));
		const survivor = simulators.find((simulator) => simulator !== closed.simulator);
		const [closeCode, closeReason] = closed.event;

		assert.strictEqual(closeCode, 1000);
		assert.strictEqual(closeReason.toString(), '');
		assert.strictEqual(survivor.ws.readyState, WebSocket.OPEN);
		assert.strictEqual(acceptedSockets.length, 2);
		assert.strictEqual(connections.getConnection(chargePointCode), acceptedSockets.find((socket) => socket.readyState === WebSocket.OPEN));

		const heartbeatId = 'heartbeat-survivor';
		const heartbeatResponse = survivor.waitForFrame((frame) => frame[0] === 3 && frame[1] === heartbeatId);
		survivor.ws.send(JSON.stringify([2, heartbeatId, 'Heartbeat', {}]));
		const response = await heartbeatResponse;
		assert.ok(Number.isFinite(Date.parse(response[2].currentTime)));
		t.diagnostic(`[S-13] ${chargePointCode}: ${closed.simulator.id} closed; ${survivor.id} remains active and processed Heartbeat.`);
	});
});