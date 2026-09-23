const http = require('node:http');
const { WebSocketServer } = require('ws');
const env = require('./config/env');
const app = require('./app');
const { migrate } = require('./db/migrate');

const server = http.createServer(app);
const now = () => new Date().toISOString();

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => { const match = request.url.match(/^\/ocpp\/([^/?]+)/); if (!match) return socket.destroy(); wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, decodeURIComponent(match[1]))); });
wss.on('connection', (ws, code) => { ws.send(JSON.stringify([3, `welcome-${Date.now()}`, { chargePoint: code, status: 'Connected' }])); ws.on('message', (raw) => { try { const [type, id, action, payload] = JSON.parse(raw.toString()); const responses = { BootNotification: { status: 'Accepted', currentTime: now(), interval: 60 }, Heartbeat: { currentTime: now() }, StatusNotification: { status: 'Accepted' }, Authorize: { idTagInfo: { status: payload?.idTag ? 'Accepted' : 'Invalid' } } }; ws.send(JSON.stringify(type === 2 && responses[action] ? [3, id, responses[action]] : [4, id, 'NotSupported', {}])); } catch { ws.send(JSON.stringify([4, null, 'FormatViolation', {}])); } }); });

async function start() { await migrate(); server.listen(env.PORT, () => console.log(`CSMS backend listening on http://localhost:${env.PORT}`)); }
start().catch((error) => { console.error('Database startup failed:', error); process.exitCode = 1; });
