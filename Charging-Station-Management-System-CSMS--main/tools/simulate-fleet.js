// Mô phỏng đội trụ sạc ảo qua OCPP 1.6J để đo tải/độ trễ và kiểm tra F8–F11.
// Thông tin đăng nhập ADMIN đọc từ ADMIN_EMAIL / ADMIN_PASSWORD. Chỉ chạy trên DB thử (tên kết thúc _test hoặc _chk).
// Ví dụ: ADMIN_EMAIL=... ADMIN_PASSWORD=... node tools/simulate-fleet.js --url http://localhost:3000 --count 50
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { WebSocket } = require('../backend/node_modules/ws');
const { requireAdminCredentials } = require('./lib/admin-credentials');
const { percentile, backoffDelay, parseArgs } = require('./lib/fleet-stats');

const THRESHOLDS = { p95Ms: 500, sseMs: 1000, snapshotMs: 2000, skewMs: 2000, lockCloseMs: 5000, reconnectMs: 15000 };
const CHARGE_POINTS_PER_STATION = 5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createApi(baseUrl) {
  let cookie;
  async function request(method, route, body, headers = {}) {
    const response = await fetch(new URL(route, baseUrl), {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* không phải JSON */ }
    return { status: response.status, body: json, headers: response.headers };
  }
  return {
    request,
    cookie: () => cookie,
    async login({ email, password }) {
      const result = await request('POST', '/api/auth/login', { email, password });
      if (result.status !== 200) throw new Error(`Đăng nhập thất bại: HTTP ${result.status}`);
      cookie = result.headers.get('set-cookie')?.split(';', 1)[0];
      if (!cookie) throw new Error('Đăng nhập không trả cookie');
    },
  };
}

function codeOf(prefix, index) { return `${prefix}${String(index + 1).padStart(3, '0')}`; }

async function ensureFleet(api, options) {
  const wanted = Array.from({ length: options.count }, (_, i) => codeOf(options.prefix, i));
  const existing = (await api.request('GET', '/api/charge-points')).body ?? [];
  const known = new Set(existing.map((point) => point.code));
  const stations = (await api.request('GET', '/api/stations')).body ?? [];
  const stationByName = new Map(stations.map((station) => [station.name, station.id]));
  const stationIds = [];
  for (let first = 0; first < wanted.length; first += CHARGE_POINTS_PER_STATION) {
    const name = `${options.prefix}STATION-${Math.floor(first / CHARGE_POINTS_PER_STATION) + 1}`;
    let id = stationByName.get(name);
    if (!id) {
      const created = await api.request('POST', '/api/stations',
        { name, address: 'Mô phỏng', latitude: 21.03, longitude: 105.85 }, { 'Idempotency-Key': randomUUID() });
      if (created.status !== 201) throw new Error(`Không tạo được trạm ${name}: HTTP ${created.status}`);
      id = created.body.id;
    }
    stationIds.push(id);
    for (const code of wanted.slice(first, first + CHARGE_POINTS_PER_STATION)) {
      if (known.has(code)) continue;
      const created = await api.request('POST', `/api/stations/${id}/charge-points`, { code, connector_count: 2, vendor: 'SIM', model: 'SIM-1' });
      if (created.status !== 201) throw new Error(`Không tạo được trụ ${code}: HTTP ${created.status}`);
    }
  }
  return { codes: wanted, stationIds };
}

async function snapshotPoints(api) {
  const started = Date.now();
  const result = await api.request('GET', '/api/fleet-status');
  const elapsed = Date.now() - started;
  const points = (result.body?.stations ?? []).flatMap((station) => station.charge_points.map((point) => ({ ...point, station_id: station.id })));
  return { points, elapsed, byCode: new Map(points.map((point) => [point.code, point])) };
}

class VirtualPoint {
  constructor(code, wsBase, counterIds) {
    this.code = code;
    this.wsBase = wsBase;
    this.counterIds = counterIds;
    this.latencies = [];
    this.errors = 0;
    this.counter = 0;
    this.pending = new Map();
    this.closeCode = null;
  }

  nextId() { return this.counterIds ? String(++this.counter) : randomUUID(); }

  async connect() {
    this.counter = 0;
    this.closeCode = null;
    this.socket = new WebSocket(`${this.wsBase}/ocpp/${this.code}`, ['ocpp1.6']);
    this.socket.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      const waiter = this.pending.get(frame[1]);
      if (waiter) { this.pending.delete(frame[1]); waiter(frame); }
    });
    this.socket.on('close', (code) => { this.closeCode = code; });
    this.socket.on('error', () => {});
    await once(this.socket, 'open');
  }

  call(action, payload, { record = true, timeoutMs = 10000 } = {}) {
    const id = this.nextId();
    const started = process.hrtime.bigint();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); this.errors += 1; reject(new Error(`${action} quá ${timeoutMs} ms`)); }, timeoutMs);
      this.pending.set(id, (frame) => {
        clearTimeout(timer);
        if (record) this.latencies.push(Number(process.hrtime.bigint() - started) / 1e6);
        if (frame[0] === 4) this.errors += 1;
        resolve(frame);
      });
      this.socket.send(JSON.stringify([2, id, action, payload]), (error) => { if (error) { clearTimeout(timer); reject(error); } });
    });
  }

  async boot() {
    const reply = await this.call('BootNotification', { chargePointVendor: 'SIM', chargePointModel: 'SIM-1' }, { record: false });
    if (reply[0] !== 3 || reply[2].status !== 'Accepted') throw new Error(`${this.code}: boot bị từ chối`);
    return reply[2];
  }

  status(connectorId, status, extra = {}) {
    return this.call('StatusNotification', { connectorId, status, errorCode: 'NoError', ...extra });
  }

  async reconnect(maxAttempts = 8) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try { await this.connect(); await this.boot(); return attempt; } catch { this.socket?.terminate(); await sleep(backoffDelay(attempt)); }
    }
    throw new Error(`${this.code}: nối lại thất bại sau ${maxAttempts} lần`);
  }

  drop() { this.socket?.terminate(); }
}

function check(results, name, ok, detail) {
  results.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

async function waitFor(fn, timeoutMs, stepMs = 100) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return Date.now() - started;
    await sleep(stepMs);
  }
  return null;
}

async function openSse(api, baseUrl) {
  const controller = new AbortController();
  const response = await fetch(new URL('/api/fleet-status/events', baseUrl), { headers: { Cookie: api.cookie(), Accept: 'text/event-stream' }, signal: controller.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = { count: 0 };
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        events.count += (decoder.decode(value).match(/^data:/gm) ?? []).length;
      }
    } catch { /* đóng */ }
  })();
  return { events, close: () => controller.abort() };
}

const scenarios = {
  async load({ api, points, options, results, baseUrl }) {
    const sse = await openSse(api, baseUrl);
    const deadline = Date.now() + options.duration * 1000;
    await Promise.all(points.map(async (point, index) => {
      await sleep((index * 1000) / points.length);
      while (Date.now() < deadline) {
        await point.call('Heartbeat', {}).catch(() => {});
        await point.status(1 + (index % 2), index % 3 === 0 ? 'Charging' : 'Available').catch(() => {});
        await sleep(1000);
      }
    }));
    const all = points.flatMap((point) => point.latencies);
    const stats = { calls: all.length, p50: percentile(all, 50), p95: percentile(all, 95), p99: percentile(all, 99), errors: points.reduce((sum, p) => sum + p.errors, 0) };
    results.metrics.latencyMs = stats;
    check(results, 'load: p95 OCPP < 500 ms', stats.p95 !== null && stats.p95 < THRESHOLDS.p95Ms, `${stats.calls} lời gọi, p50=${stats.p50?.toFixed(1)} p95=${stats.p95?.toFixed(1)} p99=${stats.p99?.toFixed(1)} ms, lỗi=${stats.errors}`);
    const snap = await snapshotPoints(api);
    results.metrics.snapshotMs = snap.elapsed;
    check(results, `load: snapshot ${snap.points.length} trụ < 2 s`, snap.elapsed < THRESHOLDS.snapshotMs, `${snap.elapsed} ms`);

    const probe = points[0];
    const before = sse.events.count;
    const sentAt = Date.now();
    await probe.status(1, probe.latencies.length % 2 ? 'Faulted' : 'Preparing', probe.latencies.length % 2 ? { errorCode: 'GroundFailure' } : {});
    const sseMs = await waitFor(() => sse.events.count > before, 5000, 20);
    results.metrics.sseMs = sseMs === null ? null : Date.now() - sentAt;
    check(results, 'load: SSE tới trình duyệt ≤ 1 s sau StatusNotification', sseMs !== null && Date.now() - sentAt <= THRESHOLDS.sseMs, sseMs === null ? 'không nhận được sự kiện' : `${Date.now() - sentAt} ms`);
    sse.close();
  },

  async skew({ api, points, results }) {
    const sentAt = Date.now();
    await Promise.all(points.map((point) => point.call('Heartbeat', {})));
    const snap = await snapshotPoints(api);
    const skews = points.map((point) => {
      const seen = snap.byCode.get(point.code)?.last_seen_at;
      return seen ? Math.abs(new Date(seen).getTime() - sentAt) : Infinity;
    });
    const max = Math.max(...skews);
    results.metrics.lastSeenSkewMs = max;
    check(results, 'skew: lệch last_seen_at so với lúc gửi Heartbeat < 2 s', max < THRESHOLDS.skewMs, `lệch lớn nhất ${Number.isFinite(max) ? max : 'không đọc được'} ms trên ${points.length} trụ`);
  },

  async clock({ api, points, results }) {
    const future = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    const sentAt = Date.now();
    const replies = await Promise.all(points.map((point) => point.status(1, 'Available', { timestamp: future })));
    const accepted = replies.filter((frame) => frame[0] === 3).length;
    const snap = await snapshotPoints(api);
    const max = Math.max(...points.map((point) => {
      const seen = snap.byCode.get(point.code)?.last_seen_at;
      return seen ? Math.abs(new Date(seen).getTime() - sentAt) : Infinity;
    }));
    check(results, 'clock: đồng hồ trụ lệch +5 giờ vẫn được nhận', accepted === points.length, `${accepted}/${points.length} CALLRESULT`);
    check(results, 'clock: last_seen_at dùng giờ máy chủ, không dùng giờ của trụ', max < THRESHOLDS.skewMs, `lệch lớn nhất ${Number.isFinite(max) ? max : 'không đọc được'} ms so với giờ thật`);
  },

  async netcut({ api, points, results }) {
    const cut = points.slice(0, Math.max(1, Math.round(points.length * 0.2)));
    for (const point of cut) await point.status(1, 'Charging');
    const snapBefore = await snapshotPoints(api);
    cut.forEach((point) => point.drop());
    const droppedMs = await waitFor(async () => {
      const snap = await snapshotPoints(api);
      return cut.every((point) => snap.byCode.get(point.code)?.status !== 'ONLINE');
    }, 10000, 200);
    check(results, `netcut: ${cut.length} trụ bị cắt mạng chuyển khỏi ONLINE`, droppedMs !== null, droppedMs === null ? 'vẫn ONLINE sau 10 s' : `${droppedMs} ms`);
    const startedAt = Date.now();
    const attempts = await Promise.all(cut.map((point) => point.reconnect()));
    const recoveredMs = await waitFor(async () => {
      const snap = await snapshotPoints(api);
      return cut.every((point) => snap.byCode.get(point.code)?.status === 'ONLINE');
    }, THRESHOLDS.reconnectMs, 200);
    check(results, 'netcut: nối lại (backoff) và trở về ONLINE', recoveredMs !== null, recoveredMs === null ? 'không ONLINE trở lại' : `${Date.now() - startedAt} ms, số lần thử lớn nhất ${Math.max(...attempts) + 1}`);
    await Promise.all(cut.map((point) => point.call('Heartbeat', {})));
    const after = await snapshotPoints(api);
    const restored = cut.every((point) => {
      const connector = after.byCode.get(point.code)?.connectors.find((c) => c.connector_no === 1);
      const was = snapBefore.byCode.get(point.code)?.connectors.find((c) => c.connector_no === 1);
      return connector && was && connector.status === was.status && connector.status !== 'UNKNOWN';
    });
    check(results, 'netcut: sau Heartbeat đầu nối khôi phục trạng thái trước khi mất kết nối (F9)', restored, restored ? 'khớp trạng thái trước khi cắt' : 'đầu nối không khôi phục');
  },

  async lock({ api, points, results, ids }) {
    const target = ids.stationIds[0];
    const group = points.filter((point) => point.stationId === target);
    if (!group.length) return check(results, 'lock: khoá trạm', false, 'không có trụ nào của trạm đầu tiên');
    const startedAt = Date.now();
    const locked = await api.request('PATCH', `/api/admin/stations/${target}/lock`, { locked: true });
    const closedMs = await waitFor(() => group.every((point) => point.closeCode !== null), THRESHOLDS.lockCloseMs + 2000, 50);
    const elapsed = Date.now() - startedAt;
    check(results, 'lock: khoá trạm đóng mọi socket với mã 1008 trong ≤ 5 s', locked.status === 200 && closedMs !== null && elapsed <= THRESHOLDS.lockCloseMs && group.every((point) => point.closeCode === 1008),
      `HTTP ${locked.status}, ${group.length} socket, mã đóng ${[...new Set(group.map((p) => p.closeCode))].join(',')}, ${elapsed} ms`);
    await api.request('PATCH', `/api/admin/stations/${target}/lock`, { locked: false });
    for (const point of group) await point.reconnect();
  },

  async restart({ api, points, results }) {
    const sample = points.slice(0, Math.min(5, points.length));
    for (const point of sample) { await point.status(2, 'Available'); point.drop(); }
    await sleep(300);
    for (const point of sample) { await point.reconnect(); await point.status(2, 'Faulted', { errorCode: 'GroundFailure' }); }
    const snap = await snapshotPoints(api);
    const applied = sample.filter((point) => snap.byCode.get(point.code)?.connectors.find((c) => c.connector_no === 2)?.ocpp_status === 'Faulted').length;
    check(results, 'restart: trụ khởi động lại, đếm lại messageId từ "1", trạng thái mới vẫn được ghi (F8)', applied === sample.length, `${applied}/${sample.length} trụ ghi Faulted`);
  },
};

function toMarkdown(results, options) {
  const lines = [`# Báo cáo simulate-fleet — ${results.startedAt}`, '',
    `Máy chủ: \`${options.url}\` · số trụ: ${options.count} · kịch bản: ${options.scenarios.join(', ')} · counter-ids: ${options.counterIds}`, '',
    '| Kết quả | Hạng mục | Chi tiết |', '|---|---|---|',
    ...results.checks.map((c) => `| ${c.ok ? 'PASS' : 'FAIL'} | ${c.name} | ${c.detail} |`), '',
    `Tổng: ${results.checks.filter((c) => c.ok).length} PASS, ${results.checks.filter((c) => !c.ok).length} FAIL`, '',
    '```json', JSON.stringify(results.metrics, null, 2), '```', ''];
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const credentials = requireAdminCredentials();
  const baseUrl = options.url;
  const wsBase = baseUrl.replace(/^http/, 'ws');
  const api = createApi(baseUrl);
  await api.login(credentials);
  const results = { startedAt: new Date().toISOString(), checks: [], metrics: {} };

  const ids = await ensureFleet(api, options);
  const snap = await snapshotPoints(api);
  const stationOf = new Map(snap.points.map((point) => [point.code, point.station_id]));
  const counterIds = options.counterIds || options.scenarios.includes('restart');
  const points = ids.codes.map((code) => Object.assign(new VirtualPoint(code, wsBase, counterIds), { stationId: stationOf.get(code) }));
  await Promise.all(points.map(async (point) => { await point.connect(); await point.boot(); }));
  console.log(`Đã nối ${points.length} trụ ảo (tiền tố ${options.prefix})`);

  try {
    for (const name of options.scenarios) {
      console.log(`--- kịch bản: ${name}`);
      await scenarios[name]({ api, points, options, results, baseUrl, ids });
    }
  } finally {
    points.forEach((point) => point.drop());
  }

  fs.mkdirSync(options.out, { recursive: true });
  const stamp = results.startedAt.replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  const base = path.join(options.out, `simulate-fleet-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ options: { ...options }, ...results }, null, 2));
  fs.writeFileSync(`${base}.md`, toMarkdown(results, options));
  const failed = results.checks.filter((c) => !c.ok).length;
  console.log(`Kết quả: ${results.checks.length - failed} PASS, ${failed} FAIL → ${base}.{json,md}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error('simulate-fleet lỗi:', error.message); process.exit(2); });
