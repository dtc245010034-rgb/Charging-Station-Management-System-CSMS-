const http = require('node:http');
const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');
const env = require('./config/env');
const db = require('./db');
const {
  authenticate,
  allow,
  issueToken,
  publicUser,
  hashPassword,
  verifyPassword,
  checkUserLock,
  recordUserFailedLogin,
  resetUserFailedAttempts,
  getUserRoles,
  SYSTEM_ROLES,
} = require('./auth');

const path = require('node:path');
const app = express();
const server = http.createServer(app);
const port = env.PORT;
app.use(cors({ origin: env.APP_ORIGIN.split(','), credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.resolve(__dirname, '../../')));
const now = () => new Date().toISOString();
const fail = (res, error, status = 400) => res.status(status).json({ error: error.message || error });
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const audit = async (req, action, entity, entityId, metadata = {}) => db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?)').run(req.user?.id || null, action, entity, entityId || null, JSON.stringify(metadata));
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu đăng nhập từ IP này. Vui lòng thử lại sau 15 phút.' },
});

app.get('/api/health', async (req, res) => {
  try { await db.pool.query('SELECT 1'); res.json({ ok: true, service: 'csms-backend', database: 'postgresql', time: now() }); }
  catch (error) { fail(res, error, 503); }
});

app.get('/api/roles', async (req, res) => {
  try {
    const roles = await db.prepare('SELECT id, code, name, description, created_at FROM roles ORDER BY id ASC').all();
    res.json(roles);
  } catch (error) {
    fail(res, error, 500);
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role = 'OPERATOR' } = req.body;
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) return fail(res, 'name, email và password >= 8 ký tự là bắt buộc');
  if (!SYSTEM_ROLES.includes(role)) return fail(res, 'Vai trò không hợp lệ');
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const passwordHash = await hashPassword(password);
    const result = await db.prepare(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
    ).run(name, normalizedEmail, passwordHash);

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const roleRow = await db.prepare('SELECT id FROM roles WHERE code = ?').get(role);
    if (roleRow) {
      await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(user.id, roleRow.id);
    }
    const roles = await getUserRoles(user.id);
    const token = issueToken(user, roles);

    // Set httpOnly cookie for session
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 3600 * 1000,
      secure: env.NODE_ENV === 'production',
    });

    res.status(201).json({ user: publicUser(user, roles), token });
  } catch (error) { fail(res, error.code === '23505' ? 'Email đã tồn tại' : error); }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const password = req.body.password || '';

  // Look up user in PostgreSQL users table
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // Check persistent lock status stored in users table (not in-memory)
  if (user) {
    const lockStatus = await checkUserLock(user);
    if (lockStatus.locked) {
      return fail(res, lockStatus.message, 429);
    }
  }

  const isValid = user ? await verifyPassword(user, password) : false;

  if (!isValid) {
    // Record failed attempt directly in users table if user exists
    if (user) {
      await recordUserFailedLogin(user);
    }
    // Generic error message that does not leak email existence
    return fail(res, 'Email hoặc mật khẩu không đúng', 401);
  }

  // Reset failed attempts in users table on successful login
  await resetUserFailedAttempts(user.id);
  const roles = await getUserRoles(user.id);
  const token = issueToken(user, roles);

  // Issue httpOnly session cookie
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 3600 * 1000,
    secure: env.NODE_ENV === 'production',
  });

  res.json({ user: publicUser(user, roles), token });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true, message: 'Đăng xuất thành công' });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return fail(res, 'Người dùng không tồn tại', 404);
  const roles = await getUserRoles(user.id);
  res.json(publicUser(user, roles));
});

app.get('/api/stations', authenticate, async (req, res) => res.json(await db.prepare('SELECT s.*, COUNT(cp.id)::int AS charge_point_count FROM stations s LEFT JOIN charge_points cp ON cp.station_id = s.id GROUP BY s.id ORDER BY s.id DESC').all()));
app.post('/api/stations', authenticate, allow('ADMIN', 'STATION_OWNER'), async (req, res) => {
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
app.patch('/api/stations/:id', authenticate, allow('ADMIN', 'STATION_OWNER'), async (req, res) => {
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
app.post('/api/stations/:stationId/charge-points', authenticate, allow('ADMIN', 'STATION_OWNER'), async (req, res) => {
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
app.patch('/api/charge-points/:id', authenticate, allow('ADMIN', 'STATION_OWNER'), async (req, res) => {
  const point = await db.prepare('SELECT * FROM charge_points WHERE id = ?').get(req.params.id);
  if (!point) return fail(res, 'Không tìm thấy trụ sạc', 404);
  const keys = ['code', 'model', 'vendor', 'status', 'power_kw'].filter((key) => req.body[key] !== undefined);
  if (!keys.length) return fail(res, 'Không có trường cần cập nhật');
  try { await db.prepare(`UPDATE charge_points SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...keys.map((key) => req.body[key]), point.id); res.json(await db.prepare('SELECT * FROM charge_points WHERE id = ?').get(point.id)); }
  catch (error) { fail(res, error.code === '23505' ? 'Mã trụ đã tồn tại' : error); }
});


const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => { const match = request.url.match(/^\/ocpp\/([^/?]+)/); if (!match) return socket.destroy(); wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, decodeURIComponent(match[1]))); });
wss.on('connection', (ws, code) => { ws.send(JSON.stringify([3, `welcome-${Date.now()}`, { chargePoint: code, status: 'Connected' }])); ws.on('message', (raw) => { try { const [type, id, action, payload] = JSON.parse(raw.toString()); const responses = { BootNotification: { status: 'Accepted', currentTime: now(), interval: 60 }, Heartbeat: { currentTime: now() }, StatusNotification: { status: 'Accepted' }, Authorize: { idTagInfo: { status: payload?.idTag ? 'Accepted' : 'Invalid' } } }; ws.send(JSON.stringify(type === 2 && responses[action] ? [3, id, responses[action]] : [4, id, 'NotSupported', {}])); } catch { ws.send(JSON.stringify([4, null, 'FormatViolation', {}])); } }); });

async function start() { await db.migrate(); server.listen(port, () => console.log(`CSMS backend listening on http://localhost:${port}`)); }
start().catch((error) => { console.error('Database startup failed:', error); process.exitCode = 1; });
