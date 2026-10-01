const http = require('node:http');
const { WebSocketServer } = require('ws');
const env = require('./config/env');
const app = require('./app');
const { migrate } = require('./db/migrate');
const { pool } = require('./db/pool');
const connections = require('./modules/charge-points/connection-registry');
const { createOcppUpgradeHandler } = require('./modules/ocpp/ocpp-upgrade');

const server = http.createServer(app);
const now = () => new Date().toISOString();

const wss = new WebSocketServer({
	noServer: true,
	handleProtocols: (protocols) => protocols.has('ocpp1.6') ? 'ocpp1.6' : false,
});
server.on('upgrade', createOcppUpgradeHandler({
	wss,
	lookupChargePoint: async (code) => {
		const result = await pool.query(
			'SELECT cp.id, cp.code, s.status AS station_status FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.code = $1 LIMIT 1',
			[code]
		);
		return result.rows[0] || null;
	},
}));
wss.on('connection', (ws, code) => {
	connections.connect(code);
	ws.on('close', () => connections.disconnect(code));
	ws.send(JSON.stringify([3, `welcome-${Date.now()}`, { chargePoint: code, status: 'Connected' }]));
	ws.on('message', (raw) => { try { const [type, id, action, payload] = JSON.parse(raw.toString()); const responses = { BootNotification: { status: 'Accepted', currentTime: now(), interval: 60 }, Heartbeat: { currentTime: now() }, StatusNotification: { status: 'Accepted' }, Authorize: { idTagInfo: { status: payload?.idTag ? 'Accepted' : 'Invalid' } } }; ws.send(JSON.stringify(type === 2 && responses[action] ? [3, id, responses[action]] : [4, id, 'NotSupported', {}])); } catch { ws.send(JSON.stringify([4, null, 'FormatViolation', {}])); } });
});

async function start() { await migrate(); server.listen(env.PORT, () => console.log(`CSMS backend listening on http://localhost:${env.PORT}`)); }
start().catch((error) => { console.error('Database startup failed:', error); process.exitCode = 1; });
