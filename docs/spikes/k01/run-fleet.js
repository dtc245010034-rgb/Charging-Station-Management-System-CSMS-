'use strict';

const fs = require('node:fs');
const { RPCClient } = require('ocpp-rpc');

const API_URL = process.env.CSMS_URL || 'http://app:3000';
const COUNT = Number(process.env.VCP_COUNT || 20);
const PREFIX = (process.env.VCP_PREFIX || 'VCP-').toUpperCase();
const ADMIN_EMAIL = process.env.VCP_ADMIN_EMAIL || 'admin@csms.local';
const ADMIN_PASSWORD = process.env.VCP_ADMIN_PASSWORD || 'admin';
const READY_FILE = '/tmp/vcp-ready';
const START_SPACING_MS = 100;

if (!Number.isSafeInteger(COUNT) || COUNT < 1 || COUNT > 500) {
  throw new Error('VCP_COUNT must be an integer from 1 to 500');
}
if (!/^[A-Z][A-Z0-9_-]{0,9}-$/.test(PREFIX)) {
  throw new Error('VCP_PREFIX must be 1-10 letters, digits, "_" or "-" followed by "-"');
}

const apiBase = new URL(API_URL);
if (!['http:', 'https:'].includes(apiBase.protocol)) {
  throw new Error('CSMS_URL must use http:// or https://');
}
const wsBase = new URL('/ocpp', apiBase);
wsBase.protocol = apiBase.protocol === 'https:' ? 'wss:' : 'ws:';

async function request(route, { cookie, ...options } = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...options.headers,
  };
  const response = await fetch(new URL(route, apiBase), { ...options, headers });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${options.method || 'GET'} ${route} returned non-JSON (HTTP ${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${route} failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return { body, response };
}

async function login() {
  const { response } = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('CSMS login did not return an authentication cookie');
  return cookie;
}

async function provisionFleet(cookie) {
  const stations = await request('/api/stations', { cookie });
  const stationByName = new Map(stations.body.map((station) => [station.name, station]));
  const points = await request('/api/charge-points', { cookie });
  const pointByCode = new Map(points.body.map((point) => [point.code, point]));
  const codes = Array.from({ length: COUNT }, (_, index) => `${PREFIX}${String(index + 1).padStart(3, '0')}`);

  for (let offset = 0; offset < codes.length; offset += 5) {
    const stationName = `${PREFIX}STATION-${String(Math.floor(offset / 5) + 1).padStart(2, '0')}`;
    let station = stationByName.get(stationName);
    if (!station) {
      const result = await request('/api/stations', {
        method: 'POST',
        cookie,
        headers: { 'Idempotency-Key': `${PREFIX}station-${Math.floor(offset / 5) + 1}` },
        body: JSON.stringify({
          name: stationName,
          address: 'Automated virtual charge point fixture',
          latitude: 21.03,
          longitude: 105.85,
        }),
      });
      station = result.body;
      stationByName.set(stationName, station);
    }
    if (station.status !== 'ACTIVE') {
      const result = await request(`/api/stations/${station.id}`, {
        method: 'PATCH',
        cookie,
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
      station = result.body;
      stationByName.set(stationName, station);
    }

    for (const code of codes.slice(offset, offset + 5)) {
      if (pointByCode.has(code)) continue;
      const result = await request(`/api/stations/${station.id}/charge-points`, {
        method: 'POST',
        cookie,
        body: JSON.stringify({
          code,
          connector_count: 1,
          vendor: 'CSMS-K01',
          model: 'Virtual-Charge-Point',
        }),
      });
      pointByCode.set(code, result.body);
    }
  }
  return codes;
}

async function waitForFleetOnline(cookie, codes) {
  const deadline = Date.now() + 60000;
  let missing = codes;
  while (Date.now() < deadline) {
    const { body } = await request('/api/fleet-status', { cookie });
    const points = body.stations.flatMap((station) => station.charge_points);
    const online = new Set(points
      .filter((point) => point.status === 'ONLINE' && !point.offline)
      .map((point) => point.code));
    missing = codes.filter((code) => !online.has(code));
    if (!missing.length) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for virtual charge points to appear online: ${missing.join(', ')}`);
}

class FleetChargePoint {
  constructor(code) {
    this.code = code;
    this.client = new RPCClient({
      endpoint: wsBase.toString(),
      identity: code,
      protocols: ['ocpp1.6'],
      strictMode: true,
      reconnect: true,
      maxReconnects: 10,
      backoff: { initialDelay: 250, maxDelay: 5000 },
    });
    this.hasOpened = false;
    this.heartbeatTimer = null;
    this.client.on('open', () => {
      if (this.hasOpened) this.reportOnline().catch((error) => {
        console.error(`[${this.code}] Failed to restore OCPP state after reconnect: ${error.message}`);
      });
      this.hasOpened = true;
    });
  }

  async reportOnline() {
    const boot = await this.client.call('BootNotification', {
      chargePointVendor: 'CSMS-K01',
      chargePointModel: 'Virtual-Charge-Point',
      chargePointSerialNumber: this.code,
      firmwareVersion: '2.2.1',
    });
    if (boot.status !== 'Accepted') throw new Error(`${this.code}: BootNotification returned ${boot.status}`);
    await this.client.call('StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Available',
      timestamp: new Date().toISOString(),
    });
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.client.call('Heartbeat', {}).catch((error) => {
        console.error(`[${this.code}] Heartbeat failed: ${error.message}`);
      });
    }, Math.max(1000, Number(boot.interval) * 500));
    this.heartbeatTimer.unref();
  }

  async connect() {
    await this.client.connect();
    await this.reportOnline();
  }

  async close() {
    clearInterval(this.heartbeatTimer);
    await this.client.close({ awaitPending: false, force: true });
  }
}

async function main() {
  const cookie = await login();
  const codes = await provisionFleet(cookie);
  const fleet = [];
  try {
    for (const code of codes) {
      const point = new FleetChargePoint(code);
      fleet.push(point);
      await point.connect();
      if (fleet.length < codes.length) {
        await new Promise((resolve) => setTimeout(resolve, START_SPACING_MS));
      }
    }
    await waitForFleetOnline(cookie, codes);
    fs.writeFileSync(READY_FILE, 'ready');
    console.log(`PASS: ${codes.length}/${COUNT} virtual charge points online (${codes[0]} ... ${codes[codes.length - 1]})`);
    await new Promise((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  } finally {
    if (fs.existsSync(READY_FILE)) fs.unlinkSync(READY_FILE);
    await Promise.all(fleet.map((point) => point.close()));
  }
}

main().catch((error) => {
  console.error('Virtual charge point fleet failed:', error.message);
  process.exitCode = 1;
});
