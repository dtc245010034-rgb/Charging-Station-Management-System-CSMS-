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
	const clients = new Set();

	function createSimulator(id) {
		const ws = new WebSocket(`${url}/ocpp/${encodeURIComponent(chargePointCode)}`, ['ocpp1.6']);
		const bufferedFrames = [];
		const waiters = [];
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
			waitForFrame(predicate) {
				const frameIndex = bufferedFrames.findIndex(predicate);
				if (frameIndex !== -1) return Promise.resolve(bufferedFrames.splice(frameIndex, 1)[0]);
				return new Promise((resolve) => waiters.push({ predicate, resolve }));
			},
		};
	}

	async function connectSimulator(id) {
		const connection = once(wss, 'connection');
		const simulator = createSimulator(id);
		await new Promise((resolve, reject) => {
			simulator.ws.once('open', resolve);
			simulator.ws.once('error', reject);
		});
		const [serverSocket] = await connection;
		await simulator.waitForFrame((frame) => frame[0] === 3 && frame[2]?.status === 'Connected');
		return { simulator, serverSocket };
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
			lookupChargePoint: async (code) => code === chargePointCode
				? { id: 1, code, station_status: 'INACTIVE' }
				: null,
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

	it('closes the replaced simulator and continues handling messages on the new connection', async (t) => {
		const first = await connectSimulator('simulator-1');
		const firstClosed = once(first.simulator.ws, 'close');
		const second = await connectSimulator('simulator-2');
		const [closeCode, closeReason] = await firstClosed;

		assert.strictEqual(closeCode, 1000);
		assert.strictEqual(closeReason.toString(), '');
		assert.strictEqual(connections.getConnection(chargePointCode), second.serverSocket);
		assert.notStrictEqual(connections.getConnection(chargePointCode), first.serverSocket);

		const heartbeatResponse = second.simulator.waitForFrame((frame) => frame[0] === 3 && frame[1] === 'heartbeat-2');
		second.simulator.ws.send(JSON.stringify([2, 'heartbeat-2', 'Heartbeat', {}]));
		const response = await heartbeatResponse;
		assert.ok(Number.isFinite(Date.parse(response[2].currentTime)));
		t.diagnostic(`[T-12] ${chargePointCode}: ${first.simulator.id} replaced by ${second.simulator.id}; old close=${closeCode}/${JSON.stringify(closeReason.toString())}; new heartbeat processed.`);
	});
});