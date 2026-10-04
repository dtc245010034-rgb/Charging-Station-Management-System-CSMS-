const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, env } = require('../helpers/db');

const backendRoot = path.resolve(__dirname, '../..');

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, '0.0.0.0');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 30000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`CSMS exited before becoming ready:\n${child.output}`);
    try {
      const status = await new Promise((resolve, reject) => {
        const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => {
          response.resume();
          resolve(response.statusCode);
        });
        request.setTimeout(1000, () => request.destroy(new Error('health request timed out')));
        request.on('error', reject);
      });
      if (status === 200) return;
      lastError = `HTTP ${status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`CSMS did not become ready: ${lastError}\n${child.output}`);
}

function runVirtualChargePoint(port, code) {
  const result = spawnSync('docker', [
    'run', '--rm', '--network', 'host',
    '--env', 'TZ=Pacific/Kiritimati',
    '--env', 'SIMULATED_CLOCK_SKEW_HOURS=5',
    '--volume', `${backendRoot}:/workspace/backend:ro`,
    '--workdir', '/workspace/backend',
    'node:22-bookworm-slim',
    'node', 'tests/helpers/virtual-heartbeat.js', `ws://127.0.0.1:${port}`, code,
  ], { cwd: backendRoot, encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, 0, `Virtual charge point container failed:\n${result.stdout}\n${result.stderr}`);
  const output = result.stdout.trim().split(/\r?\n/).at(-1);
  return JSON.parse(output);
}

describe('S-09 T-19: Heartbeat lấy thời gian từ server và cơ sở dữ liệu', () => {
  it('ghi last_seen_at theo giờ DB dù trụ ảo chạy sai giờ trong container có TZ riêng', { timeout: 180000 }, async (t) => {
    if (process.platform !== 'linux') {
      t.skip('The virtual charge point uses Docker host networking available in the Linux CI job.');
      return;
    }
    const docker = spawnSync('docker', ['--version'], { encoding: 'utf8' });
    if (docker.error?.code === 'ENOENT') {
      t.skip('Docker CLI is unavailable; this container integration test runs in the Linux CI job.');
      return;
    }
    assert.equal(docker.status, 0, `Docker CLI is not ready: ${docker.stderr}`);

    const migration = run('src/db/migrate.js');
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);

    const suffix = `${process.pid}-${Date.now()}`;
    const email = `heartbeat-${suffix}@test.invalid`;
    const code = `VCP-HB-${suffix}`;
    let userId;
    let stationId;
    let server;

    try {
      userId = (await query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Heartbeat integration test', email, 'test-only-password-hash']
      )).rows[0].id;
      stationId = (await query(
        'INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id',
        [`Heartbeat ${suffix}`, 'CI test station', userId]
      )).rows[0].id;
      const chargePointId = (await query(
        'INSERT INTO charge_points (station_id, code, power_kw) VALUES ($1, $2, $3) RETURNING id',
        [stationId, code, 22]
      )).rows[0].id;

      const port = await unusedPort();
      server = spawn(process.execPath, ['src/server.js'], {
        cwd: backendRoot,
        env: env({ PORT: String(port) }),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      server.output = '';
      server.stdout.on('data', (chunk) => { server.output += chunk.toString(); });
      server.stderr.on('data', (chunk) => { server.output += chunk.toString(); });
      await waitForHealth(port, server);

      const chargePointResult = runVirtualChargePoint(port, code);
      assert.equal(chargePointResult.timezone, 'Pacific/Kiritimati');
      assert.equal(chargePointResult.timezoneOffsetMinutes, 840);

      const observed = (await query(
        `SELECT last_seen_at,
                ABS(EXTRACT(EPOCH FROM (now() - last_seen_at)))::float8 AS db_age_seconds,
                ABS(EXTRACT(EPOCH FROM (now() - $1::timestamptz)))::float8 AS heartbeat_age_seconds
           FROM charge_points
          WHERE id = $2`,
        [chargePointResult.heartbeatTime, chargePointId]
      )).rows[0];
      assert.ok(observed.last_seen_at, 'Heartbeat should write charge_points.last_seen_at');
      assert.ok(observed.db_age_seconds < 2, `last_seen_at differs from DB now() by ${observed.db_age_seconds}s`);
      assert.ok(observed.heartbeat_age_seconds < 2, `Heartbeat currentTime differs from DB now() by ${observed.heartbeat_age_seconds}s`);
      assert.ok(
        Math.abs(Date.parse(chargePointResult.simulatedChargePointTime) - Date.parse(chargePointResult.heartbeatTime)) > 4 * 60 * 60 * 1000,
        'The virtual charge point should send a deliberately skewed timestamp',
      );
    } finally {
      if (server && server.exitCode === null) {
        server.kill('SIGTERM');
        await Promise.race([
          once(server, 'exit'),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
        if (server.exitCode === null) server.kill('SIGKILL');
      }
      if (stationId) await query('DELETE FROM stations WHERE id = $1', [stationId]);
      if (userId) await query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });
});
