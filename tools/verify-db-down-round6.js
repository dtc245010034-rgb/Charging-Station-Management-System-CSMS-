#!/usr/bin/env node
/*
 * Kiểm chứng B7/N1 khi DB sập hẳn (CLAUDE.md mục 4.3): server thật + trụ ảo `ws`, container Postgres riêng.
 *
 * An toàn: tạo container riêng `csms-pg-down-chk` (cổng 5441) và DB `csms_r6down_chk`, xoá container khi xong.
 * Không dùng csms-pg-test (5433) hay compose (5432/3000). Mật khẩu container, JWT_SECRET sinh ngẫu nhiên trong
 * tiến trình, không in ra, không ghi file.
 *
 * Chạy: PATH=<node22>/bin:$PATH node tools/verify-db-down-round6.js   (Node >= 22, cần Docker)
 *   CSMS_BACKEND_DIR  thư mục backend cần thử (mặc định ../backend)
 */
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

const backendDir = path.resolve(process.env.CSMS_BACKEND_DIR || path.join(__dirname, '..', 'backend'));
const backendRequire = createRequire(path.join(backendDir, 'package.json'));
const { WebSocket } = backendRequire('ws');
const { Client } = backendRequire('pg');

const CONTAINER = 'csms-pg-down-chk';
const DB_PORT = 5441;
const DB_NAME = 'csms_r6down_chk';
if (!DB_NAME.endsWith('_chk')) throw new Error('tên DB phải kết thúc _chk');
const PASSWORD = crypto.randomBytes(18).toString('hex');
const dbUrl = (name) => `postgresql://postgres:${PASSWORD}@127.0.0.1:${DB_PORT}/${name}`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
}
const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));
const round = (value) => Math.round(value);
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

function docker(...args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`docker ${args[0]} thất bại: ${(result.stderr || '').replace(PASSWORD, '***').trim()}`);
  return result.stdout.trim();
}

async function sql(dbname, text, params) {
  const client = new Client({ connectionString: dbUrl(dbname) });
  await client.connect();
  try { return await client.query(text, params); } finally { await client.end(); }
}

async function waitDbReady(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { await sql('postgres', 'SELECT 1'); return; } catch (error) {
      if (Date.now() > deadline) throw new Error(`Postgres không sẵn sàng: ${String(error.message).replace(PASSWORD, '***')}`);
      await sleep(250);
    }
  }
}

async function freePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

const serverEnv = (port) => ({
  PATH: process.env.PATH,
  CSMS_SKIP_DOTENV: '1',
  DATABASE_URL: dbUrl(DB_NAME),
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  APP_ORIGIN: 'http://localhost:3000',
  PORT: String(port),
});

function healthStatus(port) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: body.slice(0, 120) }));
    });
    request.setTimeout(5000, () => request.destroy());
    request.on('error', (error) => resolve({ status: 0, body: error.code || 'error' }));
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], { cwd: backendDir, env: serverEnv(port), stdio: ['ignore', 'pipe', 'pipe'] });
  child.output = '';
  child.stdout.on('data', (chunk) => { child.output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { child.output += chunk.toString(); });
  const deadline = Date.now() + 30000;
  for (;;) {
    if (child.exitCode !== null) throw new Error('Server thoát sớm khi khởi động');
    if (Date.now() > deadline) throw new Error('Server không sẵn sàng');
    if ((await healthStatus(port)).status === 200) break;
    await sleep(100);
  }
  return { port, child };
}

function call(ws, action, payload = {}, timeoutMs = 25000) {
  const messageId = crypto.randomUUID();
  const started = performance.now();
  return new Promise((resolve) => {
    const done = (value) => { clearTimeout(timer); ws.off('message', onMessage); ws.off('close', onClose); resolve({ ms: performance.now() - started, action, ...value }); };
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

const payloads = {
  BootNotification: () => ({ chargePointVendor: 'R6', chargePointModel: 'Down' }),
  Heartbeat: () => ({}),
  StatusNotification: () => ({ connectorId: 1, status: 'Preparing', errorCode: 'NoError' }),
};
const send = (ws, action) => call(ws, action, payloads[action]());
const kind = (res) => (res.timedOut ? 'timeout' : res.closed !== undefined ? `closed ${res.closed}` : res.frame[0] === 3 ? 'CALLRESULT' : `CALLERROR ${res.frame[2]}`);
const isInternalError = (res) => res.frame?.[0] === 4 && res.frame[2] === 'InternalError' && res.frame[3] === 'Internal error';
const bootAccepted = (res) => res.frame?.[0] === 3 && res.frame[2]?.status === 'Accepted';
const LEAK = /ECONNREFUSED|ECONNRESET|57P01|08006|\/home|node_modules|\.js:\d+|password|127\.0\.0\.1|5441|at\s+\S+\s+\(/i;
const distinctLines = (text) => {
  const counts = new Map();
  for (const line of text.split('\n').filter(Boolean)) counts.set(line.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z?/g, '<ts>').slice(0, 160), (counts.get(line.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z?/g, '<ts>').slice(0, 160)) || 0) + 1);
  return [...counts].map(([line, n]) => `       x${n} ${line}`).join('\n');
};

async function main() {
  docker('rm', '-f', CONTAINER);
  docker('run', '-d', '--name', CONTAINER, '-p', `127.0.0.1:${DB_PORT}:5432`, '-e', `POSTGRES_PASSWORD=${PASSWORD}`, 'postgres:16-alpine');
  await waitDbReady();
  await sleep(500);
  await sql('postgres', `CREATE DATABASE ${DB_NAME}`);

  const migrate = spawnSync(process.execPath, ['src/db/migrate.js'], { cwd: backendDir, env: serverEnv(await freePort()), encoding: 'utf8' });
  check('migrate trên DB mới đạt', migrate.status === 0, migrate.status === 0 ? '' : String(migrate.stderr).replace(PASSWORD, '***').slice(0, 200));

  const owner = (await sql(DB_NAME, "INSERT INTO users (name, email, password_hash) VALUES ('R6 down', 'r6-down@test.invalid', 'khong-dung-de-dang-nhap') RETURNING id")).rows[0].id;
  const station = (await sql(DB_NAME, "INSERT INTO stations (name, address, owner_id) VALUES ('R6 down station', 'DB thu _chk', $1) RETURNING id", [owner])).rows[0].id;
  const code = 'R6-DOWN-CP-01';
  const cp = (await sql(DB_NAME, 'INSERT INTO charge_points (station_id, code, power_kw) VALUES ($1, $2, 22) RETURNING id', [station, code])).rows[0].id;
  await sql(DB_NAME, 'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1)', [cp]);
  const lastSeen = async () => (await sql(DB_NAME, 'SELECT last_seen_at, status FROM charge_points WHERE code = $1', [code])).rows[0];

  let server = await startServer();
  const events = [];
  server.child.on('exit', (exitCode, signal) => events.push({ exitCode, signal, at: Date.now() }));
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ocpp/${code}`, 'ocpp1.6');
  ws.closeCode = null;
  ws.on('close', (closeCode) => { ws.closeCode = closeCode; });
  ws.on('error', () => {});
  await once(ws, 'open');

  console.log('\n--- Giai đoạn 0: nền (DB sống) ---');
  for (const action of ['BootNotification', 'Heartbeat', 'StatusNotification']) {
    const res = await send(ws, action);
    check(`nền: ${action} CALLRESULT`, kind(res) === 'CALLRESULT', `${round(res.ms)} ms`);
  }
  const baselineSeen = (await lastSeen()).last_seen_at;

  console.log('\n--- Giai đoạn 1: docker stop giữa chừng ---');
  docker('stop', '-t', '0', CONTAINER);
  const stoppedAt = Date.now();
  const probes = [];
  for (let round_ = 1; round_ <= 5; round_ += 1) {
    for (const action of ['Heartbeat', 'StatusNotification', 'BootNotification']) {
      const res = await send(ws, action);
      probes.push(res);
      const accepted = res.frame?.[0] === 3 && (action !== 'Heartbeat');
      check(`sập vòng ${round_}: ${action} → ${kind(res)} (${round(res.ms)} ms)`, !res.timedOut && res.closed === undefined && !accepted, '');
    }
  }
  const burst = await Promise.all(Array.from({ length: 12 }, () => send(ws, 'Heartbeat')));
  probes.push(...burst);
  const burstMs = burst.map((r) => r.ms);
  check('12 Heartbeat đồng thời khi DB sập đều có phản hồi', burst.every((r) => !r.timedOut && r.closed === undefined), `p50 ${round(percentile(burstMs, 50))} ms, max ${round(Math.max(...burstMs))} ms`);

  const dataCalls = probes.filter((r) => r.action !== 'Heartbeat');
  check('Boot/Status khi DB sập luôn là CALLERROR InternalError "Internal error"', dataCalls.every(isInternalError), `kết quả: ${[...new Set(dataCalls.map(kind))].join(', ')}`);
  check('không có BootNotification nào bị Accepted khi DB sập', !probes.some((r) => r.action === 'BootNotification' && bootAccepted(r)));
  const hb = probes.filter((r) => r.action === 'Heartbeat');
  check('Heartbeat khi DB sập trả CALLRESULT hoặc InternalError (không timeout/đóng)', hb.every((r) => r.frame && (r.frame[0] === 3 || isInternalError(r))), `kết quả: ${[...new Set(hb.map(kind))].join(', ')}`);
  const allMs = probes.map((r) => r.ms);
  const dataMs = dataCalls.map((r) => r.ms);
  check('mỗi phản hồi khi DB sập ≤ 2500 ms', Math.max(...allMs) <= 2500, `p50 ${round(percentile(allMs, 50))} ms, p95 ${round(percentile(allMs, 95))} ms, max ${round(Math.max(...allMs))} ms (Boot/Status: p50 ${round(percentile(dataMs, 50))}, max ${round(Math.max(...dataMs))} ms)`);
  check('phản hồi CALLERROR không lộ chi tiết Postgres/đường dẫn/ECONNREFUSED', !probes.some((r) => r.raw && LEAK.test(r.raw)));
  check('WebSocket không bị đóng vì DB sập', ws.closeCode === null && ws.readyState === WebSocket.OPEN);
  check('process server vẫn sống', server.child.exitCode === null);
  const health = await healthStatus(server.port);
  console.log(`     (ghi nhận) /api/health khi DB sập: HTTP ${health.status} ${health.body}`);
  check('/api/health vẫn trả lời khi DB sập (không treo)', health.status !== 0, `HTTP ${health.status}`);
  const outDown = server.child.output;
  check('log server không chứa mật khẩu/URL kết nối', !outDown.includes(PASSWORD) && !/postgres(ql)?:\/\//i.test(outDown));
  const logLeak = outDown.split('\n').filter((line) => LEAK.test(line));
  console.log(`     (ghi nhận) các dòng log khác nhau trong lúc DB sập:\n${distinctLines(outDown)}`);
  check('log server không lộ ECONNREFUSED/đường dẫn/tên nội bộ', logLeak.length === 0, logLeak.length ? `${logLeak.length} dòng, ví dụ: ${logLeak[0].slice(0, 140)}` : '');
  check('không có unhandledRejection/uncaughtException trong log', !/unhandled|uncaught/i.test(outDown));

  console.log('\n--- Giai đoạn 2: docker start (phục hồi) ---');
  const startedAt = performance.now();
  docker('start', CONTAINER);
  const containerStartedMs = performance.now() - startedAt;
  let bootOkMs = null;
  let attempts = 0;
  const failuresBefore = [];
  while (performance.now() - startedAt < 60000) {
    attempts += 1;
    const res = await send(ws, 'BootNotification');
    if (bootAccepted(res)) { bootOkMs = performance.now() - startedAt; break; }
    failuresBefore.push(kind(res));
    await sleep(250);
  }
  check('Boot kế tiếp Accepted sau khi DB chạy lại (pool tự phục hồi)', bootOkMs !== null, bootOkMs === null ? 'không phục hồi sau 60 s' : `${round(bootOkMs)} ms sau docker start (docker start trả về sau ${round(containerStartedMs)} ms; ${attempts} lần thử, lần lỗi trước đó: ${[...new Set(failuresBefore)].join(', ') || 'không'})`);
  const afterBoot = performance.now();
  const hbRecover = await send(ws, 'Heartbeat');
  await sleep(300);
  const seenAfter = await lastSeen();
  check('Heartbeat sau phục hồi CALLRESULT và ghi lại last_seen_at', kind(hbRecover) === 'CALLRESULT' && new Date(seenAfter.last_seen_at) > new Date(baselineSeen), `${round(hbRecover.ms)} ms, last_seen_at mới hơn nền ${round(new Date(seenAfter.last_seen_at) - new Date(baselineSeen))} ms; trạng thái trụ ${seenAfter.status}`);
  const st = await send(ws, 'StatusNotification');
  check('StatusNotification sau phục hồi CALLRESULT', kind(st) === 'CALLRESULT', `${round(st.ms)} ms`);
  check('WebSocket vẫn mở sau toàn bộ chu trình sập/phục hồi', ws.closeCode === null && ws.readyState === WebSocket.OPEN);
  check('server không crash trong cả chu trình', server.child.exitCode === null);
  void afterBoot; void stoppedAt;

  console.log('\n--- Giai đoạn 3: SIGTERM khi DB đang sập ---');
  docker('stop', '-t', '0', CONTAINER);
  await sleep(500);
  const termStarted = performance.now();
  server.child.kill('SIGTERM');
  const exited = await Promise.race([once(server.child, 'exit').then(([exitCode, signal]) => ({ exitCode, signal })), sleep(30000).then(() => null)]);
  const exitMs = performance.now() - termStarted;
  if (!exited) {
    check('server thoát khi nhận SIGTERM lúc DB sập (≤ 15 s)', false, 'treo hơn 30 s, phải SIGKILL');
    server.child.kill('SIGKILL');
  } else {
    check('server thoát khi nhận SIGTERM lúc DB sập (≤ 15 s)', exitMs <= 15000, `thoát sau ${round(exitMs)} ms, mã ${exited.exitCode}, tín hiệu ${exited.signal}`);
    console.log(`     (ghi nhận) mã thoát ${exited.exitCode} (0 = sạch, 1 = có lỗi khi ghi UNKNOWN/đóng pool)`);
  }
  check('client nhận close 1001 khi server tắt lúc DB sập', ws.closeCode === 1001, `mã đóng ${ws.closeCode}`);
  const outAll = server.child.output;
  check('log tắt máy không chứa mật khẩu/URL kết nối', !outAll.includes(PASSWORD) && !/postgres(ql)?:\/\//i.test(outAll));
  const shutdownLeak = outAll.split('\n').filter((line) => LEAK.test(line));
  console.log(`     (ghi nhận) các dòng log mới từ lúc tắt máy:\n${distinctLines(outAll.slice(outDown.length))}`);
  check('log tắt máy không lộ ECONNREFUSED/đường dẫn', shutdownLeak.length === 0, shutdownLeak.length ? `${shutdownLeak.length} dòng, ví dụ: ${shutdownLeak[0].slice(0, 140)}` : '');
  check('không có unhandledRejection/uncaughtException suốt kịch bản', !/unhandled|uncaught/i.test(outAll));

  return events;
}

async function cleanup() {
  try { docker('rm', '-f', CONTAINER); } catch (error) { console.error('Không xoá được container:', error.message); }
  const left = spawnSync('docker', ['ps', '-a', '--filter', `name=${CONTAINER}`, '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout.trim();
  check('đã xoá container thử và dữ liệu tạm', left === '', left);
}

(async () => {
  try { await main(); } catch (error) {
    check('kịch bản chạy trọn vẹn không lỗi', false, String(error.message).replace(PASSWORD, '***'));
  } finally {
    await cleanup();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\nTổng ${results.length} dòng: ${results.length - failed.length} ok, ${failed.length} FAIL`);
  for (const r of failed) console.log(`  FAIL: ${r.name}${r.detail ? ` | ${r.detail}` : ''}`);
  process.exit(failed.length ? 1 : 0);
})();
