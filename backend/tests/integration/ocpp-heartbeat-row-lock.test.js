const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { WebSocket } = require('ws');
const { run, query, env, BASE } = require('../helpers/db');

const backendRoot = path.resolve(__dirname, '../..');
const CODE = 'HB-ROW-LOCK-CP-01';
const MAX_HEARTBEAT_MS = 2000;
const LOCK_HOLD_MS = 4000;

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`CSMS exited before becoming ready:\n${child.output}`);
    const status = await new Promise((resolve) => {
      const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => { response.resume(); resolve(response.statusCode); });
      request.setTimeout(1000, () => request.destroy());
      request.on('error', () => resolve(0));
    });
    if (status === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`CSMS did not become ready:\n${child.output}`);
}

function call(ws, messageId, action, payload) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${action} không có phản hồi sau 15 giây`)), 15000);
    const onMessage = (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[1] !== messageId) return;
      ws.off('message', onMessage);
      clearTimeout(timer);
      resolve({ frame, ms: performance.now() - started });
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify([2, messageId, action, payload]));
  });
}

describe('B7: Heartbeat không bị chặn bởi khoá hàng charge_points', () => {
  let server;
  let port;
  let stationId;
  let userId;
  let locker;

  before(async () => {
    const migration = run('src/db/migrate.js');
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
    const suffix = `${process.pid}-${Date.now()}`;
    userId = (await query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id', ['Row lock test', `row-lock-${suffix}@test.invalid`, 'test-only-password-hash'])).rows[0].id;
    stationId = (await query('INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id', [`Row lock ${suffix}`, 'CI test station', userId])).rows[0].id;
    await query('INSERT INTO charge_points (station_id, code, power_kw) VALUES ($1, $2, 22)', [stationId, CODE]);

    port = await unusedPort();
    server = spawn(process.execPath, ['src/server.js'], { cwd: backendRoot, env: env({ PORT: String(port) }), stdio: ['ignore', 'pipe', 'pipe'] });
    server.output = '';
    server.stdout.on('data', (chunk) => { server.output += chunk.toString(); });
    server.stderr.on('data', (chunk) => { server.output += chunk.toString(); });
    await waitForHealth(port, server);
  });

  after(async () => {
    if (locker) await locker.query('ROLLBACK').catch(() => {});
    if (locker) await locker.end().catch(() => {});
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
      if (server.exitCode === null) server.kill('SIGKILL');
    }
    if (stationId) await query('DELETE FROM stations WHERE id = $1', [stationId]);
    if (userId) await query('DELETE FROM users WHERE id = $1', [userId]);
  });

  it(`Heartbeat được trả lời trong ${MAX_HEARTBEAT_MS} ms dù hàng charge_points đang bị phiên khác khoá ${LOCK_HOLD_MS} ms`, { timeout: 60000 }, async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ocpp/${CODE}`, 'ocpp1.6');
    ws.on('error', () => {});
    await once(ws, 'open');
    try {
      const boot = await call(ws, 'boot-1', 'BootNotification', { chargePointVendor: 'R6', chargePointModel: 'RowLock' });
      assert.equal(boot.frame[2].status, 'Accepted');
      const firstSeen = (await query('SELECT last_seen_at FROM charge_points WHERE code = $1', [CODE])).rows[0].last_seen_at;

      locker = new Client({ connectionString: BASE });
      await locker.connect();
      await locker.query('BEGIN');
      await locker.query('SELECT id FROM charge_points WHERE code = $1 FOR UPDATE', [CODE]);
      const release = new Promise((resolve) => setTimeout(resolve, LOCK_HOLD_MS)).then(() => locker.query('COMMIT'));

      const heartbeat = await call(ws, 'hb-locked', 'Heartbeat', {});
      assert.equal(heartbeat.frame[0], 3, 'Heartbeat phải nhận CALLRESULT');
      assert.ok(Number.isFinite(Date.parse(heartbeat.frame[2].currentTime)));
      assert.ok(heartbeat.ms <= MAX_HEARTBEAT_MS, `Heartbeat bị treo ${Math.round(heartbeat.ms)} ms vì chờ khoá hàng charge_points (tối đa ${MAX_HEARTBEAT_MS} ms)`);
      await release;

      const calm = await call(ws, 'hb-calm', 'Heartbeat', {});
      assert.equal(calm.frame[0], 3);
      const lastSeen = (await query('SELECT last_seen_at FROM charge_points WHERE code = $1', [CODE])).rows[0].last_seen_at;
      assert.ok(lastSeen > firstSeen, 'Khi không còn khoá, Heartbeat phải cập nhật lại last_seen_at');
    } finally {
      ws.close();
    }
  });
});
