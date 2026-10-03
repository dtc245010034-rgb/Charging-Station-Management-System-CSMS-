const { once } = require('node:events');
const path = require('node:path');
require('../backend/node_modules/dotenv').config({
  path: path.resolve(__dirname, '../.env'),
  quiet: true,
});
const { WebSocket } = require('../backend/node_modules/ws');

const BASE_URL = process.env.STAGING_BASE_URL;
const CHARGE_POINT_CODE = process.env.CHARGE_POINT_CODE;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const EXPECTED_HEARTBEAT_SECONDS = 5;
const RUNS = 3;

function requiredEnvironment() {
  const missing = [
    ['STAGING_BASE_URL', BASE_URL],
    ['CHARGE_POINT_CODE', CHARGE_POINT_CODE],
    ['TEST_USER_EMAIL', TEST_USER_EMAIL],
    ['TEST_USER_PASSWORD', TEST_USER_PASSWORD],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(path, { cookie, ...options } = {}) {
  const headers = { Accept: 'application/json', ...options.headers };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(new URL(path, BASE_URL), { ...options, headers });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${options.method || 'GET'} ${path} returned non-JSON (HTTP ${response.status})`);
  }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed: HTTP ${response.status}`);
  return { body, response };
}

async function login() {
  const { response } = await requestJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Login succeeded but did not return an authentication cookie');
  return cookie;
}

async function readChargePoint(cookie) {
  const { body } = await requestJson('/api/fleet-status', { cookie });
  const points = body.stations.flatMap((station) => station.charge_points);
  const matches = points.filter((point) => point.code === CHARGE_POINT_CODE);
  if (matches.length !== 1) {
    throw new Error(`Expected one visible charge point ${CHARGE_POINT_CODE}; found ${matches.length}`);
  }
  return matches[0];
}

function connect() {
  const url = new URL(BASE_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/ocpp/${encodeURIComponent(CHARGE_POINT_CODE)}`;
  url.search = '';
  url.hash = '';
  return new WebSocket(url, ['ocpp1.6']);
}

async function openChargePoint() {
  const socket = connect();
  try {
    await once(socket, 'open');
    return socket;
  } catch (error) {
    socket.terminate();
    throw error;
  }
}

let messageSequence = 0;
function call(socket, action, payload) {
  const messageId = `offline-reconnect-${++messageSequence}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${action}`));
    }, 10000);
    const onMessage = (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw.toString());
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }
      if (frame[1] !== messageId) return;
      cleanup();
      if (frame[0] === 4) reject(new Error(`${action} failed: ${frame[2]} ${frame[3]}`));
      else if (frame[0] !== 3) reject(new Error(`${action} returned unexpected OCPP frame type ${frame[0]}`));
      else resolve(frame[2]);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    function cleanup() {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
    }
    socket.on('message', onMessage);
    socket.once('error', onError);
    socket.send(JSON.stringify([2, messageId, action, payload]));
  });
}

async function bootAndReport(socket, status) {
  const boot = await call(socket, 'BootNotification', {
    chargePointVendor: 'CSMS-Staging-Test',
    chargePointModel: 'Virtual-Offline-Reconnect',
  });
  if (boot.status !== 'Accepted') throw new Error(`BootNotification returned ${boot.status}`);
  if (boot.interval !== EXPECTED_HEARTBEAT_SECONDS) {
    throw new Error(`Expected heartbeat interval ${EXPECTED_HEARTBEAT_SECONDS}s, received ${boot.interval}s`);
  }
  await call(socket, 'StatusNotification', {
    connectorId: 1,
    errorCode: 'NoError',
    status,
    timestamp: new Date().toISOString(),
  });
}

function assertOnlinePoint(point, expectedStatus) {
  if (point.status !== 'ONLINE' || point.offline) {
    throw new Error(`Expected ${CHARGE_POINT_CODE} online; got status=${point.status}, offline=${point.offline}`);
  }
  const connector = point.connectors.find((item) => item.connector_no === 1);
  if (!connector || connector.status !== expectedStatus.internal || connector.ocpp_status !== expectedStatus.ocpp) {
    throw new Error(`Unexpected connector 1 status: ${JSON.stringify(connector)}`);
  }
}

async function closeChargePoint(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return;
  const closed = once(socket, 'close');
  socket.close();
  await Promise.race([closed, delay(5000)]);
  if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
}

async function main() {
  requiredEnvironment();
  const cookie = await login();
  let socket;
  try {
    for (let run = 1; run <= RUNS; run += 1) {
      if (socket) {
        await closeChargePoint(socket);
        socket = null;
      }

      console.log(`[${run}/${RUNS}] Connecting virtual charge point and reporting Available...`);
      socket = await openChargePoint();
      await bootAndReport(socket, 'Available');
      assertOnlinePoint(await readChargePoint(cookie), { internal: 'AVAILABLE', ocpp: 'Available' });

      console.log(`[${run}/${RUNS}] Disconnecting; waiting longer than two 5-second heartbeat intervals...`);
      await closeChargePoint(socket);
      socket = null;
      await delay((2 * EXPECTED_HEARTBEAT_SECONDS + 1) * 1000);
      const offlinePoint = await readChargePoint(cookie);
      if (!offlinePoint.offline) {
        throw new Error(`Expected ${CHARGE_POINT_CODE} offline after ${2 * EXPECTED_HEARTBEAT_SECONDS + 1}s`);
      }

      console.log(`[${run}/${RUNS}] Reconnecting and reporting Charging...`);
      socket = await openChargePoint();
      await bootAndReport(socket, 'Charging');
      assertOnlinePoint(await readChargePoint(cookie), { internal: 'OCCUPIED', ocpp: 'Charging' });
      console.log(`[${run}/${RUNS}] PASS: offline then online; connector reports Charging`);
    }
  } finally {
    await closeChargePoint(socket);
  }
  console.log(`PASS: ${RUNS} consecutive OCPP offline/reconnect runs on staging`);
}

main().catch((error) => {
  console.error('Staging OCPP offline/reconnect test failed:', error.message);
  process.exitCode = 1;
});
