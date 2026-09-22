require('dotenv').config();
const http = require('node:http');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { WebSocketServer } = require('ws');
const db = require('./db');
const { authenticate, allow, issueToken, publicUser, verifyPassword } = require('./auth');

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 3000);
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());
const now = () => new Date().toISOString();
const fail = (res, error, status = 400) => res.status(status).json({ error: error.message || error });
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const audit = async (req, action, entity, entityId, metadata = {}) => db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?)').run(req.user?.id || null, action, entity, entityId || null, JSON.stringify(metadata));

app.get('/api/health', async (req, res) => {
  try { await db.pool.query('SELECT 1'); res.json({ ok: true, service: 'csms-backend', database: 'postgresql', time: now() }); }
  catch (error) { fail(res, error, 503); }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role = 'OPERATOR' } = req.body;
  if (!name || !email || !password || password.length < 8) return fail(res, 'name, email và password >= 8 ký tự là bắt buộc');
  try {
    const result = await db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, bcrypt.hashSync(password, 12), role);
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ user: publicUser(user), token: issueToken(user) });
  } catch (error) { fail(res, error.code === '23505' ? 'Email đã tồn tại' : error); }
});
app.post('/api/auth/login', async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email || '');
  if (!user || !verifyPassword(user, req.body.password || '')) return fail(res, 'Email hoặc mật khẩu không đúng', 401);
  res.json({ user: publicUser(user), token: issueToken(user) });
});
app.get('/api/auth/me', authenticate, async (req, res) => res.json(publicUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id))));

app.get('/api/stations', authenticate, async (req, res) => res.json(await db.prepare('SELECT s.*, COUNT(cp.id)::int AS charge_point_count FROM stations s LEFT JOIN charge_points cp ON cp.station_id = s.id GROUP BY s.id ORDER BY s.id DESC').all()));
app.post('/api/stations', authenticate, allow('ADMIN', 'MANAGER'), async (req, res) => {
  const { name, address, latitude, longitude, status = 'ACTIVE' } = req.body;
  if (!name || !address) return fail(res, 'name và address là bắt buộc');
  const result = await db.prepare('INSERT INTO stations (name, address, latitude, longitude, status) VALUES (?, ?, ?, ?, ?)').run(name, address, latitude ?? null, longitude ?? null, status);
  await audit(req, 'CREATE', 'station', result.lastInsertRowid, req.body);
  res.status(201).json(await db.prepare('SELECT * FROM stations WHERE id = ?').get(result.lastInsertRowid));
});
app.get('/api/stations/:id', authenticate, async (req, res) => {
  const station = await db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
  if (!station) return fail(res, 'Không tìm thấy trạm', 404);
  station.charge_points = await db.prepare('SELECT * FROM charge_points WHERE station_id = ? ORDER BY id').all(station.id);
  res.json(station);
});
app.patch('/api/stations/:id', authenticate, allow('ADMIN', 'MANAGER'), async (req, res) => {
  const keys = ['name', 'address', 'latitude', 'longitude', 'status'].filter((key) => req.body[key] !== undefined);
  if (!keys.length) return fail(res, 'Không có trường cần cập nhật');
  await db.prepare(`UPDATE stations SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...keys.map((key) => req.body[key]), req.params.id);
  await audit(req, 'UPDATE', 'station', req.params.id, req.body);
  res.json(await db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id));
});

app.get('/api/charge-points', authenticate, async (req, res) => res.json(await db.prepare('SELECT cp.*, s.name AS station_name FROM charge_points cp JOIN stations s ON s.id = cp.station_id ORDER BY cp.id DESC').all()));
app.get('/api/charge-points/:id', authenticate, async (req, res) => {
  const point = await db.prepare('SELECT cp.*, s.name AS station_name FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.id = ?').get(req.params.id);
  if (!point) return fail(res, 'Không tìm thấy trụ sạc', 404);
  point.connectors = await db.prepare('SELECT * FROM connectors WHERE charge_point_id = ? ORDER BY connector_no').all(point.id);
  res.json(point);
});
app.post('/api/stations/:stationId/charge-points', authenticate, allow('ADMIN', 'MANAGER'), async (req, res) => {
  const { code, model, vendor, status = 'UNKNOWN', power_kw = 0 } = req.body;
  if (!code) return fail(res, 'code là bắt buộc');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const point = await client.query('INSERT INTO charge_points (station_id, code, model, vendor, status, power_kw) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [req.params.stationId, code, model || null, vendor || null, status, numeric(power_kw)]);
    for (let connectorNo = 1; connectorNo <= 4; connectorNo += 1) await client.query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, $2)', [point.rows[0].id, connectorNo]);
    await client.query('COMMIT');
    await audit(req, 'CREATE', 'charge_point', point.rows[0].id, req.body);
    res.status(201).json(await db.prepare('SELECT * FROM charge_points WHERE id = ?').get(point.rows[0].id));
  } catch (error) { await client.query('ROLLBACK'); fail(res, error.code === '23505' ? 'Mã trụ đã tồn tại' : error); } finally { client.release(); }
});
app.patch('/api/charge-points/:id', authenticate, allow('ADMIN', 'MANAGER'), async (req, res) => {
  const point = await db.prepare('SELECT * FROM charge_points WHERE id = ?').get(req.params.id);
  if (!point) return fail(res, 'Không tìm thấy trụ sạc', 404);
  if (req.body.code && req.body.code !== point.code && await db.prepare('SELECT 1 FROM charging_sessions WHERE charge_point_id = ? LIMIT 1').get(point.id)) return fail(res, 'Không thể đổi mã trụ đã có lịch sử sạc', 409);
  const keys = ['code', 'model', 'vendor', 'status', 'power_kw'].filter((key) => req.body[key] !== undefined);
  if (!keys.length) return fail(res, 'Không có trường cần cập nhật');
  try { await db.prepare(`UPDATE charge_points SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...keys.map((key) => req.body[key]), point.id); res.json(await db.prepare('SELECT * FROM charge_points WHERE id = ?').get(point.id)); }
  catch (error) { fail(res, error.code === '23505' ? 'Mã trụ đã tồn tại' : error); }
});

app.get('/api/sessions', authenticate, async (req, res) => res.json(await db.prepare('SELECT cs.*, cp.code AS charge_point_code, s.name AS station_name FROM charging_sessions cs JOIN charge_points cp ON cp.id = cs.charge_point_id JOIN stations s ON s.id = cp.station_id ORDER BY cs.id DESC').all()));
app.post('/api/sessions/start', authenticate, async (req, res) => {
  const { charge_point_id, connector_no = 1, start_meter = 0, transaction_id } = req.body;
  if (!await db.prepare('SELECT id FROM charge_points WHERE id = ?').get(charge_point_id)) return fail(res, 'Không tìm thấy trụ sạc', 404);
  if (await db.prepare("SELECT id FROM charging_sessions WHERE charge_point_id = ? AND connector_no = ? AND status = 'ACTIVE'").get(charge_point_id, connector_no)) return fail(res, 'Connector đang có phiên sạc', 409);
  const result = await db.prepare('INSERT INTO charging_sessions (charge_point_id, connector_no, user_id, transaction_id, start_meter) VALUES (?, ?, ?, ?, ?)').run(charge_point_id, connector_no, req.user.id, transaction_id || `TX-${Date.now()}`, numeric(start_meter));
  await db.prepare("UPDATE connectors SET status = 'CHARGING', updated_at = CURRENT_TIMESTAMP WHERE charge_point_id = ? AND connector_no = ?").run(charge_point_id, connector_no);
  res.status(201).json(await db.prepare('SELECT * FROM charging_sessions WHERE id = ?').get(result.lastInsertRowid));
});
app.post('/api/sessions/:id/meter-values', authenticate, async (req, res) => {
  const session = await db.prepare("SELECT * FROM charging_sessions WHERE id = ? AND status = 'ACTIVE'").get(req.params.id);
  if (!session) return fail(res, 'Phiên sạc không hoạt động', 404);
  const meter = numeric(req.body.meter, session.start_meter);
  if (meter < session.start_meter) return fail(res, 'Meter không được nhỏ hơn meter bắt đầu');
  const result = await db.prepare('INSERT INTO meter_values (session_id, meter, power_kw, voltage, current_amp) VALUES (?, ?, ?, ?, ?)').run(session.id, meter, req.body.power_kw ?? null, req.body.voltage ?? null, req.body.current_amp ?? null);
  await db.prepare('UPDATE charging_sessions SET energy_kwh = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(meter - session.start_meter, session.id);
  res.status(201).json(await db.prepare('SELECT * FROM meter_values WHERE id = ?').get(result.lastInsertRowid));
});
app.post('/api/sessions/:id/stop', authenticate, async (req, res) => {
  const session = await db.prepare("SELECT * FROM charging_sessions WHERE id = ? AND status = 'ACTIVE'").get(req.params.id);
  if (!session) return fail(res, 'Phiên sạc không hoạt động', 404);
  const endMeter = numeric(req.body.end_meter, Number(session.start_meter) + Number(session.energy_kwh));
  const tariff = await db.prepare('SELECT * FROM tariffs WHERE active = TRUE ORDER BY id DESC LIMIT 1').get();
  const amount = (endMeter - Number(session.start_meter)) * Number(tariff?.price_per_kwh || 0);
  await db.prepare("UPDATE charging_sessions SET status = 'COMPLETED', ended_at = CURRENT_TIMESTAMP, end_meter = ?, energy_kwh = ?, amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(endMeter, endMeter - Number(session.start_meter), amount, session.id);
  await db.prepare("UPDATE connectors SET status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP WHERE charge_point_id = ? AND connector_no = ?").run(session.charge_point_id, session.connector_no);
  res.json(await db.prepare('SELECT * FROM charging_sessions WHERE id = ?').get(session.id));
});

app.get('/api/tariffs', authenticate, async (req, res) => res.json(await db.prepare('SELECT * FROM tariffs ORDER BY id DESC').all()));
app.post('/api/tariffs', authenticate, allow('ADMIN', 'MANAGER', 'FINANCE'), async (req, res) => { const result = await db.prepare('INSERT INTO tariffs (name, price_per_kwh, start_time, end_time, active) VALUES (?, ?, ?, ?, ?)').run(req.body.name, numeric(req.body.price_per_kwh), req.body.start_time || null, req.body.end_time || null, req.body.active !== false); res.status(201).json(await db.prepare('SELECT * FROM tariffs WHERE id = ?').get(result.lastInsertRowid)); });
app.get('/api/payments', authenticate, async (req, res) => res.json(await db.prepare('SELECT p.*, cs.transaction_id FROM payments p LEFT JOIN charging_sessions cs ON cs.id = p.session_id ORDER BY p.id DESC').all()));
app.post('/api/payments', authenticate, async (req, res) => { const result = await db.prepare('INSERT INTO payments (session_id, amount, method, status, reference, paid_at) VALUES (?, ?, ?, ?, ?, ?)').run(req.body.session_id || null, numeric(req.body.amount), req.body.method || 'CASH', req.body.status || 'PAID', req.body.reference || `PAY-${Date.now()}`, req.body.status === 'PENDING' ? null : now()); res.status(201).json(await db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid)); });
app.get('/api/maintenance', authenticate, async (req, res) => res.json(await db.prepare('SELECT m.*, cp.code AS charge_point_code FROM maintenance m JOIN charge_points cp ON cp.id = m.charge_point_id ORDER BY m.id DESC').all()));
app.post('/api/maintenance', authenticate, async (req, res) => { const result = await db.prepare('INSERT INTO maintenance (charge_point_id, title, description, status, scheduled_at) VALUES (?, ?, ?, ?, ?)').run(req.body.charge_point_id, req.body.title, req.body.description || null, req.body.status || 'OPEN', req.body.scheduled_at || null); res.status(201).json(await db.prepare('SELECT * FROM maintenance WHERE id = ?').get(result.lastInsertRowid)); });
app.get('/api/dashboard', authenticate, async (req, res) => res.json({ stations: await db.prepare('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = \'ACTIVE\')::int AS active FROM stations').get(), charge_points: await db.prepare('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = \'AVAILABLE\')::int AS available FROM charge_points').get(), active_sessions: (await db.prepare("SELECT COUNT(*)::int AS total FROM charging_sessions WHERE status = 'ACTIVE'").get()).total, revenue: (await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'PAID'").get()).total }));
app.get('/api/reconciliation', authenticate, allow('ADMIN', 'MANAGER', 'FINANCE'), async (req, res) => res.json(await db.prepare("SELECT DATE(ended_at) AS date, COUNT(*)::int AS sessions, COALESCE(SUM(energy_kwh), 0) AS energy_kwh, COALESCE(SUM(amount), 0) AS revenue FROM charging_sessions WHERE status IN ('COMPLETED', 'STOPPED') GROUP BY DATE(ended_at) ORDER BY date DESC").all()));
app.get('/api/audit-logs', authenticate, allow('ADMIN', 'MANAGER'), async (req, res) => res.json(await db.prepare('SELECT al.*, u.email FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id ORDER BY al.id DESC LIMIT 500').all()));

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => { const match = request.url.match(/^\/ocpp\/([^/?]+)/); if (!match) return socket.destroy(); wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, decodeURIComponent(match[1]))); });
wss.on('connection', (ws, code) => { ws.send(JSON.stringify([3, `welcome-${Date.now()}`, { chargePoint: code, status: 'Connected' }])); ws.on('message', (raw) => { try { const [type, id, action, payload] = JSON.parse(raw.toString()); const responses = { BootNotification: { status: 'Accepted', currentTime: now(), interval: 60 }, Heartbeat: { currentTime: now() }, StatusNotification: { status: 'Accepted' }, Authorize: { idTagInfo: { status: payload?.idTag ? 'Accepted' : 'Invalid' } } }; ws.send(JSON.stringify(type === 2 && responses[action] ? [3, id, responses[action]] : [4, id, 'NotSupported', {}])); } catch { ws.send(JSON.stringify([4, null, 'FormatViolation', {}])); } }); });

async function start() { await db.migrate(); await db.seedAdminPassword(); server.listen(port, () => console.log(`CSMS backend listening on http://localhost:${port}`)); }
start().catch((error) => { console.error('Database startup failed:', error); process.exitCode = 1; });
