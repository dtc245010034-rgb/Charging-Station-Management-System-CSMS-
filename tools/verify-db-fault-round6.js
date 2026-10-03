#!/usr/bin/env node
/*
 * Kiểm chứng B7/N1 trên server thật khi DB gặp lỗi có kiểm soát (CLAUDE.md mục 4.3).
 *
 * An toàn: chỉ làm việc trên DB mới tên kết thúc _chk (mặc định csms_r6fault_chk), tạo mới rồi DROP khi xong.
 * Không có mật khẩu nào được in; không cần tài khoản admin (trụ ảo và dữ liệu được tạo thẳng bằng SQL).
 *
 * Biến môi trường:
 *   CHK_ADMIN_DATABASE_URL  URL Postgres tới máy chủ test (cùng thông tin đăng nhập, DB bất kỳ). Bắt buộc.
 *   CHK_DB_NAME             tên DB thử, phải kết thúc _chk (mặc định csms_r6fault_chk).
 *   CSMS_BACKEND_DIR        thư mục backend cần thử (mặc định ../backend), dùng để thử trên nhánh/worktree khác.
 *
 * Chạy: node tools/verify-db-fault-round6.js   (Node >= 22)
 */
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const backendDir = path.resolve(process.env.CSMS_BACKEND_DIR || path.join(__dirname, '..', 'backend'));
const backendRequire = createRequire(path.join(backendDir, 'package.json'));
const { WebSocket } = backendRequire('ws');
const { Client } = backendRequire('pg');

const DB_NAME = process.env.CHK_DB_NAME || 'csms_r6fault_chk';
const APP_NAME = 'csms-r6-fault';
const adminUrl = process.env.CHK_ADMIN_DATABASE_URL;
if (!adminUrl) { console.error('Thiếu CHK_ADMIN_DATABASE_URL'); process.exit(2); }
if (!DB_NAME.endsWith('_chk') || DB_NAME === 'csms_test') { console.error('CHK_DB_NAME phải kết thúc _chk'); process.exit(2); }

const base = new URL(adminUrl);
if (base.port === '5432' || base.port === '3000') { console.error('Từ chối: cổng 5432 là DB của docker compose, không dùng cho kịch bản phá hoại'); process.exit(2); }
const secrets = [base.password].filter(Boolean);
const urlFor = (dbname, search = '') => {
  const url = new URL(adminUrl);
  url.pathname = `/${dbname}`;
  url.search = `?application_name=${APP_NAME}${search}`;
  return url.toString();
};
const adminDbUrl = (dbname) => { const url = new URL(adminUrl); url.pathname = `/${dbname}`; url.search = ''; return url.toString(); };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
}
const ms = (value) => `${Math.round(value)} ms`;
const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

async function sql(dbname, text, params) {
  const client = new Client({ connectionString: adminDbUrl(dbname), application_name: 'csms-r6-admin' });
  await client.connect();
  try { return await client.query(text, params); } finally { await client.end(); }
}

async function freePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function startServer(search = '') {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: backendDir,
    env: {
      PATH: process.env.PATH,
      CSMS_SKIP_DOTENV: '1',
      DATABASE_URL: urlFor(DB_NAME, search),
      JWT_SECRET: crypto.randomBytes(32).toString('hex'),
      APP_ORIGIN: 'http://localhost:3000',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.output = '';
  child.stdout.on('data', (chunk) => { child.output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { child.output += chunk.toString(); });
  const deadline = Date.now() + 30000;
  for (;;) {
    if (child.exitCode !== null) throw new Error('Server thoát sớm');
    if (Date.now() > deadline) throw new Error('Server không sẵn sàng');
    const status = await new Promise((resolve) => {
      const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => { response.resume(); resolve(response.statusCode); });
      request.setTimeout(1000, () => request.destroy());
      request.on('error', () => resolve(0));
    });
    if (status === 200) break;
    await sleep(100);
  }
  return { port, child };
}

async function stopServer(server) {
  if (!server || server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  await Promise.race([once(server.child, 'exit'), sleep(8000)]);
  if (server.child.exitCode === null) server.child.kill('SIGKILL');
}

async function connectCp(server, code) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ocpp/${code}`, 'ocpp1.6');
  ws.closeCode = null;
  ws.on('close', (closeCode) => { ws.closeCode = closeCode; });
  ws.on('error', () => {});
  await once(ws, 'open');
  return ws;
}

function call(ws, action, payload = {}, { timeoutMs = 25000, messageId = crypto.randomUUID() } = {}) {
  const started = performance.now();
  return new Promise((resolve) => {
    const done = (value) => { clearTimeout(timer); ws.off('message', onMessage); ws.off('close', onClose); resolve({ ms: performance.now() - started, ...value }); };
    const onMessage = (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[1] === messageId) done({ frame, raw: raw.toString() });
    };
    const onClose = (closeCode) => done({ closed: closeCode });
    const timer = setTimeout(() => done({ timedOut: true }), timeoutMs);
    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.send(JSON.stringify([2, messageId, action, payload]));
  });
}

const boot = (ws, extra = {}) => call(ws, 'BootNotification', { chargePointVendor: 'R6', chargePointModel: 'Fault', ...extra });
const kind = (res) => (res.timedOut ? 'timeout' : res.closed !== undefined ? `closed ${res.closed}` : res.frame[0] === 3 ? 'CALLRESULT' : `CALLERROR ${res.frame[2]}`);
const isInternalError = (res) => res.frame?.[0] === 4 && res.frame[2] === 'InternalError' && res.frame[3] === 'Internal error';
const bootStatus = (res) => (res.frame?.[0] === 3 ? res.frame[2].status : null);

async function terminateAppBackends() {
  const result = await sql(DB_NAME, "SELECT count(pg_terminate_backend(pid))::int AS killed FROM pg_stat_activity WHERE datname = $1 AND application_name = $2 AND pid <> pg_backend_pid()", [DB_NAME, APP_NAME]);
  return result.rows[0].killed;
}

async function seed(codes) {
  const owner = (await sql(DB_NAME, "INSERT INTO users (name, email, password_hash) VALUES ('R6 fault', 'r6-fault@test.invalid', 'khong-dung-de-dang-nhap') RETURNING id")).rows[0].id;
  const station = (await sql(DB_NAME, "INSERT INTO stations (name, address, owner_id) VALUES ('R6 fault station', 'DB thu _chk', $1) RETURNING id", [owner])).rows[0].id;
  for (const code of codes) {
    const cp = (await sql(DB_NAME, 'INSERT INTO charge_points (station_id, code, power_kw) VALUES ($1, $2, 22) RETURNING id', [station, code])).rows[0].id;
    await sql(DB_NAME, 'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1)', [cp]);
  }
}

const cpState = async (code) => (await sql(DB_NAME,
  `SELECT cp.status, cp.last_seen_at, c.ocpp_status
     FROM charge_points cp LEFT JOIN connectors c ON c.charge_point_id = cp.id AND c.connector_no = 1
    WHERE cp.code = $1`, [code])).rows[0];

function scanLogs(output, tag) {
  const leaked = secrets.some((secret) => output.includes(secret)) || /postgres(ql)?:\/\//i.test(output);
  check(`${tag}: log không chứa mật khẩu/URL kết nối`, !leaked);
  check(`${tag}: log không chứa ký tự điều khiển ESC`, !output.includes('\u001b'));
  check(`${tag}: messageId chứa xuống dòng không tách được dòng log giả`, !/^FAKE-LOG/m.test(output));
}

async function scenarioKillConnections(server) {
  console.log('\n--- (a) pg_terminate_backend toàn bộ kết nối của ứng dụng ---');
  const code = 'CP-R6-A';
  const ws = await connectCp(server, code);
  const first = await boot(ws);
  check('(a) Boot ban đầu Accepted', bootStatus(first) === 'Accepted', ms(first.ms));
  let internalErrors = 0;
  let statusRound = 0;
  for (let round = 1; round <= 5; round += 1) {
    const killed = await terminateAppBackends();
    const heartbeat = await call(ws, 'Heartbeat');
    check(`(a) vòng ${round}: Heartbeat ngay sau khi giết ${killed} kết nối vẫn được trả lời CALLRESULT`, heartbeat.frame?.[0] === 3, `${kind(heartbeat)} ${ms(heartbeat.ms)}`);
    await terminateAppBackends();
    const status = await call(ws, 'StatusNotification', { connectorId: 1, status: round % 2 ? 'Preparing' : 'Charging', errorCode: 'NoError' });
    statusRound = round;
    const dbRow = await cpState(code);
    const expected = round % 2 ? 'Preparing' : 'Charging';
    if (status.frame?.[0] === 3) check(`(a) vòng ${round}: StatusNotification CALLRESULT thì DB phải có ghi nhận thật`, dbRow.ocpp_status === expected, `${ms(status.ms)} ocpp_status=${dbRow.ocpp_status}`);
    else { internalErrors += 1; check(`(a) vòng ${round}: StatusNotification lỗi phải là InternalError 'Internal error'`, isInternalError(status), `${kind(status)} ${ms(status.ms)}`); }
    await terminateAppBackends();
    const rebooted = await boot(ws, { firmwareVersion: `fw-${round}` });
    if (rebooted.frame?.[0] === 3) check(`(a) vòng ${round}: Boot Accepted thì DB phải có ghi nhận thật`, bootStatus(rebooted) === 'Accepted', ms(rebooted.ms));
    else { internalErrors += 1; check(`(a) vòng ${round}: Boot lỗi phải là InternalError 'Internal error'`, isInternalError(rebooted), `${kind(rebooted)} ${ms(rebooted.ms)}`); }
    check(`(a) vòng ${round}: WebSocket không bị đóng vì lỗi DB`, ws.readyState === WebSocket.OPEN && ws.closeCode === null);
  }
  const after = await boot(ws);
  check('(a) sau đợt giết kết nối, Boot kế tiếp Accepted', bootStatus(after) === 'Accepted', ms(after.ms));
  console.log(`    (ghi chú: ${internalErrors}/${statusRound * 2} lệnh ghi DB rơi vào cửa sổ kết nối chết và trả InternalError, phần còn lại pool tự mở lại kết nối)`);
  ws.close();
}

async function scenarioRename(server) {
  console.log('\n--- (b) đổi tên tạm bảng/cột rồi khôi phục ---');
  const code = 'CP-R6-B';
  const ws = await connectCp(server, code);
  const first = await boot(ws);
  check('(b) Boot ban đầu Accepted', bootStatus(first) === 'Accepted', ms(first.ms));
  const hostileId = 'x"\n[FAKE-LOG]\nFAKE-LOG forged\u001b[31m';

  const faults = [
    ['bảng charge_points', 'ALTER TABLE charge_points RENAME TO charge_points_r6_tmp', 'ALTER TABLE charge_points_r6_tmp RENAME TO charge_points'],
    ['cột connectors.ocpp_status', 'ALTER TABLE connectors RENAME COLUMN ocpp_status TO ocpp_status_r6_tmp', 'ALTER TABLE connectors RENAME COLUMN ocpp_status_r6_tmp TO ocpp_status'],
  ];
  for (const [label, breakSql, restoreSql] of faults) {
    await sql(DB_NAME, breakSql);
    try {
      const heartbeat = await call(ws, 'Heartbeat');
      check(`(b) ${label}: Heartbeat vẫn CALLRESULT`, heartbeat.frame?.[0] === 3, ms(heartbeat.ms));
      const bootRes = await boot(ws);
      const status = await call(ws, 'StatusNotification', { connectorId: 1, status: 'Faulted', errorCode: 'GroundFailure' }, { messageId: hostileId });
      for (const [action, res] of [['Boot', bootRes], ['StatusNotification', status]]) {
        const body = res.raw || '';
        if (label === 'bảng charge_points' || action === 'StatusNotification') {
          check(`(b) ${label}: ${action} trả CALLERROR InternalError, không bao giờ Accepted/CALLRESULT`, isInternalError(res), `${kind(res)} ${ms(res.ms)}`);
          check(`(b) ${label}: ${action} không lộ nội dung lỗi Postgres/tên bảng/đường dẫn`, !/relation|column|charge_points|connectors|ocpp_status|42P01|42703|postgres|\/home|node_modules|password/i.test(body.replace(hostileId, '')), body.slice(0, 80));
        }
      }
      check(`(b) ${label}: WebSocket vẫn mở`, ws.readyState === WebSocket.OPEN && ws.closeCode === null);
    } finally {
      await sql(DB_NAME, restoreSql);
    }
    const recovered = await boot(ws);
    check(`(b) ${label}: sau khi khôi phục, Boot Accepted`, bootStatus(recovered) === 'Accepted', ms(recovered.ms));
    const status = await call(ws, 'StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });
    check(`(b) ${label}: sau khi khôi phục, StatusNotification CALLRESULT`, status.frame?.[0] === 3, ms(status.ms));
  }
  ws.close();
}

async function scenarioLock(server, tag, { holdMs, boundMs, withBootProbe = false }) {
  console.log(`\n--- (c) ${tag}: khoá hàng charge_points bằng SELECT ... FOR UPDATE ở phiên khác, giữ ${holdMs} ms ---`);
  const code = tag.startsWith('c1') ? 'CP-R6-C1' : 'CP-R6-C2';
  const ws = await connectCp(server, code);
  const first = await boot(ws);
  check(`(c) ${tag}: Boot ban đầu Accepted`, bootStatus(first) === 'Accepted', ms(first.ms));

  const locker = new Client({ connectionString: adminDbUrl(DB_NAME), application_name: 'csms-r6-admin' });
  await locker.connect();
  await locker.query('BEGIN');
  await locker.query('SELECT id FROM charge_points WHERE code = $1 FOR UPDATE', [code]);
  const release = sleep(holdMs).then(() => locker.query('COMMIT'));

  const [heartbeat, statusRes] = await Promise.all([
    call(ws, 'Heartbeat'),
    call(ws, 'StatusNotification', { connectorId: 1, status: 'Charging', errorCode: 'NoError' }),
  ]);
  const heartbeatMs = heartbeat.ms;
  let bootDuringLock = null;
  if (withBootProbe) bootDuringLock = await boot(ws, { firmwareVersion: 'fw-locked' });
  await release;
  await locker.end();
  check(`(c) ${tag}: Heartbeat khi hàng bị khoá được trả lời trong ≤ ${boundMs} ms`, heartbeat.frame?.[0] === 3 && heartbeatMs <= boundMs, `${kind(heartbeat)} sau ${ms(heartbeatMs)}, khoá giữ ${holdMs} ms`);
  console.log(`    StatusNotification (gửi cùng lúc Heartbeat) trong lúc khoá: ${kind(statusRes)} sau ${ms(statusRes.ms)}`);
  if (statusRes.frame?.[0] === 4) check(`(c) ${tag}: StatusNotification lỗi do khoá phải là InternalError`, isInternalError(statusRes));
  if (bootDuringLock) {
    check(`(c) ${tag}: Boot khi hàng bị khoá và hết lock_timeout phải là InternalError, không Accepted`, isInternalError(bootDuringLock), `${kind(bootDuringLock)} sau ${ms(bootDuringLock.ms)}`);
    check(`(c) ${tag}: Boot lỗi không lộ nội dung Postgres`, !/lock|relation|charge_points|55P03|postgres/i.test(bootDuringLock.raw || ''));
  }
  check(`(c) ${tag}: WebSocket không bị đóng`, ws.readyState === WebSocket.OPEN && ws.closeCode === null);
  const after = await call(ws, 'Heartbeat');
  check(`(c) ${tag}: sau khi nhả khoá, Heartbeat nhanh trở lại (< 500 ms)`, after.frame?.[0] === 3 && after.ms < 500, ms(after.ms));
  const rebooted = await boot(ws);
  check(`(c) ${tag}: sau khi nhả khoá, Boot Accepted`, bootStatus(rebooted) === 'Accepted', ms(rebooted.ms));
  const state = await cpState(code);
  check(`(c) ${tag}: trụ ONLINE trong DB sau khi phục hồi`, state.status === 'ONLINE');
  ws.close();
  return heartbeatMs;
}

async function scenarioPoolStarvation(server, holdMs) {
  console.log(`\n--- (c) c1-pool: 12 trụ cùng Heartbeat khi mọi hàng bị khoá ${holdMs} ms (pool mặc định 10 kết nối) ---`);
  const codes = Array.from({ length: 12 }, (_, index) => `CP-R6-P${String(index + 1).padStart(2, '0')}`);
  const sockets = [];
  for (const code of codes) {
    const ws = await connectCp(server, code);
    const res = await boot(ws);
    if (bootStatus(res) !== 'Accepted') check(`(c) pool: Boot ${code} Accepted`, false, kind(res));
    sockets.push(ws);
  }
  const locker = new Client({ connectionString: adminDbUrl(DB_NAME), application_name: 'csms-r6-admin' });
  await locker.connect();
  await locker.query('BEGIN');
  await locker.query("SELECT id FROM charge_points WHERE code LIKE 'CP-R6-P%' FOR UPDATE");
  const release = sleep(holdMs).then(() => locker.query('COMMIT'));
  const beats = await Promise.all(sockets.map((ws) => call(ws, 'Heartbeat')));
  const healthStarted = performance.now();
  const health = await new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${server.port}/api/health`, (response) => { response.resume(); resolve(response.statusCode); });
    request.setTimeout(5000, () => { request.destroy(); resolve('timeout'); });
    request.on('error', () => resolve('error'));
  });
  const healthMs = performance.now() - healthStarted;
  await release;
  await locker.end();
  const slowest = Math.max(...beats.map((beat) => beat.ms));
  const answered = beats.filter((beat) => beat.frame?.[0] === 3).length;
  check('(c) pool: cả 12 Heartbeat được trả lời trong ≤ 2000 ms dù mọi hàng bị khoá', answered === 12 && slowest <= 2000, `${answered}/12 CALLRESULT, chậm nhất ${ms(slowest)}; /api/health=${health} sau ${ms(healthMs)}`);
  for (const ws of sockets) ws.close();
}

async function main() {
  await sql('postgres', `DROP DATABASE IF EXISTS ${DB_NAME}`);
  await sql('postgres', `CREATE DATABASE ${DB_NAME}`);
  console.log(`DB thử ${DB_NAME} đã tạo; backend: ${path.relative(process.cwd(), backendDir) || '.'}; Node ${process.versions.node}`);
  const outputs = [];
  let server;
  try {
    server = await startServer();
    await seed(['CP-R6-A', 'CP-R6-B', 'CP-R6-C1', 'CP-R6-C2', ...Array.from({ length: 12 }, (_, index) => `CP-R6-P${String(index + 1).padStart(2, '0')}`)]);

    await scenarioKillConnections(server);
    await scenarioRename(server);
    const c1 = await scenarioLock(server, 'c1 (không đặt timeout)', { holdMs: 6000, boundMs: 2000 });
    await scenarioPoolStarvation(server, 6000);
    console.log(`    => đo (c1): Heartbeat chờ ${ms(c1)} khi hàng bị khoá 6000 ms`);
    outputs.push(server.child.output);
    await stopServer(server);
    server = null;

    server = await startServer('&options=-c%20lock_timeout%3D1000');
    await scenarioLock(server, 'c2 (lock_timeout=1000ms)', { holdMs: 4000, boundMs: 2000, withBootProbe: true });
    outputs.push(server.child.output);
    scanLogs(outputs.join('\n'), 'log server');
    console.log('\n--- Dòng log mẫu đã làm sạch (rút gọn, không chứa bí mật) ---');
    const sample = outputs.join('\n').split('\n').filter((line) => /Handler failed|Failed to update last_seen|Lỗi/.test(line)).slice(0, 4);
    for (const line of sample) console.log(`    ${line.slice(0, 200)}`);
  } finally {
    await stopServer(server);
    await sql('postgres', `DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => {});
  }
  const failed = results.filter((result) => !result.ok);
  console.log(`\nTổng: ${results.length - failed.length} ok, ${failed.length} FAIL`);
  for (const result of failed) console.log(`  FAIL: ${result.name} | ${result.detail}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error('Script lỗi:', error.message); process.exit(2); });
