#!/usr/bin/env node
'use strict';

const { randomInt, randomUUID } = require('node:crypto');
const { once } = require('node:events');
const path = require('node:path');

require('../backend/node_modules/dotenv').config({
  path: path.resolve(__dirname, '../.env'),
  quiet: true,
});

const { Client } = require('../backend/node_modules/pg');
const { WebSocket } = require('../backend/node_modules/ws');
const { requireAdminCredentials } = require('./lib/admin-credentials');

const TAG = process.env.S21_TEST_TAG || 'TAG-DEMO-01';
const CONNECTOR_NO = 1;
const WH_PER_STEP = 1250;
const SAMPLE_CONTEXT = 'Sample.Periodic';
const SAMPLE_MEASURAND = 'Energy.Active.Import.Register';
const HANDSHAKE_SPACING_MS = 2100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let nextHandshakeAt = 0;

async function pacedConnect(point) {
  const now = Date.now();
  const waitMs = Math.max(0, nextHandshakeAt - now);
  nextHandshakeAt = Math.max(now, nextHandshakeAt) + HANDSHAKE_SPACING_MS;
  if (waitMs > 0) await sleep(waitMs);
  await point.connect();
}

function optionsFromArgs(args) {
  const defaults = {
    url: process.env.STAGING_BASE_URL,
    count: 20,
    disconnects: [1, 3],
    runs: 3,
    prefix: `S21-${Date.now().toString(36).toUpperCase()}-`,
    tag: TAG,
  };
  const options = { ...defaults };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') {
      return { help: true };
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    index += 1;
    if (flag === '--url') options.url = value;
    else if (flag === '--prefix') options.prefix = value.toUpperCase();
    else if (flag === '--tag') options.tag = value;
    else if (flag === '--count' || flag === '--runs') {
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${flag} must be a positive integer`);
      options[flag.slice(2)] = number;
    } else if (flag === '--disconnects') {
      const match = /^(\d+)(?:-(\d+))?$/.exec(value);
      if (!match) throw new Error('--disconnects must be N or MIN-MAX');
      options.disconnects = [Number(match[1]), Number(match[2] || match[1])];
      if (options.disconnects[0] < 1 || options.disconnects[1] < options.disconnects[0]) {
        throw new Error('--disconnects must be a range with MIN >= 1 and MAX >= MIN');
      }
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  if (!options.url) throw new Error('Set STAGING_BASE_URL or pass --url');
  if (!process.env.STAGING_DATABASE_URL) throw new Error('Set STAGING_DATABASE_URL for read-only result verification');
  if (!/^[A-Z0-9_-]{1,30}$/.test(options.prefix)) throw new Error('--prefix must use 1-30 letters, digits, "_" or "-"');
  if (!/^[A-Z0-9_-]{1,20}$/i.test(options.tag)) throw new Error('--tag must be a valid OCPP idTag (up to 20 characters)');
  if (options.count > 500) throw new Error('--count must not exceed 500');
  return options;
}

function printUsage() {
  console.log(`Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... STAGING_DATABASE_URL=... node tools/test-s21-reconnect-fleet.js [options]

Runs OCPP reconnect energy verification against a staging CSMS.
  --url <base-url>       Staging HTTP URL (default: STAGING_BASE_URL)
  --count <n>            Virtual charge points per run (default: 20)
  --disconnects <n|a-b>  Disconnects per session, fixed or random range (default: 1-3)
  --runs <n>             Complete repetitions (default: 3)
  --prefix <text>        Dedicated fixture prefix (default: unique per invocation)
  --tag <idTag>          Active OCPP idTag (default: TAG-DEMO-01)

Example for a quick CI run:
  node tools/test-s21-reconnect-fleet.js --count 2 --disconnects 1 --runs 1`);
}

function createApi(baseUrl) {
  let cookie;
  async function request(method, route, body, headers = {}) {
    const response = await fetch(new URL(route, baseUrl), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`${method} ${route} returned non-JSON (HTTP ${response.status})`);
    }
    if (!response.ok) throw new Error(`${method} ${route} failed (HTTP ${response.status}): ${JSON.stringify(data)}`);
    return data;
  }
  return {
    request,
    async login(credentials) {
      const response = await fetch(new URL('/api/auth/login', baseUrl), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Staging login failed (HTTP ${response.status}): ${text}`);
      cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
      if (!cookie) throw new Error('Staging login did not return an authentication cookie');
    },
  };
}

async function ensureFleet(api, options) {
  const stations = await api.request('GET', '/api/stations');
  const stationByName = new Map(stations.map((station) => [station.name, station]));
  const codes = Array.from({ length: options.count }, (_, index) => `${options.prefix}${String(index + 1).padStart(3, '0')}`);
  const existingPoints = await api.request('GET', '/api/charge-points');
  const existingByCode = new Map(existingPoints.map((point) => [point.code, point]));
  for (let offset = 0; offset < codes.length; offset += 5) {
    const stationName = `${options.prefix}STATION-${Math.floor(offset / 5) + 1}`;
    let station = stationByName.get(stationName);
    if (!station) {
      station = await api.request('POST', '/api/stations', {
        name: stationName,
        address: 'Automated S-21 reconnect verification',
        latitude: 21.03,
        longitude: 105.85,
      }, { 'Idempotency-Key': randomUUID() });
      stationByName.set(stationName, station);
    }
    if (station.status !== 'ACTIVE') {
      station = await api.request('PATCH', `/api/stations/${station.id}`, { status: 'ACTIVE' });
      stationByName.set(stationName, station);
    }
    for (const code of codes.slice(offset, offset + 5)) {
      let point = existingByCode.get(code);
      if (!point) {
        point = await api.request('POST', `/api/stations/${station.id}/charge-points`, {
          code,
          connector_count: 1,
          vendor: 'CSMS-S21-Test',
          model: 'Virtual-Reconnect',
        });
        existingByCode.set(code, point);
      }
    }
  }
  return { codes };
}

class VirtualChargePoint {
  constructor(code, wsBase) {
    this.code = code;
    this.wsBase = wsBase;
    this.pending = new Map();
    this.sequence = 0;
  }

  async connect() {
    const socket = new WebSocket(`${this.wsBase}/ocpp/${encodeURIComponent(this.code)}`, ['ocpp1.6']);
    socket.on('error', () => {});
    socket.on('message', (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw.toString());
      } catch (error) {
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        return;
      }
      const pending = this.pending.get(frame[1]);
      if (!pending) return;
      this.pending.delete(frame[1]);
      clearTimeout(pending.timer);
      if (frame[0] === 4) pending.reject(new Error(`${pending.action} returned ${frame[2]}: ${frame[3]}`));
      else if (frame[0] !== 3) pending.reject(new Error(`${pending.action} returned unexpected frame type ${frame[0]}`));
      else pending.resolve(frame[2]);
    });
    socket.on('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`${pending.action} interrupted by socket close`));
      }
      this.pending.clear();
    });
    this.socket = socket;
    await once(socket, 'open');
  }

  call(action, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`${this.code}: cannot send ${action} on a closed socket`));
    }
    const messageId = `${++this.sequence}-${randomUUID()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        reject(new Error(`${this.code}: ${action} timed out`));
      }, 15000);
      this.pending.set(messageId, { action, resolve, reject, timer });
      this.socket.send(JSON.stringify([2, messageId, action, payload]), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(messageId);
        reject(error);
      });
    });
  }

  async boot() {
    const result = await this.call('BootNotification', {
      chargePointVendor: 'CSMS-S21-Test',
      chargePointModel: 'Virtual-Reconnect',
      chargePointSerialNumber: this.code,
    });
    if (result.status !== 'Accepted') throw new Error(`${this.code}: BootNotification was ${result.status}`);
    clearInterval(this.heartbeatTimer);
    const intervalMs = Math.min(15000, Math.max(1000, Number(result.interval) * 500));
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) this.call('Heartbeat', {}).catch(() => {});
    }, intervalMs);
    this.heartbeatTimer.unref?.();
  }

  status(connectorId, status) {
    return this.call('StatusNotification', {
      connectorId,
      status,
      errorCode: 'NoError',
      timestamp: new Date().toISOString(),
    });
  }

  drop() {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
  }

  async close() {
    clearInterval(this.heartbeatTimer);
    if (!this.socket || this.socket.readyState === WebSocket.CLOSED) return;
    if (this.socket.readyState === WebSocket.OPEN) {
      const closed = once(this.socket, 'close');
      this.socket.close();
      await Promise.race([closed, sleep(3000)]);
    }
    if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
  }
}

function makeSample(meterWh, timestamp) {
  return {
    timestamp,
    sampledValue: [{
      value: String(meterWh),
      context: SAMPLE_CONTEXT,
      measurand: SAMPLE_MEASURAND,
      unit: 'Wh',
    }],
  };
}

async function runSession(point, run, index, disconnectCount) {
  await pacedConnect(point);
  await point.boot();
  const idTag = point.idTag;
  await point.call('Authorize', { idTag });
  await point.status(CONNECTOR_NO, 'Preparing');

  const meterStart = 100000 + run * 1000000 + index * 10000;
  const startedAt = new Date().toISOString();
  const start = await point.call('StartTransaction', {
    connectorId: CONNECTOR_NO,
    idTag,
    meterStart,
    timestamp: startedAt,
  });
  if (!Number.isSafeInteger(start.transactionId)) throw new Error(`${point.code}: StartTransaction did not return a transactionId`);
  const transactionId = start.transactionId;
  await point.status(CONNECTOR_NO, 'Charging');

  let meterWh = meterStart;
  let lastSampleAt = Date.now();
  const samples = [];
  async function recordSample() {
    meterWh += WH_PER_STEP;
    lastSampleAt = Math.max(Date.now(), lastSampleAt + 1000);
    const sample = makeSample(meterWh, new Date(lastSampleAt).toISOString());
    samples.push(sample);
    await point.call('MeterValues', {
      connectorId: CONNECTOR_NO,
      transactionId,
      meterValue: [sample],
    });
  }

  for (let attempt = 0; attempt < disconnectCount; attempt += 1) {
    await sleep(randomInt(25, 175));
    await recordSample();
    const oldSocket = point.socket;
    const closed = once(oldSocket, 'close');
    point.drop();
    await Promise.race([closed, sleep(5000)]);
    if (oldSocket.readyState !== WebSocket.CLOSED) throw new Error(`${point.code}: old socket did not close`);

    let reconnected = false;
    for (let retry = 0; retry < 6 && !reconnected; retry += 1) {
      try {
        await pacedConnect(point);
        await point.boot();
        await point.status(CONNECTOR_NO, 'Charging');
        reconnected = true;
      } catch (error) {
        point.drop();
        if (retry === 5) throw new Error(`${point.code}: reconnect failed: ${error.message}`);
        await sleep(100 * (retry + 1));
      }
    }
    await recordSample();
  }

  await recordSample();
  const stoppedAt = samples[samples.length - 1].timestamp;
  await point.call('StopTransaction', {
    transactionId,
    meterStop: meterWh,
    timestamp: stoppedAt,
    reason: 'Local',
    transactionData: samples,
  });

  return {
    code: point.code,
    transactionId,
    disconnectCount,
    meterStart,
    meterStop: meterWh,
    expectedKwh: (meterWh - meterStart) / 1000,
    firstSampleAt: samples[0].timestamp,
    stoppedAt,
  };
}

async function readSessionResults(db, sessionResults, codes) {
  const transactions = sessionResults.map((session) => session.transactionId);
  const result = await db.query(
    `SELECT cs.id, cs.charge_point_id, cp.code, cs.status, cs.meter_start, cs.meter_stop,
            cs.stopped_at, cs.needs_review,
            COUNT(mv.id)::int AS meter_sample_count,
            MIN(mv.reported_at) AS first_sample_at,
            MAX(mv.reported_at) AS last_sample_at
     FROM charging_sessions cs
     JOIN charge_points cp ON cp.id = cs.charge_point_id
     LEFT JOIN meter_values mv ON mv.session_id = cs.id
       AND mv.measurand = $3
       AND mv.context = $4
     WHERE cs.id = ANY($1::int[])
       AND cp.code = ANY($2::text[])
     GROUP BY cs.id, cp.code`,
    [transactions, codes, SAMPLE_MEASURAND, SAMPLE_CONTEXT]
  );
  const byId = new Map(result.rows.map((row) => [Number(row.id), row]));
  return sessionResults.map((expected) => {
    const session = byId.get(expected.transactionId);
    if (!session) throw new Error(`${expected.code}: no persisted session found for transaction ${expected.transactionId}`);
    const systemKwh = session.meter_stop === null
      ? null
      : (Number(session.meter_stop) - Number(session.meter_start)) / 1000;
    const passed = session.status === 'COMPLETED'
      && !session.needs_review
      && Number(session.meter_start) === expected.meterStart
      && Number(session.meter_stop) === expected.meterStop
      && systemKwh === expected.expectedKwh
      && session.stopped_at !== null
      && new Date(session.stopped_at).toISOString() === expected.stoppedAt
      && session.first_sample_at !== null
      && new Date(session.first_sample_at).toISOString() === expected.firstSampleAt
      && session.last_sample_at !== null
      && new Date(session.last_sample_at).toISOString() === expected.stoppedAt
      && Number(session.meter_sample_count) === expected.disconnectCount * 2 + 1;
    return { ...expected, systemKwh, sampleCount: Number(session.meter_sample_count), stoppedAt: session.stopped_at, status: session.status, passed };
  });
}

function printTable(rows, run, runCount) {
  console.log(`\nRun ${run}/${runCount}`);
  const headers = ['Trụ', 'Tx', 'Ngắt', 'Start Wh', 'Stop Wh', 'Simulator kWh', 'CSMS kWh', 'Mẫu', 'Kết quả'];
  const values = rows.map((row) => [
    row.code,
    String(row.transactionId),
    String(row.disconnectCount),
    String(row.meterStart),
    String(row.meterStop),
    row.expectedKwh.toFixed(3),
    row.systemKwh === null ? '-' : row.systemKwh.toFixed(3),
    String(row.sampleCount),
    row.passed ? 'PASS' : 'FAIL',
  ]);
  const widths = headers.map((header, column) => Math.max(header.length, ...values.map((row) => row[column].length)));
  const line = (row) => `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`;
  console.log(line(headers));
  console.log(`|-${widths.map((width) => '-'.repeat(width)).join('-|-')}-|`);
  values.forEach((row) => console.log(line(row)));
  console.log(`Run result: ${rows.filter((row) => row.passed).length}/${rows.length} sessions matched`);
}

async function main() {
  const options = optionsFromArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  const api = createApi(options.url);
  await api.login(requireAdminCredentials());
  const { codes } = await ensureFleet(api, options);
  const db = new Client({ connectionString: process.env.STAGING_DATABASE_URL, connectionTimeoutMillis: 5000 });
  const points = [];

  await db.connect();
  try {
    const fixtureState = await db.query(
      `SELECT cp.code, s.status AS station_status, s.locked_at,
              c.connector_no,
              EXISTS (
                SELECT 1 FROM charging_sessions cs
                WHERE cs.connector_id = c.id AND cs.status = 'CHARGING'
              ) AS has_active_session
       FROM charge_points cp
       JOIN stations s ON s.id = cp.station_id
       JOIN connectors c ON c.charge_point_id = cp.id AND c.connector_no = $2
       WHERE cp.code = ANY($1::text[])`,
      [codes, CONNECTOR_NO]
    );
    if (fixtureState.rowCount !== options.count) {
      throw new Error(`Expected ${options.count} provisioned connectors; found ${fixtureState.rowCount}`);
    }
    const invalidFixtures = fixtureState.rows.filter((row) => row.station_status !== 'ACTIVE' || row.locked_at || row.has_active_session);
    if (invalidFixtures.length) {
      throw new Error(`Fixture stations must be ACTIVE/unlocked and connectors idle: ${invalidFixtures.map((row) => row.code).join(', ')}`);
    }
    const tag = await db.query(
      `SELECT 1 FROM id_tags WHERE UPPER(tag) = UPPER($1) AND status = 'ACTIVE'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       LIMIT 1`,
      [options.tag]
    );
    if (!tag.rowCount) throw new Error(`Active, unexpired OCPP idTag not found: ${options.tag}`);

    const wsBase = options.url.replace(/^http/i, 'ws').replace(/\/+$/, '');
    for (let run = 1; run <= options.runs; run += 1) {
      const currentPoints = codes.map((code, index) => {
        const point = new VirtualChargePoint(code, wsBase);
        point.idTag = options.tag;
        return { point, index };
      });
      points.push(...currentPoints.map(({ point }) => point));

      const settlements = await Promise.allSettled(currentPoints.map(async ({ point, index }) => {
        const [minDisconnects, maxDisconnects] = options.disconnects;
        const disconnectCount = randomInt(minDisconnects, maxDisconnects + 1);
        return runSession(point, run, index, disconnectCount);
      }));
      const failures = settlements.filter((settlement) => settlement.status === 'rejected');
      if (failures.length) {
        throw new Error(failures.map((settlement) => settlement.reason?.message || String(settlement.reason)).join('\n'));
      }
      const simulatorResults = settlements.map((settlement) => settlement.value);
      const verified = await readSessionResults(db, simulatorResults, codes);
      printTable(verified, run, options.runs);
      if (verified.some((row) => !row.passed)) {
        throw new Error(`Run ${run} failed: simulator and CSMS records did not match`);
      }
      await Promise.all(currentPoints.map(({ point }) => point.close()));
      points.splice(0, points.length);
    }
    console.log(`PASS: ${options.count}/${options.count} sessions matched in ${options.runs}/${options.runs} runs`);
  } finally {
    points.forEach((point) => point.drop());
    await db.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('S-21 reconnect fleet verification failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { optionsFromArgs, makeSample, readSessionResults };
