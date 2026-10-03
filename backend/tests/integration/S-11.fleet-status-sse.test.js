const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { run, query, resetSchema, truncateAll, env } = require('../helpers/db');
const { closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const backendRoot = path.resolve(__dirname, '../..');
let server;
let streams = [];
let chargePoint;
let connectorId;

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, '0.0.0.0');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

function startServer(port) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: backendRoot,
    env: env({ PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.output = '';
  child.stdout.on('data', (chunk) => { child.output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { child.output += chunk.toString(); });
  return child;
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 30000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`CSMS exited before becoming ready:\n${child.output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.status === 200) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`CSMS did not become ready: ${lastError}\n${child.output}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function createSseReader(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return {
    async next(timeoutMs = 1000) {
      const deadline = Date.now() + timeoutMs;
      while (true) {
        const end = buffer.indexOf('\n\n');
        if (end >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          return frame;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) return null;
        let timer;
        const result = await Promise.race([
          reader.read(),
          new Promise((resolve) => { timer = setTimeout(() => resolve(null), remaining); }),
        ]);
        clearTimeout(timer);
        if (!result || result.done) return null;
        buffer += decoder.decode(result.value, { stream: true });
      }
    },
    cancel: () => reader.cancel(),
  };
}

async function openSse(port, user) {
  const response = await fetch(`http://127.0.0.1:${port}/api/fleet-status/events`, {
    headers: { Cookie: user.cookie, Accept: 'text/event-stream' },
  });
  assert.strictEqual(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.strictEqual(response.headers.get('x-accel-buffering'), 'no');
  const stream = createSseReader(response);
  assert.match(await stream.next(), /retry: 1000/);
  return stream;
}

async function nextEvent(stream, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = await stream.next(deadline - Date.now());
    if (frame === null) return null;
    const data = frame.split('\n').find((line) => line.startsWith('data: '));
    if (data) return JSON.parse(data.slice(6));
  }
  return null;
}

function callChargePoint(socket, action, payload) {
  const messageId = `t25-${action}-${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for ${action}`));
    }, 5000);
    const onMessage = (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[1] !== messageId) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      if (frame[0] === 4) reject(new Error(`${frame[2]}: ${frame[3]}`));
      else resolve(frame[2]);
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify([2, messageId, action, payload]));
  });
}

describe('S-11 T-25: SSE trạng thái đầu nối theo quyền', () => {
  let port;
  let ownerA;
  let ownerB;
  let operator;
  let stationB;
  let socket;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    ownerA = await createUser('sse-owner-a@example.com', 'STATION_OWNER');
    ownerB = await createUser('sse-owner-b@example.com', 'STATION_OWNER');
    operator = await createUser('sse-operator@example.com', 'OPERATOR');
    await query(
      'INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id',
      ['SSE station A', 'A', ownerA.id],
    );
    stationB = (await query(
      'INSERT INTO stations (name, address, owner_id) VALUES ($1, $2, $3) RETURNING id',
      ['SSE station B', 'B', ownerB.id],
    )).rows[0];
    chargePoint = (await query(
      'INSERT INTO charge_points (station_id, code, power_kw) VALUES ($1, $2, $3) RETURNING id',
      [stationB.id, 'VCP-SSE-T25', 22],
    )).rows[0];
    connectorId = (await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
      [chargePoint.id],
    )).rows[0].id;

    port = await unusedPort();
    server = startServer(port);
    await waitForHealth(port, server);
    for (const user of [ownerA, ownerB, operator]) streams.push(await openSse(port, user));
  });

  after(async () => {
    for (const stream of streams) await stream.cancel().catch(() => {});
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    await stopServer(server);
    await resetSchema();
    await closePool();
  });

  it('đẩy thay đổi qua trụ ảo dưới 1 giây, không rò sự kiện sang chủ trạm khác', { timeout: 30000 }, async () => {
    socket = new WebSocket(`ws://127.0.0.1:${port}/ocpp/VCP-SSE-T25`, ['ocpp1.6']);
    await once(socket, 'open');
    const boot = await callChargePoint(socket, 'BootNotification', {
      chargePointVendor: 'CSMS test',
      chargePointModel: 'Virtual T-25',
    });
    assert.strictEqual(boot.status, 'Accepted');

    const start = performance.now();
    await callChargePoint(socket, 'StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Charging',
    });
    const [ownerEvent, operatorEvent] = await Promise.all([
      nextEvent(streams[1]),
      nextEvent(streams[2]),
    ]);
    const elapsedMs = performance.now() - start;

    console.log(`T-25 measured OCPP-to-SSE time: ${elapsedMs.toFixed(2)} ms`);
    assert.ok(ownerEvent, 'the station owner should receive the update');
    assert.ok(operatorEvent, 'the operator should receive the update');
    assert.strictEqual(String(ownerEvent.station_id), String(stationB.id));
    assert.strictEqual(String(ownerEvent.charge_point_id), String(chargePoint.id));
    assert.strictEqual(String(ownerEvent.connector_id), String(connectorId));
    assert.strictEqual(Object.hasOwn(ownerEvent, 'owner_id'), false);
    assert.ok(elapsedMs < 1000, `OCPP-to-SSE took ${elapsedMs.toFixed(2)} ms; expected < 1000 ms`);
    assert.strictEqual(await nextEvent(streams[0], 150), null, 'owner A must not receive owner B events');

    await callChargePoint(socket, 'StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Charging',
    });
    assert.strictEqual(await nextEvent(streams[1], 150), null, 'same status must not publish a duplicate event');

    const snapshotResponse = await fetch(`http://127.0.0.1:${port}/api/fleet-status`, {
      headers: { Cookie: ownerB.cookie },
    });
    const snapshot = await snapshotResponse.json();
    assert.strictEqual(snapshot.stations[0].charge_points[0].connectors[0].status, 'OCCUPIED');
  });
});
