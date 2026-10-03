#!/usr/bin/env node
/**
 * Kịch bản kiểm chứng vòng 6 trên SERVER THẬT (tiến trình `node backend/src/server.js`) với DB riêng dùng một lần.
 *
 * AN TOÀN
 *  - Chỉ chạy trên database mới tên kết thúc `_chk` (mặc định csms_r6live_chk); từ chối tên khác, tạo mới rồi DROP khi xong.
 *  - Không chạm database `csms_test`, không chạm staging/production, không dùng mật khẩu yếu.
 *  - Thông tin đăng nhập admin đọc từ biến môi trường ADMIN_EMAIL / ADMIN_PASSWORD (≥ 12 ký tự); không in ra, không ghi file.
 *    Mật khẩu của các user phụ và JWT_SECRET sinh ngẫu nhiên trong tiến trình, không in ra.
 *
 * CHẠY (từ thư mục gốc repo, Node >= 22):
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node tools/verify-round6-live.js
 *
 * Biến tuỳ chọn:
 *   CHK_ADMIN_DATABASE_URL  URL quản trị Postgres để CREATE/DROP DATABASE (mặc định: Postgres test ở cổng 5433,
 *                           kết nối vào database `postgres`, không vào csms_test)
 *   CHK_DB_NAME             tên DB (phải kết thúc `_chk`)
 *   VERIFY_REPORT           đường dẫn file .md để ghi bảng kết quả
 *
 * Kết thúc với mã 0 nếu mọi dòng ok, 1 nếu có FAIL.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const backendRequire = (name) => require(require.resolve(name, { paths: [BACKEND] }));
const { WebSocket } = backendRequire('ws');
const { Client } = backendRequire('pg');

// ---------------------------------------------------------------- cấu hình & rào chắn an toàn
const DB_NAME = process.env.CHK_DB_NAME || 'csms_r6live_chk';
if (!/^[a-z0-9_]+_chk$/.test(DB_NAME)) {
  console.error(`Từ chối chạy: tên database "${DB_NAME}" phải kết thúc bằng _chk (chữ thường, số, gạch dưới).`);
  process.exit(2);
}
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Thiếu ADMIN_EMAIL / ADMIN_PASSWORD trong biến môi trường. Dừng, không dùng giá trị mặc định.');
  process.exit(2);
}
if (ADMIN_PASSWORD.length < 12) {
  console.error('ADMIN_PASSWORD phải từ 12 ký tự trở lên (script không chấp nhận mật khẩu yếu).');
  process.exit(2);
}

const adminUrl = new URL(process.env.CHK_ADMIN_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/postgres');
if (/_test$/.test(adminUrl.pathname.slice(1))) adminUrl.pathname = '/postgres';
const dbUrl = new URL(adminUrl);
dbUrl.pathname = `/${DB_NAME}`;
const DATABASE_URL = dbUrl.toString();
const JWT_SECRET = crypto.randomBytes(24).toString('hex');
const randomPassword = () => `Pw-${crypto.randomBytes(12).toString('hex')}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = () => crypto.randomUUID();

// ---------------------------------------------------------------- ghi kết quả
const results = [];
let currentArea = '';
function rec(expect, ok, observed) {
  results.push({ n: results.length + 1, area: currentArea, expect, ok: Boolean(ok), observed: String(observed) });
  console.log(`  [${ok ? ' ok ' : 'FAIL'}] ${short(expect, 90)} → ${short(observed, 90)}`);
}
async function section(name, fn) {
  currentArea = name;
  console.log(`\n--- ${name}`);
  try {
    await fn();
  } catch (error) {
    rec('(phần chạy không văng ngoại lệ)', false, `ngoại lệ: ${String(error?.message || error).slice(0, 200)}`);
  }
}
const short = (value, max = 110) => {
  const text = String(value).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

// ---------------------------------------------------------------- DB
let db;
async function openDb() {
  db = new Client({ connectionString: DATABASE_URL });
  db.on('error', () => {});
  await db.connect();
}
const q = (sql, params) => db.query(sql, params);

async function cpState(code) {
  const cp = (await q(
    `SELECT id, status, vendor, model, serial_number, firmware_version, heartbeat_interval,
            ABS(EXTRACT(EPOCH FROM (now() - last_seen_at)))::float8 AS seen_age
       FROM charge_points WHERE code = $1`, [code])).rows[0];
  if (!cp) return null;
  const connectors = (await q('SELECT connector_no AS no, status, ocpp_status AS ocpp FROM connectors WHERE charge_point_id = $1 ORDER BY connector_no', [cp.id])).rows;
  return { ...cp, connectors };
}
const connSummary = (state) => state.connectors.map((c) => `${c.no}:${c.status}/${c.ocpp ?? '-'}`).join(' ');
async function waitFor(fn, timeoutMs = 5000, intervalMs = 40) {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return { value, ms: Date.now() - started };
    if (Date.now() - started > timeoutMs) return null;
    await sleep(intervalMs);
  }
}
const waitStatus = (code, status, timeoutMs) => waitFor(async () => ((await cpState(code))?.status === status), timeoutMs);

// ---------------------------------------------------------------- tiến trình server thật
const allServerOutput = [];
async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
async function startServer(extraEnv = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND,
    env: {
      PATH: process.env.PATH, CSMS_SKIP_DOTENV: '1', DATABASE_URL, JWT_SECRET,
      APP_ORIGIN: `http://127.0.0.1:${port}`, PORT: String(port), ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const server = { child, port, output: '', exit: null };
  const collect = (chunk) => { server.output += chunk.toString(); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  server.exited = new Promise((resolve) => child.once('exit', (code, signal) => {
    server.exit = { code, signal };
    allServerOutput.push(server.output);
    resolve(server.exit);
  }));
  const deadline = Date.now() + 30000;
  for (;;) {
    if (server.exit) throw new Error(`server thoát sớm (${JSON.stringify(server.exit)}): ${short(server.output, 300)}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.status === 200) break;
    } catch { /* chưa sẵn sàng */ }
    if (Date.now() > deadline) throw new Error('server không sẵn sàng sau 30 giây');
    await sleep(100);
  }
  return server;
}
async function stopServer(server, signal = 'SIGTERM', timeoutMs = 10000) {
  if (!server || server.exit) return server?.exit;
  server.child.kill(signal);
  const result = await Promise.race([server.exited, sleep(timeoutMs).then(() => null)]);
  if (!result) { server.child.kill('SIGKILL'); return server.exited; }
  return result;
}
const portRefuses = (port) => new Promise((resolve) => {
  const socket = net.connect(port, '127.0.0.1');
  socket.once('connect', () => { socket.destroy(); resolve(false); });
  socket.once('error', () => resolve(true));
});

// ---------------------------------------------------------------- API HTTP
async function api(port, method, url, { cookie, body, headers = {} } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* không có thân JSON */ }
  const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, body: json, cookie: setCookie.map((c) => c.split(';')[0]).join('; ') };
}
async function login(port, email, password) {
  const res = await api(port, 'POST', '/auth/login', { body: { email, password } });
  return { ...res, cookie: res.cookie };
}

// ---------------------------------------------------------------- trụ ảo OCPP
const allCallErrors = [];
class Cp {
  constructor(ws, code) {
    this.ws = ws;
    this.code = code;
    this.pending = new Map();
    this.pings = 0;
    this.sentAt = [];
    this.closed = null;
    this.closedPromise = new Promise((resolve) => ws.on('close', (c, reason) => {
      this.closed = { code: c, reason: reason.toString(), at: Date.now() };
      for (const [id, waiter] of this.pending) {
        clearTimeout(waiter.t);
        waiter.reject(new Error(`kết nối đóng (${c}) khi đang chờ phản hồi`));
        this.pending.delete(id);
      }
      resolve(this.closed);
    }));
    ws.on('error', () => {});
    ws.on('ping', () => { this.pings += 1; });
    ws.on('message', (raw) => {
      let frame;
      try { frame = JSON.parse(raw.toString()); } catch { return; }
      if (frame[0] === 4) allCallErrors.push(JSON.stringify(frame));
      const waiter = this.pending.get(frame[1]);
      if (!waiter || (frame[0] !== 3 && frame[0] !== 4)) return;
      clearTimeout(waiter.t);
      this.pending.delete(frame[1]);
      waiter.resolve(frame[0] === 3
        ? { ok: true, payload: frame[2] }
        : { ok: false, code: frame[2], desc: frame[3], payload: frame[4] });
    });
  }

  static open(port, code, { protocols = ['ocpp1.6'], wsOptions = {} } = {}) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ocpp/${code}`, protocols, wsOptions);
      let cp;
      ws.once('open', () => resolve(cp));
      ws.once('error', reject);
      ws.once('unexpected-response', (_req, res) => { res.resume(); reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode })); });
      cp = new Cp(ws, code);
    });
  }

  // Giữ tốc độ gửi dưới giới hạn 50 tin/giây của server (trừ khi cố ý dồn tin bằng fire/raw/send trực tiếp).
  async pace() {
    for (;;) {
      const now = Date.now();
      this.sentAt = this.sentAt.filter((t) => now - t < 1000);
      if (this.sentAt.length < 35) break;
      await sleep(1000 - (now - this.sentAt[0]) + 5);
    }
    this.sentAt.push(Date.now());
  }

  async quiet() {
    await sleep(1050);
    this.sentAt = [];
  }

  async call(action, payload, { timeoutMs = 6000, id = uuid(), paced = true } = {}) {
    if (paced) await this.pace();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`quá hạn chờ phản hồi ${action}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, t });
      try { this.ws.send(JSON.stringify([2, id, action, payload])); } catch (error) { clearTimeout(t); this.pending.delete(id); reject(error); }
    });
  }

  raw(text, expectId, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(expectId); reject(new Error('quá hạn chờ phản hồi khung thô')); }, timeoutMs);
      this.pending.set(expectId, { resolve, reject, t });
      this.ws.send(text);
    });
  }

  fire(action, payload) {
    try { this.ws.send(JSON.stringify([2, uuid(), action, payload])); } catch { /* socket đã đóng */ }
  }

  boot(extra = {}) {
    return this.call('BootNotification', {
      chargePointVendor: 'R6Vendor', chargePointModel: 'R6Model',
      chargePointSerialNumber: `SN-${this.code.slice(-12)}`, firmwareVersion: 'FW-1', ...extra,
    });
  }

  status(connectorId, status, extra = {}) {
    return this.call('StatusNotification', { connectorId, status, errorCode: 'NoError', ...extra });
  }

  async closeGracefully() {
    if (this.closed) return this.closed;
    this.ws.close(1000);
    return Promise.race([this.closedPromise, sleep(3000).then(() => { this.ws.terminate(); return this.closedPromise; })]);
  }
}
async function handshakeStatus(port, urlPath, protocols) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${urlPath}`, protocols);
    setTimeout(() => { ws.terminate(); resolve('quá hạn'); }, 4000).unref();
    ws.once('open', () => { ws.terminate(); resolve('open'); });
    ws.once('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode); });
    ws.once('error', (error) => resolve(`lỗi: ${error.message}`));
  });
}

// ---------------------------------------------------------------- dựng trạm / trụ qua API
const ctx = {};
async function mkStation(port, tag, cookie = ctx.adminCookie) {
  const res = await api(port, 'POST', '/stations', {
    cookie, headers: { 'Idempotency-Key': `r6-${uuid()}` },
    body: { name: `R6 ${tag}`, address: 'Hà Nội (trạm kiểm thử)', latitude: 21.03, longitude: 105.85 },
  });
  if (res.status !== 201) throw new Error(`tạo trạm ${tag} lỗi HTTP ${res.status}`);
  return res.body.id;
}
async function mkCp(port, stationId, code, connectorCount = 2) {
  const res = await api(port, 'POST', `/stations/${stationId}/charge-points`, { cookie: ctx.adminCookie, body: { code, connector_count: connectorCount } });
  if (res.status !== 201) throw new Error(`tạo trụ ${code} lỗi HTTP ${res.status}`);
  return res.body.id;
}
async function freshCp(port, code, connectorCount = 2) {
  const stationId = await mkStation(port, code);
  const id = await mkCp(port, stationId, code, connectorCount);
  return { stationId, id };
}
async function onlineCp(port, code) {
  const cp = await Cp.open(port, code);
  const boot = await cp.boot();
  if (!boot.ok || boot.payload.status !== 'Accepted') throw new Error(`Boot ${code} không Accepted`);
  return cp;
}
const lockStation = (port, stationId, locked) => api(port, 'PATCH', `/admin/stations/${stationId}/lock`, { cookie: ctx.adminCookie, body: { locked } });

// ================================================================= CHƯƠNG TRÌNH CHÍNH
async function main() {
  const startedAt = Date.now();
  console.log(`=== Kiểm chứng vòng 6 trên server thật | DB: ${DB_NAME} | Node ${process.version} ===`);

  // ------------------------------------------------ chuẩn bị DB
  const admin = new Client({ connectionString: adminUrl.toString() });
  admin.on('error', () => {});
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  await openDb();

  const baseEnv = { PATH: process.env.PATH, CSMS_SKIP_DOTENV: '1', DATABASE_URL, JWT_SECRET, APP_ORIGIN: 'http://127.0.0.1:3000' };
  const migrated = spawnSync(process.execPath, ['src/db/migrate.js'], { cwd: BACKEND, env: baseEnv, encoding: 'utf8' });
  if (migrated.status !== 0) throw new Error(`migrate lỗi: ${short(migrated.stderr, 200)}`);
  const created = spawnSync(process.execPath, ['scripts/create-admin.js'], { cwd: BACKEND, env: { ...baseEnv, ADMIN_EMAIL, ADMIN_PASSWORD }, encoding: 'utf8' });
  if (created.status !== 0) throw new Error(`create-admin lỗi: ${short(created.stderr, 200)}`);

  let s1 = await startServer();
  let s2 = null;

  try {
    // ================================================= A. đăng nhập / RBAC
    await section('A. Đăng nhập & RBAC', async () => {
      const port = s1.port;
      const health = await api(port, 'GET', '/health');
      rec('GET /api/health → 200 ok:true', health.status === 200 && health.body?.ok === true, `HTTP ${health.status}`);
      const anon = await api(port, 'GET', '/stations');
      rec('Chưa đăng nhập GET /stations → 401', anon.status === 401, `HTTP ${anon.status}`);
      const bad = await login(port, ADMIN_EMAIL, `${randomPassword()}x`);
      rec('Sai mật khẩu → 401, không cấp cookie', bad.status === 401 && !bad.cookie, `HTTP ${bad.status}, cookie=${bad.cookie ? 'có' : 'không'}`);
      const ok = await login(port, ADMIN_EMAIL, ADMIN_PASSWORD);
      ctx.adminCookie = ok.cookie;
      rec('Admin đăng nhập → 200 + cookie phiên', ok.status === 200 && /^token=/.test(ok.cookie), `HTTP ${ok.status}, cookie=${ok.cookie ? 'có' : 'không'}`);

      const users = {};
      for (const [key, role] of [['owner1', 'STATION_OWNER'], ['owner2', 'STATION_OWNER'], ['operator', 'OPERATOR'], ['driver', 'DRIVER']]) {
        const password = randomPassword();
        const email = `${key}-${crypto.randomBytes(4).toString('hex')}@chk.invalid`;
        const made = await api(port, 'POST', '/admin/users', { cookie: ctx.adminCookie, body: { name: key, email, password, role } });
        const session = await login(port, email, password);
        users[key] = { cookie: session.cookie, create: made.status, login: session.status };
      }
      ctx.users = users;
      rec('Admin tạo 4 user (owner×2, operator, driver) và đăng nhập được', Object.values(users).every((u) => u.create === 201 && u.login === 200),
        Object.entries(users).map(([k, u]) => `${k}:${u.create}/${u.login}`).join(' '));

      const driver = await api(port, 'GET', '/stations', { cookie: users.driver.cookie });
      rec('DRIVER GET /stations → 403', driver.status === 403, `HTTP ${driver.status}`);
      const opWrite = await api(port, 'POST', '/stations', { cookie: users.operator.cookie, headers: { 'Idempotency-Key': `r6-${uuid()}` }, body: { name: 'x', address: 'y', latitude: 1, longitude: 1 } });
      rec('OPERATOR POST /stations → 403', opWrite.status === 403, `HTTP ${opWrite.status}`);
      const opRead = await api(port, 'GET', '/stations', { cookie: users.operator.cookie });
      rec('OPERATOR GET /stations → 200', opRead.status === 200, `HTTP ${opRead.status}`);
      const ownerAdmin = await api(port, 'POST', '/admin/users', { cookie: users.owner1.cookie, body: { name: 'x', email: 'x@chk.invalid', password: randomPassword(), role: 'ADMIN' } });
      rec('STATION_OWNER tạo user qua /admin/users → 403', ownerAdmin.status === 403, `HTTP ${ownerAdmin.status}`);
      const regAdmin = await api(port, 'POST', '/auth/register', { body: { name: 'x', email: `r-${crypto.randomBytes(3).toString('hex')}@chk.invalid`, password: randomPassword(), role: 'ADMIN' } });
      rec('Đăng ký công khai kèm role ADMIN → 400', regAdmin.status === 400, `HTTP ${regAdmin.status}`);
    });

    // ================================================= B. trạm / trụ
    await section('B. Tạo trạm & trụ', async () => {
      const port = s1.port;
      const key = `r6-${uuid()}`;
      const body = { name: 'R6 Idem', address: 'Hà Nội', latitude: 21.03, longitude: 105.85 };
      const noKey = await api(port, 'POST', '/stations', { cookie: ctx.adminCookie, body });
      rec('POST /stations thiếu Idempotency-Key → 400', noKey.status === 400, `HTTP ${noKey.status}`);
      const badKey = await api(port, 'POST', '/stations', { cookie: ctx.adminCookie, headers: { 'Idempotency-Key': 'ab' }, body });
      rec('Idempotency-Key quá ngắn → 400', badKey.status === 400, `HTTP ${badKey.status}`);
      const noCoord = await api(port, 'POST', '/stations', { cookie: ctx.adminCookie, headers: { 'Idempotency-Key': `r6-${uuid()}` }, body: { name: 'x', address: 'y' } });
      rec('Thiếu toạ độ → 400', noCoord.status === 400, `HTTP ${noCoord.status}`);
      const withStatus = await api(port, 'POST', '/stations', { cookie: ctx.adminCookie, headers: { 'Idempotency-Key': `r6-${uuid()}` }, body: { ...body, status: 'ACTIVE' } });
      rec('Chỉ định status khi tạo trạm → 400', withStatus.status === 400, `HTTP ${withStatus.status}`);
      const first = await api(port, 'POST', '/stations', { cookie: ctx.adminCookie, headers: { 'Idempotency-Key': key }, body });
      const again = await api(port, 'POST', '/stations', { cookie: ctx.adminCookie, headers: { 'Idempotency-Key': key }, body });
      const rows = (await q("SELECT count(*)::int AS n FROM stations WHERE name = 'R6 Idem'")).rows[0].n;
      rec('Cùng Idempotency-Key + cùng body → 201 cùng id, chỉ 1 dòng DB',
        first.status === 201 && again.status === 201 && first.body.id === again.body.id && rows === 1, `HTTP ${first.status}/${again.status}, id ${first.body?.id}/${again.body?.id}, dòng=${rows}`);
      const clash = await api(port, 'POST', '/stations', { cookie: ctx.adminCookie, headers: { 'Idempotency-Key': key }, body: { ...body, name: 'R6 Idem khác' } });
      rec('Cùng Idempotency-Key + body khác → 409', clash.status === 409, `HTTP ${clash.status}`);

      const owner1Station = await api(port, 'POST', '/stations', { cookie: ctx.users.owner1.cookie, headers: { 'Idempotency-Key': `r6-${uuid()}` }, body: { ...body, name: 'R6 Owner1' } });
      const owner2Get = await api(port, 'GET', `/stations/${owner1Station.body?.id}`, { cookie: ctx.users.owner2.cookie });
      const owner1List = await api(port, 'GET', '/stations', { cookie: ctx.users.owner1.cookie });
      const owner2List = await api(port, 'GET', '/stations', { cookie: ctx.users.owner2.cookie });
      rec('Owner2 không xem được trạm của Owner1 (403/404) và danh sách chỉ chứa trạm của mình',
        [403, 404].includes(owner2Get.status) && owner1List.body.length === 1 && owner2List.body.length === 0,
        `owner2 GET ${owner2Get.status}, list owner1=${owner1List.body?.length} owner2=${owner2List.body?.length}`);

      const stationId = first.body.id;
      const cpLower = await api(port, 'POST', `/stations/${stationId}/charge-points`, { cookie: ctx.adminCookie, body: { code: 'r6-idem-01' } });
      const detail = await api(port, 'GET', `/charge-points/${cpLower.body?.id}`, { cookie: ctx.adminCookie });
      rec('Tạo trụ mã chữ thường → 201, mã lưu IN HOA, mặc định 4 đầu nối',
        cpLower.status === 201 && cpLower.body.code === 'R6-IDEM-01' && detail.body?.connectors?.length === 4, `HTTP ${cpLower.status}, code=${cpLower.body?.code}, đầu nối=${detail.body?.connectors?.length}`);
      for (const count of [0, 5]) {
        const res = await api(port, 'POST', `/stations/${stationId}/charge-points`, { cookie: ctx.adminCookie, body: { code: `R6-CNT-${count}`, connector_count: count } });
        const exists = (await q('SELECT 1 FROM charge_points WHERE code = $1', [`R6-CNT-${count}`])).rowCount;
        rec(`connector_count=${count} (ngoài khoảng 1–4) → 400 và không tạo trụ`, res.status === 400 && exists === 0, `HTTP ${res.status}, dòng DB=${exists}`);
      }
      for (const count of [1, 4]) {
        const res = await api(port, 'POST', `/stations/${stationId}/charge-points`, { cookie: ctx.adminCookie, body: { code: `R6-CNT-OK${count}`, connector_count: count } });
        const n = (await q('SELECT count(*)::int AS n FROM connectors WHERE charge_point_id = $1', [res.body?.id])).rows[0].n;
        rec(`connector_count=${count} → 201 và đúng ${count} đầu nối`, res.status === 201 && n === count, `HTTP ${res.status}, đầu nối=${n}`);
      }
      const dup = await api(port, 'POST', `/stations/${stationId}/charge-points`, { cookie: ctx.adminCookie, body: { code: 'R6-IDEM-01' } });
      rec('Mã trụ trùng → 409', dup.status === 409, `HTTP ${dup.status}`);
      const dupCase = await api(port, 'POST', `/stations/${stationId}/charge-points`, { cookie: ctx.adminCookie, body: { code: 'r6-Idem-01' } });
      rec('Mã trụ trùng khác hoa/thường → 409', dupCase.status === 409, `HTTP ${dupCase.status}`);
      for (const bad of ['bad code!', '', 'A'.repeat(51), 'trụ-1']) {
        const res = await api(port, 'POST', `/stations/${stationId}/charge-points`, { cookie: ctx.adminCookie, body: { code: bad } });
        rec(`Mã trụ sai định dạng (${short(JSON.stringify(bad), 20)}) → 400`, res.status === 400, `HTTP ${res.status}`);
      }
      const noStation = await api(port, 'POST', '/stations/99999999/charge-points', { cookie: ctx.adminCookie, body: { code: 'R6-NOSTATION' } });
      rec('Trạm không tồn tại → 404', noStation.status === 404, `HTTP ${noStation.status}`);
      const check = await api(port, 'GET', '/charge-points/check-code?code=r6-idem-01', { cookie: ctx.adminCookie });
      rec('check-code của mã đã dùng → is_available=false', check.status === 200 && check.body.is_available === false, `HTTP ${check.status}, is_available=${check.body?.is_available}`);
    });

    // ================================================= C. OCPP cơ bản
    await section('C. Boot / Heartbeat / StatusNotification', async () => {
      const port = s1.port;
      const CODE = 'R6-A-01';
      await freshCp(port, CODE, 2);

      const h1 = await handshakeStatus(port, '/ocpp/R6-KHONG-TON-TAI', ['ocpp1.6']);
      const h2 = await handshakeStatus(port, `/ocpp/${CODE}`, []);
      const h3 = await handshakeStatus(port, '/ocpp/', ['ocpp1.6']);
      const h4 = await handshakeStatus(port, '/ocpp/bad%20code!', ['ocpp1.6']);
      rec('Bắt tay: mã lạ → 403; thiếu subprotocol → 400; đường dẫn rỗng → 400; mã sai ký tự → 400',
        h1 === 403 && h2 === 400 && h3 === 400 && h4 === 400, `lạ=${h1} thiếu-sub=${h2} rỗng=${h3} sai-ký-tự=${h4}`);

      const cp = await Cp.open(port, CODE);
      const pre = await cp.call('Heartbeat', {});
      rec('Heartbeat trước Boot → CALLERROR SecurityError', !pre.ok && pre.code === 'SecurityError', `${pre.ok ? 'CALLRESULT' : pre.code}`);
      const preStatus = await cp.status(1, 'Charging');
      const sBefore = await cpState(CODE);
      rec('StatusNotification trước Boot → SecurityError, DB đầu nối không đổi', !preStatus.ok && preStatus.code === 'SecurityError' && sBefore.connectors.every((c) => c.ocpp === null), `${preStatus.code}; ${connSummary(sBefore)}`);

      const garbage = await cp.raw('không-phải-json', '');
      rec('Khung không phải JSON → CALLERROR FormationViolation, kết nối vẫn mở', !garbage.ok && garbage.code === 'FormationViolation' && cp.ws.readyState === 1, `${garbage.code}, readyState=${cp.ws.readyState}`);
      const arrayPayload = await cp.raw(JSON.stringify([2, 'frm-1', 'StatusNotification', []]), 'frm-1');
      rec('CALL có payload là mảng → FormationViolation', !arrayPayload.ok && arrayPayload.code === 'FormationViolation', `${arrayPayload.code}`);

      const longVendor = await cp.boot({ chargePointVendor: 'V'.repeat(21) });
      const afterLong = await cpState(CODE);
      rec('Boot với vendor 21 ký tự → PropertyConstraintViolation, trụ không ONLINE', !longVendor.ok && longVendor.code === 'PropertyConstraintViolation' && afterLong.status !== 'ONLINE', `${longVendor.code}; DB=${afterLong.status}`);

      const boot = await cp.boot({ chargePointSerialNumber: 'SN-KEEP', firmwareVersion: 'FW-1.0' });
      const bootState = await cpState(CODE);
      const bootDelta = Math.abs(Date.parse(boot.payload?.currentTime) - Date.now());
      rec('Boot hợp lệ → Accepted, interval=60, currentTime ISO lệch giờ máy < 2s, DB ONLINE + lưu thông tin',
        boot.ok && boot.payload.status === 'Accepted' && boot.payload.interval === 60 && bootDelta < 2000 && bootState.status === 'ONLINE'
        && bootState.vendor === 'R6Vendor' && bootState.serial_number === 'SN-KEEP' && bootState.firmware_version === 'FW-1.0',
        `${boot.payload?.status}, interval=${boot.payload?.interval}, lệch=${bootDelta}ms, DB=${bootState.status}, SN=${bootState.serial_number}, FW=${bootState.firmware_version}`);

      const hb = await cp.call('Heartbeat', {});
      const hbState = await cpState(CODE);
      const hbDelta = Math.abs(Date.parse(hb.payload?.currentTime) - Date.now());
      rec('Heartbeat → currentTime theo giờ server, last_seen_at lệch now() DB < 2s', hb.ok && hbDelta < 2000 && hbState.seen_age < 2, `lệch=${hbDelta}ms, last_seen_age=${hbState.seen_age?.toFixed(3)}s`);

      const unknownAction = await cp.call('FooBar', {});
      rec('Action không hỗ trợ → NotImplemented', !unknownAction.ok && unknownAction.code === 'NotImplemented', `${unknownAction.code}`);
      const auth = await cp.call('Authorize', { idTag: 'TAG-1' });
      rec('Authorize có idTag → Accepted', auth.ok && auth.payload.idTagInfo.status === 'Accepted', JSON.stringify(auth.payload));

      // 9 trạng thái OCPP
      const MAP = [['Available', 'AVAILABLE'], ['Preparing', 'OCCUPIED'], ['Charging', 'OCCUPIED'], ['SuspendedEV', 'OCCUPIED'], ['SuspendedEVSE', 'OCCUPIED'],
        ['Finishing', 'OCCUPIED'], ['Reserved', 'RESERVED'], ['Unavailable', 'UNAVAILABLE'], ['Faulted', 'ERROR']];
      const wrong = [];
      for (const [ocpp, internal] of MAP) {
        const res = await cp.status(1, ocpp, ocpp === 'Faulted' ? { errorCode: 'GroundFailure' } : {});
        const row = (await cpState(CODE)).connectors[0];
        if (!res.ok || Object.keys(res.payload).length !== 0 || row.status !== internal || row.ocpp !== ocpp) wrong.push(`${ocpp}→${row.status}/${row.ocpp}`);
      }
      rec('9 trạng thái OCPP → CALLRESULT {} và ánh xạ nội bộ đúng (lưu cả ocpp_status)', wrong.length === 0, wrong.length ? `sai: ${wrong.join(', ')}` : `9/9 đúng: ${MAP.map(([o, i]) => `${o}→${i}`).join(' ').slice(0, 100)}`);
      await cp.status(1, 'Unavailable');
      const f4 = (await cpState(CODE)).connectors[0];
      rec('F4: Unavailable → connectors.status=UNAVAILABLE (không còn ERROR)', f4.status === 'UNAVAILABLE' && f4.ocpp === 'Unavailable', `${f4.status}/${f4.ocpp}`);

      // trạng thái lạ
      const unknown = await cp.status(1, 'Vendor-X');
      const f5 = (await cpState(CODE)).connectors[0];
      rec('Trạng thái lạ "Vendor-X" → CALLRESULT {}, kết nối ERROR, lưu nguyên văn ở ocpp_status', unknown.ok && f5.status === 'ERROR' && f5.ocpp === 'Vendor-X', `${f5.status}/${f5.ocpp}`);
      const ctrl = await cp.status(1, 'Bad\u0001State');
      const f6 = (await cpState(CODE)).connectors[0];
      rec('Trạng thái lạ chứa ký tự điều khiển → không sập, lưu bản đã làm sạch', ctrl.ok && f6.status === 'ERROR' && f6.ocpp === 'BadState', `${f6.status}/${f6.ocpp}`);

      // payload sai & vượt giới hạn
      await cp.status(1, 'Available');
      await cp.status(2, 'Available');
      const before = connSummary(await cpState(CODE));
      const errCountBefore = (await q('SELECT count(*)::int AS n FROM connector_errors')).rows[0].n;
      const cases = [
        ['connectorId là chuỗi', { connectorId: '1', status: 'Available' }],
        ['connectorId âm', { connectorId: -1, status: 'Available' }],
        ['connectorId thập phân', { connectorId: 1.5, status: 'Available' }],
        ['connectorId 2^31', { connectorId: 2147483648, status: 'Available' }],
        ['thiếu status', { connectorId: 1 }],
        ['status rỗng', { connectorId: 1, status: '' }],
        ['status là số', { connectorId: 1, status: 5 }],
        ['status 51 ký tự', { connectorId: 1, status: 'S'.repeat(51) }],
        ['status 5000 ký tự', { connectorId: 1, status: 'S'.repeat(5000) }],
        ['errorCode 51 ký tự', { connectorId: 1, status: 'Faulted', errorCode: 'E'.repeat(51) }],
        ['errorCode 5000 ký tự', { connectorId: 1, status: 'Faulted', errorCode: 'E'.repeat(5000) }],
        ['errorCode là số', { connectorId: 1, status: 'Faulted', errorCode: 7 }],
        ['vendorErrorCode 51 ký tự', { connectorId: 1, status: 'Faulted', errorCode: 'OtherError', vendorErrorCode: 'V'.repeat(51) }],
        ['vendorErrorCode 5000 ký tự', { connectorId: 1, status: 'Faulted', errorCode: 'OtherError', vendorErrorCode: 'V'.repeat(5000) }],
        ['info 51 ký tự', { connectorId: 1, status: 'Available', info: 'I'.repeat(51) }],
        ['vendorId 51 ký tự', { connectorId: 1, status: 'Available', vendorId: 'V'.repeat(51) }],
      ];
      const notRejected = [];
      for (const [label, payload] of cases) {
        const res = await cp.call('StatusNotification', payload);
        if (res.ok || res.code !== 'PropertyConstraintViolation') notRejected.push(`${label}→${res.ok ? 'CALLRESULT' : res.code}`);
      }
      rec(`${cases.length} payload sai/vượt giới hạn (kể cả 5000 ký tự) → PropertyConstraintViolation`, notRejected.length === 0, notRejected.length ? `lọt: ${notRejected.join('; ')}` : `${cases.length}/${cases.length} bị từ chối`);
      const after = connSummary(await cpState(CODE));
      const errCountAfter = (await q('SELECT count(*)::int AS n FROM connector_errors')).rows[0].n;
      const maxLen = (await q('SELECT GREATEST(max(length(error_code)), max(length(vendor_error_code)), 0) AS m FROM connector_errors')).rows[0].m;
      const maxOcpp = (await q('SELECT COALESCE(max(length(ocpp_status)), 0) AS m FROM connectors')).rows[0].m;
      rec('Payload bị từ chối không ghi gì: đầu nối không đổi, không thêm connector_errors, mọi chuỗi lưu ≤ 50 ký tự',
        before === after && errCountBefore === errCountAfter && maxLen <= 50 && maxOcpp <= 50, `đầu nối ${before === after ? 'giữ nguyên' : 'ĐỔI'}, connector_errors ${errCountBefore}→${errCountAfter}, max len error=${maxLen}, ocpp_status=${maxOcpp}`);

      const bigInfo = await cp.call('StatusNotification', { connectorId: 1, status: 'Available', info: 'x'.repeat(60 * 1024) });
      rec('Khung ~60 KB (dưới 64 KB) vẫn được xử lý: CALLERROR vi phạm ràng buộc, kết nối vẫn mở', !bigInfo.ok && bigInfo.code === 'PropertyConstraintViolation' && cp.ws.readyState === 1, `${bigInfo.code}, readyState=${cp.ws.readyState}`);

      // đầu nối không khai báo & connectorId=0
      const nConn = (await q('SELECT count(*)::int AS n FROM connectors')).rows[0].n;
      const ghost = await cp.status(9, 'Charging');
      const nConnAfter = (await q('SELECT count(*)::int AS n FROM connectors')).rows[0].n;
      rec('Đầu nối không khai báo (connectorId=9) → CALLRESULT {}, không tạo đầu nối mới', ghost.ok && nConn === nConnAfter, `${ghost.ok ? 'CALLRESULT' : ghost.code}; đầu nối ${nConn}→${nConnAfter}`);
      const beforeZero = connSummary(await cpState(CODE));
      const errBeforeZero = (await q('SELECT count(*)::int AS n FROM connector_errors')).rows[0].n;
      const zero = await cp.status(0, 'Faulted', { errorCode: 'GroundFailure' });
      const afterZero = connSummary(await cpState(CODE));
      const errAfterZero = (await q('SELECT count(*)::int AS n FROM connector_errors')).rows[0].n;
      rec('F5: connectorId=0 → CALLRESULT {}, không lưu gì (đầu nối và connector_errors không đổi)', zero.ok && beforeZero === afterZero && errBeforeZero === errAfterZero, `${zero.ok ? 'CALLRESULT' : zero.code}; ${beforeZero === afterZero ? 'đầu nối không đổi' : 'ĐỔI'}; errors ${errBeforeZero}→${errAfterZero}`);

      // mã lỗi
      await q('DELETE FROM connector_errors');
      const CODES = ['ConnectorLockFailure', 'EVCommunicationError', 'GroundFailure', 'HighTemperature', 'InternalError', 'LocalListConflict', 'OtherError',
        'OverCurrentFailure', 'PowerMeterFailure', 'PowerSwitchFailure', 'ReaderFailure', 'ResetFailure', 'UnderVoltage', 'OverVoltage', 'WeakSignal'];
      for (const code of CODES) await cp.status(2, 'Faulted', { errorCode: code });
      const weird = await cp.status(2, 'Faulted', { errorCode: 'MyWeirdCode' });
      const stored = (await q('SELECT error_code, vendor_error_code FROM connector_errors ORDER BY id')).rows;
      const missing = CODES.filter((c) => !stored.some((r) => r.error_code === c));
      const weirdRow = stored.find((r) => r.vendor_error_code === 'MyWeirdCode');
      rec('15 mã lỗi OCPP đều được ghi; mã lạ ≤ 50 ký tự → error_code=OtherError, giữ nguyên văn ở vendor_error_code',
        missing.length === 0 && weird.ok && weirdRow?.error_code === 'OtherError', `thiếu=${missing.length}, mã lạ→${weirdRow ? `${weirdRow.error_code}/${weirdRow.vendor_error_code}` : 'không ghi'}`);
      await cp.status(2, 'Available');
      const noErrRows = (await q('SELECT count(*)::int AS n FROM connector_errors')).rows[0].n;
      rec('errorCode=NoError không tạo dòng connector_errors', noErrRows === stored.length, `${stored.length}→${noErrRows}`);

      // F1: khử trùng
      await q('DELETE FROM connector_errors');
      await cp.status(2, 'Available');
      await cp.quiet();
      const burst = await Promise.all(Array.from({ length: 30 }, () => cp.call('StatusNotification', { connectorId: 2, status: 'Faulted', errorCode: 'GroundFailure' }, { paced: false })));
      const rows30 = (await q('SELECT count(*)::int AS n FROM connector_errors')).rows[0].n;
      rec('F1: 30 tin Faulted y hệt gửi dồn trong ~1 giây → đủ 30 CALLRESULT nhưng chỉ 1 dòng connector_errors', burst.every((r) => r.ok) && rows30 === 1, `CALLRESULT=${burst.filter((r) => r.ok).length}/30, dòng=${rows30}`);
      await cp.status(2, 'Available');
      await cp.status(2, 'Faulted', { errorCode: 'GroundFailure' });
      const rows2 = (await q('SELECT count(*)::int AS n FROM connector_errors')).rows[0].n;
      rec('F1: Faulted → Available → Faulted vẫn ghi dòng mới (tổng 2)', rows2 === 2, `dòng=${rows2}`);
      await cp.status(2, 'Faulted', { errorCode: 'GroundFailure', vendorErrorCode: 'VX-1' });
      const rowsVendor = (await q('SELECT count(*)::int AS n FROM connector_errors')).rows[0].n;
      rec('F1: cùng lỗi nhưng vendorErrorCode khác → coi là lỗi mới (tổng 3)', rowsVendor === 3, `dòng=${rowsVendor}`);

      // API danh sách
      const list = await api(port, 'GET', '/charge-points', { cookie: ctx.adminCookie });
      const item = list.body?.find((c) => c.code === CODE);
      const live = (await cpState(CODE)).connectors.map((c) => c.status);
      rec('GET /api/charge-points trả connector_statuses khớp DB theo thứ tự đầu nối', list.status === 200 && Array.isArray(item?.connector_statuses) && JSON.stringify(item.connector_statuses) === JSON.stringify(live),
        `API=${JSON.stringify(item?.connector_statuses)} DB=${JSON.stringify(live)}`);

      await cp.closeGracefully();
    });

    // ================================================= D. N8
    await section('D. N8: Boot giữ serial/firmware cũ', async () => {
      const port = s1.port;
      const CODE = 'R6-N8-01';
      await freshCp(port, CODE, 1);
      const cp = await Cp.open(port, CODE);
      await cp.boot({ chargePointSerialNumber: 'SN-KEEP', firmwareVersion: 'FW-OLD' });
      const b2 = await cp.call('BootNotification', { chargePointVendor: 'R6Vendor2', chargePointModel: 'R6Model2' });
      const s2state = await cpState(CODE);
      rec('Boot lần 2 thiếu serial/firmware → giữ SN-KEEP/FW-OLD; vendor/model được cập nhật',
        b2.ok && s2state.serial_number === 'SN-KEEP' && s2state.firmware_version === 'FW-OLD' && s2state.vendor === 'R6Vendor2' && s2state.model === 'R6Model2',
        `SN=${s2state.serial_number} FW=${s2state.firmware_version} vendor=${s2state.vendor} model=${s2state.model}`);
      await cp.call('BootNotification', { chargePointVendor: 'R6Vendor2', chargePointModel: 'R6Model2', chargePointSerialNumber: '', firmwareVersion: '' });
      const s3 = await cpState(CODE);
      rec('Boot lần 3 gửi chuỗi rỗng → vẫn giữ giá trị cũ', s3.serial_number === 'SN-KEEP' && s3.firmware_version === 'FW-OLD', `SN=${s3.serial_number} FW=${s3.firmware_version}`);
      await cp.call('BootNotification', { chargePointVendor: 'R6Vendor2', chargePointModel: 'R6Model2', chargePointSerialNumber: 'SN-NEW', firmwareVersion: 'FW-NEW' });
      const s4 = await cpState(CODE);
      rec('Boot lần 4 có giá trị mới → ghi đè', s4.serial_number === 'SN-NEW' && s4.firmware_version === 'FW-NEW', `SN=${s4.serial_number} FW=${s4.firmware_version}`);
      await cp.closeGracefully();
    });

    // ================================================= E. F3, B8, S-13
    await section('E. F3 (đầu nối UNKNOWN khi trụ offline), B8, S-13', async () => {
      const port = s1.port;
      const CODE = 'R6-F3-01';
      await freshCp(port, CODE, 2);
      let cp = await onlineCp(port, CODE);
      await cp.status(1, 'Charging');
      await cp.status(2, 'Available');
      const closed = await cp.closeGracefully();
      const gone = await waitStatus(CODE, 'UNKNOWN', 3000);
      const f3 = await cpState(CODE);
      rec('F3: ngắt kết nối bình thường → trụ UNKNOWN, mọi đầu nối UNKNOWN, ocpp_status cuối được giữ',
        gone && f3.connectors.every((c) => c.status === 'UNKNOWN') && f3.connectors[0].ocpp === 'Charging' && f3.connectors[1].ocpp === 'Available', `close=${closed.code}; ${f3.status}; ${connSummary(f3)}`);
      const list = await api(port, 'GET', '/charge-points', { cookie: ctx.adminCookie });
      const item = list.body.find((c) => c.code === CODE);
      rec('API danh sách sau khi offline: status=UNKNOWN và connector_statuses toàn UNKNOWN (giao diện không báo "Bận")', item?.status === 'UNKNOWN' && item.connector_statuses.every((s) => s === 'UNKNOWN'), `${item?.status} ${JSON.stringify(item?.connector_statuses)}`);

      cp = await onlineCp(port, CODE);
      const afterBoot = await cpState(CODE);
      rec('Boot lại → ONLINE, đầu nối vẫn UNKNOWN cho tới khi có StatusNotification', afterBoot.status === 'ONLINE' && afterBoot.connectors.every((c) => c.status === 'UNKNOWN'), `${afterBoot.status}; ${connSummary(afterBoot)}`);
      await cp.status(1, 'Preparing');
      const afterStatus = await cpState(CODE);
      rec('StatusNotification sau Boot cập nhật bình thường (đầu nối 1 → OCCUPIED, đầu nối 2 còn UNKNOWN)', afterStatus.connectors[0].status === 'OCCUPIED' && afterStatus.connectors[1].status === 'UNKNOWN', connSummary(afterStatus));

      // B8: ngắt đột ngột
      cp.ws.terminate();
      const dead = await waitStatus(CODE, 'UNKNOWN', 3000);
      rec('B8: ngắt TCP đột ngột (1006) → trụ về UNKNOWN trong ≤ 3s', Boolean(dead), dead ? `sau ${dead.ms}ms` : 'quá hạn');

      // S-13: kết nối thay thế
      const R = 'R6-S13-01';
      await freshCp(port, R, 2);
      const conn1 = await onlineCp(port, R);
      await conn1.status(1, 'Charging');
      const conn2 = await Cp.open(port, R);
      const close1 = await Promise.race([conn1.closedPromise, sleep(4000).then(() => null)]);
      const boot2 = await conn2.boot();
      await sleep(2000);
      const s13 = await cpState(R);
      const hb = await conn2.call('Heartbeat', {});
      rec('S-13: kết nối thứ 2 thay thế → kết nối cũ nhận close 1000; DB vẫn ONLINE, đầu nối giữ OCCUPIED/Charging; kết nối mới hoạt động',
        close1?.code === 1000 && boot2.ok && s13.status === 'ONLINE' && s13.connectors[0].status === 'OCCUPIED' && s13.connectors[0].ocpp === 'Charging' && hb.ok,
        `close cũ=${close1?.code}; ${s13.status}; ${connSummary(s13)}; heartbeat=${hb.ok}`);
      await conn2.closeGracefully();
      const afterReplaced = await waitStatus(R, 'UNKNOWN', 3000);
      rec('S-13: đóng kết nối hiện hành → trụ UNKNOWN', Boolean(afterReplaced), afterReplaced ? `sau ${afterReplaced.ms}ms` : 'không về UNKNOWN');

      // S-13 với kết nối cũ bị treo
      const H = 'R6-S13-02';
      await freshCp(port, H, 2);
      const old = await onlineCp(port, H);
      await old.status(1, 'Charging');
      old.ws._socket.pause();
      const fresh = await Cp.open(port, H);
      await fresh.boot();
      await sleep(3500);
      const hung = await cpState(H);
      rec('S-13 (kết nối cũ treo): sau khi server terminate kết nối cũ, DB vẫn ONLINE và đầu nối không bị đưa về UNKNOWN',
        hung.status === 'ONLINE' && hung.connectors[0].status === 'OCCUPIED', `${hung.status}; ${connSummary(hung)}`);
      old.ws.terminate();
      await fresh.closeGracefully();
    });

    // ================================================= F. N2
    await section('F. N2: khoá / mở khoá trạm, trụ treo, race', async () => {
      const port = s1.port;
      const CODE = 'R6-N2-01';
      const { stationId } = await freshCp(port, CODE, 2);
      let cp = await onlineCp(port, CODE);
      await cp.status(1, 'Charging');
      await cp.status(2, 'Available');
      const lock = await lockStation(port, stationId, true);
      const closed = await Promise.race([cp.closedPromise, sleep(4000).then(() => null)]);
      const afterLock = await waitStatus(CODE, 'UNKNOWN', 3000);
      const lockedState = await cpState(CODE);
      rec('Khoá trạm → API 200, trụ nhận close 1008 "Station locked", DB UNKNOWN, đầu nối UNKNOWN (ocpp_status giữ)',
        lock.status === 200 && closed?.code === 1008 && closed.reason === 'Station locked' && afterLock && lockedState.connectors.every((c) => c.status === 'UNKNOWN') && lockedState.connectors[0].ocpp === 'Charging',
        `API ${lock.status}; close=${closed?.code}/${closed?.reason}; ${lockedState.status}; ${connSummary(lockedState)}`);

      cp = await Cp.open(port, CODE);
      const rejected = await cp.boot();
      const rej = await cpState(CODE);
      const hbAfter = await cp.call('Heartbeat', {});
      rec('Trụ nối lại khi trạm còn khoá → Boot bị Rejected, DB không ONLINE, Heartbeat sau đó bị SecurityError',
        rejected.ok && rejected.payload.status === 'Rejected' && rej.status !== 'ONLINE' && !hbAfter.ok && hbAfter.code === 'SecurityError', `${rejected.payload?.status}; DB=${rej.status}; heartbeat=${hbAfter.ok ? 'CALLRESULT' : hbAfter.code}`);
      await cp.closeGracefully();

      const lockAgain = await lockStation(port, stationId, true);
      rec('Khoá lần 2 (trụ không còn kết nối) → 200, idempotent', lockAgain.status === 200, `HTTP ${lockAgain.status}`);
      const unlock = await lockStation(port, stationId, false);
      cp = await Cp.open(port, CODE);
      const accepted = await cp.boot();
      const onl = await cpState(CODE);
      rec('Mở khoá → 200, trụ kết nối lại và Boot Accepted → ONLINE', unlock.status === 200 && accepted.payload?.status === 'Accepted' && onl.status === 'ONLINE', `unlock ${unlock.status}; ${accepted.payload?.status}; DB=${onl.status}`);
      await cp.closeGracefully();

      const opLock = await api(port, 'PATCH', `/admin/stations/${stationId}/lock`, { cookie: ctx.users.operator.cookie, body: { locked: true } });
      const ownerLock = await api(port, 'PATCH', `/admin/stations/${stationId}/lock`, { cookie: ctx.users.owner1.cookie, body: { locked: true } });
      rec('Chỉ ADMIN được khoá trạm: OPERATOR và STATION_OWNER → 403', opLock.status === 403 && ownerLock.status === 403, `operator ${opLock.status}, owner ${ownerLock.status}`);

      // F6: trụ treo
      const HUNG = 'R6-HUNG-01';
      const hungStation = (await freshCp(port, HUNG, 2)).stationId;
      const hung = await onlineCp(port, HUNG);
      await hung.status(1, 'Charging');
      hung.ws._socket.pause();
      const t0 = Date.now();
      const hungLock = await lockStation(port, hungStation, true);
      const reached = await waitStatus(HUNG, 'UNKNOWN', 8000);
      const elapsed = Date.now() - t0;
      const hungState = await cpState(HUNG);
      rec('F6: trụ treo (không đọc socket, không trả close frame) → DB về UNKNOWN trong ≤ 3s sau khi khoá (trước vá ≈ 30,5s)',
        hungLock.status === 200 && reached && elapsed <= 3000 && hungState.connectors.every((c) => c.status === 'UNKNOWN'), `API ${hungLock.status}; UNKNOWN sau ${elapsed}ms; ${connSummary(hungState)}`);
      hung.ws.terminate();

      // race khi đang bơm tin
      const outcomes = [];
      for (let round = 0; round < 6; round += 1) {
        const code = `R6-RACE-0${round}`;
        const { stationId: raceStation } = await freshCp(port, code, 2);
        const racer = await onlineCp(port, code);
        let stop = false;
        let sent = 0;
        const pump = (async () => {
          while (!stop && racer.ws.readyState === 1) {
            const k = sent % 4;
            if (k === 0) racer.fire('Heartbeat', {});
            else racer.fire('StatusNotification', { connectorId: 1 + (sent % 2), status: k === 1 ? 'Charging' : k === 2 ? 'Available' : 'Preparing', errorCode: 'NoError' });
            sent += 1;
            await sleep(25);
          }
        })();
        await sleep(150 + Math.floor(Math.random() * 350));
        const lockRes = await lockStation(port, raceStation, true);
        const closedRace = await Promise.race([racer.closedPromise, sleep(4000).then(() => null)]);
        stop = true;
        await pump;
        await sleep(1200);
        const state = await cpState(code);
        const later = await sleep(800).then(() => cpState(code));
        const consistent = state.status === 'UNKNOWN' && state.connectors.every((c) => c.status === 'UNKNOWN') && JSON.stringify({ ...state, seen_age: 0 }) === JSON.stringify({ ...later, seen_age: 0 });
        outcomes.push({ round, lock: lockRes.status, close: closedRace?.code, consistent, snapshot: `${state.status} ${connSummary(state)}` });
      }
      const bad = outcomes.filter((o) => o.lock !== 200 || o.close !== 1008 || !o.consistent);
      rec('Race: khoá trạm khi trụ đang gửi ~40 tin/giây (6 vòng) → luôn close 1008, DB cuối cùng UNKNOWN và đầu nối UNKNOWN, ổn định sau 2s',
        bad.length === 0, bad.length ? `${bad.length}/6 vòng lệch: ${bad.map((o) => `#${o.round}: lock=${o.lock} close=${o.close} ${o.snapshot}`).join(' | ')}` : `6/6 vòng nhất quán (đã gửi ~${outcomes.length * 20}+ tin mỗi vòng)`);
    });

    // ================================================= G. B2 / B3
    await section('G. B2 khung lớn, B3 tràn tần suất', async () => {
      const port = s1.port;
      const big = 'R6-B2-01';
      await freshCp(port, big, 1);
      let cp = await onlineCp(port, big);
      cp.ws.send('x'.repeat(70 * 1024));
      const closedBig = await Promise.race([cp.closedPromise, sleep(4000).then(() => null)]);
      const bigDown = await waitStatus(big, 'UNKNOWN', 3000);
      rec('B2: khung 70 KB (> 64 KB) → server đóng 1009, DB UNKNOWN', closedBig?.code === 1009 && Boolean(bigDown), `close=${closedBig?.code}; DB UNKNOWN sau ${bigDown?.ms ?? '∞'}ms`);

      const rate = 'R6-B3-01';
      await freshCp(port, rate, 1);
      cp = await onlineCp(port, rate);
      for (let i = 0; i < 120; i += 1) cp.fire('Heartbeat', {});
      const closedRate = await Promise.race([cp.closedPromise, sleep(4000).then(() => null)]);
      const rateDown = await waitStatus(rate, 'UNKNOWN', 3000);
      rec('B3: 120 Heartbeat trong < 1s (giới hạn 50/s) → đóng 1008 "Rate limit", DB UNKNOWN', closedRate?.code === 1008 && /Rate limit/.test(closedRate.reason) && Boolean(rateDown), `close=${closedRate?.code}/${closedRate?.reason}; DB UNKNOWN sau ${rateDown?.ms ?? '∞'}ms`);
      cp = await onlineCp(port, rate);
      const again = await cpState(rate);
      rec('B3: sau khi bị đóng vì tràn tần suất, kết nối lại + Boot vẫn được → ONLINE', again.status === 'ONLINE', again.status);
      let open = true;
      for (let i = 0; i < 40 && open; i += 1) { cp.fire('Heartbeat', {}); await sleep(50); open = cp.ws.readyState === 1; }
      rec('B3: tốc độ ~20 tin/giây trong 2s (dưới giới hạn) → không bị đóng', open && !cp.closed, `readyState=${cp.ws.readyState}`);
      await cp.closeGracefully();
    });

    // ================================================= H. N4
    await section('H. N4: tắt máy sạch & dọn trụ mồ côi', async () => {
      const A = 'R6-N4-A';
      const B = 'R6-N4-B';
      await freshCp(s1.port, A, 2);
      await freshCp(s1.port, B, 2);
      const cpA = await onlineCp(s1.port, A);
      const cpB = await onlineCp(s1.port, B);
      await cpA.status(1, 'Charging');
      await cpA.status(2, 'Available');
      await cpB.status(1, 'Faulted', { errorCode: 'GroundFailure' });
      const onlineBefore = (await cpState(A)).status === 'ONLINE' && (await cpState(B)).status === 'ONLINE';
      const t0 = Date.now();
      s1.child.kill('SIGTERM');
      await sleep(100);
      s1.child.kill('SIGINT');
      const exit = await Promise.race([s1.exited, sleep(12000).then(() => null)]);
      const ms = Date.now() - t0;
      const [closeA, closeB] = await Promise.all([cpA.closedPromise, cpB.closedPromise]);
      const sa = await cpState(A);
      const sb = await cpState(B);
      rec('SIGTERM rồi SIGINT liền sau (idempotent) → tiến trình thoát mã 0 trong ≤ 8s', onlineBefore && exit?.code === 0 && exit.signal === null && ms <= 8000, `exit=${JSON.stringify(exit)} sau ${ms}ms`);
      rec('Mọi trụ nhận close 1001 "Server shutting down" (không phải 1006)', closeA.code === 1001 && closeB.code === 1001 && closeA.reason === 'Server shutting down', `A=${closeA.code}/${closeA.reason}; B=${closeB.code}`);
      rec('Sau tắt máy: DB trụ UNKNOWN, đầu nối UNKNOWN, ocpp_status cuối được giữ', sa.status === 'UNKNOWN' && sb.status === 'UNKNOWN' && sa.connectors.every((c) => c.status === 'UNKNOWN') && sa.connectors[0].ocpp === 'Charging' && sb.connectors[0].ocpp === 'Faulted',
        `A: ${sa.status} ${connSummary(sa)} | B: ${sb.status} ${connSummary(sb)}`);
      rec('Sau tắt máy: cổng HTTP đã đóng, không còn lỗi/stack trong log server', await portRefuses(s1.port) && !/\n\s+at .*\.js:\d+|UnhandledPromiseRejection|TypeError|ReferenceError/.test(s1.output), `cổng đóng=${await portRefuses(s1.port)}; stack=${/\n\s+at .*\.js:\d+/.test(s1.output) ? 'có' : 'không'}`);

      // dữ liệu mồ côi khi khởi động
      await q("UPDATE charge_points SET status = 'ONLINE' WHERE code = ANY($1)", [[A, B]]);
      await q("UPDATE connectors SET status = 'AVAILABLE' WHERE charge_point_id IN (SELECT id FROM charge_points WHERE code = ANY($1))", [[A, B]]);
      s1 = await startServer();
      const swept = await Promise.all([cpState(A), cpState(B)]);
      rec('Khởi động với 2 trụ ONLINE mồ côi → dọn xong trước khi mở cổng: trụ và đầu nối UNKNOWN, ocpp_status giữ, log có dòng "Dọn khi khởi động"',
        swept.every((s) => s.status === 'UNKNOWN' && s.connectors.every((c) => c.status === 'UNKNOWN')) && swept[0].connectors[0].ocpp === 'Charging' && /Dọn khi khởi động: 2 trụ/.test(s1.output),
        `${swept.map((s) => `${s.status}[${s.connectors.map((c) => c.status).join(',')}]`).join(' | ')}; log=${/Dọn khi khởi động: (\d+) trụ/.exec(s1.output)?.[0] ?? 'không có'}`);

      // tắt đột ngột (SIGKILL)
      const K = 'R6-N4-K';
      await freshCp(s1.port, K, 2);
      const cpK = await onlineCp(s1.port, K);
      await cpK.status(1, 'Charging');
      s1.child.kill('SIGKILL');
      await s1.exited;
      const closeK = await Promise.race([cpK.closedPromise, sleep(4000).then(() => null)]);
      const orphan = await cpState(K);
      rec('SIGKILL (không kịp dọn): client thấy 1006 và DB còn ONLINE mồ côi (hành vi đã biết, được dọn ở lần khởi động kế)', closeK?.code === 1006 && orphan.status === 'ONLINE', `close=${closeK?.code}; DB=${orphan.status}`);
      s1 = await startServer();
      const cleaned = await cpState(K);
      rec('Khởi động lại sau SIGKILL → trụ mồ côi về UNKNOWN, đầu nối UNKNOWN', cleaned.status === 'UNKNOWN' && cleaned.connectors.every((c) => c.status === 'UNKNOWN') && cleaned.connectors[0].ocpp === 'Charging', `${cleaned.status}; ${connSummary(cleaned)}`);
      const back = await onlineCp(s1.port, K);
      rec('Trụ mồ côi kết nối lại, Boot Accepted → ONLINE', (await cpState(K)).status === 'ONLINE', (await cpState(K)).status);
      await back.closeGracefully();
      const exitFinal = await stopServer(s1, 'SIGTERM');
      rec('Tắt server bằng SIGTERM khi không còn kết nối → mã 0', exitFinal?.code === 0, JSON.stringify(exitFinal));
    });

    // ================================================= I. B9 (server riêng ping 1s)
    await section('I. B9: ping/pong (OCPP_PING_INTERVAL=1)', async () => {
      s2 = await startServer({ OCPP_PING_INTERVAL: '1' });
      const port = s2.port;
      const ok = 'R6-B9-OK';
      await freshCp(port, ok, 1);
      const alive = await onlineCp(port, ok);
      await sleep(4500);
      const aliveState = await cpState(ok);
      rec('B9: trụ trả pong tự động ở chu kỳ 1s → sống qua 4,5s, nhận ≥ 3 ping, DB vẫn ONLINE', alive.ws.readyState === 1 && alive.pings >= 3 && aliveState.status === 'ONLINE', `readyState=${alive.ws.readyState}, ping=${alive.pings}, DB=${aliveState.status}`);
      await alive.closeGracefully();

      const dead = 'R6-B9-DEAD';
      await freshCp(port, dead, 1);
      const mute = await Cp.open(port, dead, { wsOptions: { autoPong: false } });
      await mute.boot();
      const t0 = Date.now();
      const closedMute = await Promise.race([mute.closedPromise, sleep(8000).then(() => null)]);
      const closeMs = Date.now() - t0;
      const muteDown = await waitStatus(dead, 'UNKNOWN', 3000);
      rec('B9: trụ ngừng trả pong → server terminate trong ≤ 2×chu kỳ + sai số (≤ 3,5s) và DB UNKNOWN', Boolean(closedMute) && closeMs <= 3500 && Boolean(muteDown), `đóng sau ${closeMs}ms (close=${closedMute?.code}); DB UNKNOWN +${muteDown?.ms ?? '∞'}ms`);
      const back = await onlineCp(port, dead);
      rec('B9: trụ kết nối lại + Boot → ONLINE', (await cpState(dead)).status === 'ONLINE', (await cpState(dead)).status);
      await back.closeGracefully();
      const exit2 = await stopServer(s2, 'SIGTERM');
      rec('Tắt server thứ hai bằng SIGTERM → mã 0', exit2?.code === 0, JSON.stringify(exit2));
    });

    // ================================================= J. rò rỉ
    await section('J. Rò rỉ thông tin', async () => {
      const outputs = allServerOutput.join('\n');
      const secrets = [ADMIN_PASSWORD, JWT_SECRET, ...Object.values(ctx.users || {}).map((u) => u.cookie).filter(Boolean)];
      rec('Log hai server không chứa mật khẩu admin, JWT_SECRET hay cookie phiên', !secrets.some((s) => s && outputs.includes(s)), `quét ${outputs.length} byte log`);
      rec('Log server không có stack trace / unhandledRejection', !/UnhandledPromiseRejection|unhandledRejection|\n\s+at .*\.js:\d+/.test(outputs), 'quét log');
      const leaky = allCallErrors.filter((f) => /postgres|relation |password|ECONN|column |SELECT |INSERT |node_modules|\.js:\d+/i.test(f));
      rec(`Không CALLERROR nào (tổng ${allCallErrors.length}) lộ chi tiết Postgres/đường dẫn/mật khẩu`, leaky.length === 0, leaky.length ? short(leaky[0]) : 'sạch');
    });
  } finally {
    await stopServer(s1, 'SIGKILL', 3000).catch(() => {});
    if (s2) await stopServer(s2, 'SIGKILL', 3000).catch(() => {});
    await db.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch((error) => console.error(`Không DROP được ${DB_NAME}: ${error.message}`));
    await admin.end().catch(() => {});
  }

  // ------------------------------------------------ bảng kết quả
  const failed = results.filter((r) => !r.ok);
  const lines = [];
  lines.push(`| # | Khu vực | Kỳ vọng | Quan sát | KQ |`);
  lines.push('|---|---|---|---|---|');
  for (const r of results) lines.push(`| ${r.n} | ${r.area.split('.')[0]} | ${r.expect.replace(/\|/g, '/')} | ${short(r.observed, 160).replace(/\|/g, '/')} | ${r.ok ? 'ok' : 'FAIL'} |`);
  const summary = `Tổng ${results.length} dòng: ${results.length - failed.length} ok, ${failed.length} FAIL | ${((Date.now() - startedAt) / 1000).toFixed(1)}s | Node ${process.version} | DB ${DB_NAME} (đã DROP)`;

  console.log('\n================ KẾT QUẢ ================');
  for (const r of results) console.log(`${String(r.n).padStart(3)} [${r.ok ? ' ok ' : 'FAIL'}] (${r.area.split('.')[0]}) ${short(r.expect, 120)}\n          → ${short(r.observed, 150)}`);
  console.log(`\n${summary}`);
  if (process.env.VERIFY_REPORT) {
    fs.writeFileSync(process.env.VERIFY_REPORT, `# Kết quả verify-round6-live\n\n${summary}\n\n${lines.join('\n')}\n`);
    console.log(`Đã ghi bảng kết quả: ${process.env.VERIFY_REPORT}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`Script dừng vì lỗi: ${error.stack || error.message}`);
  process.exit(3);
});
