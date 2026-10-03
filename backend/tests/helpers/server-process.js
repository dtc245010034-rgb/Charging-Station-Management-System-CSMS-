const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { env } = require('./db');

const backendRoot = path.resolve(__dirname, '../..');
const started = new Set();

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 30000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`CSMS exited before becoming ready:\n${child.output}`);
    try {
      const status = await new Promise((resolve, reject) => {
        const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => { response.resume(); resolve(response.statusCode); });
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

// Chạy tiến trình server thật (src/server.js) trên cổng trống; output được gom lại để chẩn đoán khi test hỏng.
async function startServerProcess(extraEnv = {}) {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: backendRoot,
    env: env({ PORT: String(port), ...extraEnv }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.output = '';
  child.stdout.on('data', (chunk) => { child.output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { child.output += chunk.toString(); });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  started.add(child);
  child.once('exit', () => started.delete(child));
  await waitForHealth(port, child);
  return { port, child, exited, wsUrl: `ws://127.0.0.1:${port}` };
}

async function stopServerProcess(server) {
  if (!server || server.child.exitCode !== null || server.child.signalCode !== null) return;
  server.child.kill('SIGTERM');
  const result = await Promise.race([server.exited, new Promise((resolve) => setTimeout(() => resolve(null), 8000))]);
  if (!result) server.child.kill('SIGKILL');
}

// Dọn mọi server còn sống (kể cả khi test hỏng giữa chừng) để tiến trình test không bị treo vì pipe còn mở.
async function stopAllServerProcesses() {
  for (const child of [...started]) child.kill('SIGKILL');
}

function sendCall(client, messageId, action, payload) {
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[1] !== messageId) return;
      client.off('message', onMessage);
      resolve(frame);
    };
    client.on('message', onMessage);
    client.once('error', reject);
    client.send(JSON.stringify([2, messageId, action, payload]));
  });
}

async function connectChargePoint(wsUrl, code) {
  const client = new WebSocket(`${wsUrl}/ocpp/${code}`, ['ocpp1.6']);
  await once(client, 'open');
  return client;
}

async function bootChargePoint(wsUrl, code, bootPayload = { chargePointVendor: 'VendorX', chargePointModel: 'ModelY' }) {
  const client = await connectChargePoint(wsUrl, code);
  const reply = await sendCall(client, `boot-${code}`, 'BootNotification', bootPayload);
  if (reply[2].status !== 'Accepted') throw new Error(`Boot bị từ chối: ${JSON.stringify(reply)}`);
  return client;
}

module.exports = { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, connectChargePoint, bootChargePoint };
