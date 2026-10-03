const { once } = require('node:events');
const path = require('node:path');
const { execSync } = require('node:child_process');

const wsPath = path.resolve(__dirname, '../backend/node_modules/ws');
const { WebSocket } = require(wsPath);

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:3000';
const REPO_ROOT = path.resolve(__dirname, '..');

function queryDb(sql) {
  const sanitized = sql.replace(/"/g, '\\"');
  const cmd = `docker compose exec -T db psql -U csms -d csms -t -A -c "${sanitized}"`;
  const stdout = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' });
  return stdout.trim();
}

async function request(pathUrl, options = {}) {
  const url = new URL(pathUrl, BASE_URL);
  const headers = { ...options.headers };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, body: json, text, cookie: res.headers.get('set-cookie') };
}

async function login(email, password = 'demo12345') {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${res.text}`);
  return res.cookie ? res.cookie.split(';')[0] : '';
}

async function connectWs(code) {
  const ws = new WebSocket(`${WS_URL}/ocpp/${encodeURIComponent(code)}`, ['ocpp1.6']);
  await once(ws, 'open');
  return ws;
}

function sendAndReceive(ws, frame) {
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      ws.off('message', onMessage);
      ws.off('error', onError);
      try { resolve(JSON.parse(raw.toString())); } catch (err) { reject(err); }
    };
    const onError = (err) => {
      ws.off('message', onMessage);
      ws.off('error', onError);
      reject(err);
    };
    ws.on('message', onMessage);
    ws.on('error', onError);
    ws.send(JSON.stringify(frame));
  });
}

function createSseClient(cookie) {
  const controller = new AbortController();
  const events = [];
  let headers = null;

  const promise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/fleet-status/events`, {
        headers: { Cookie: cookie, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      headers = res.headers;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let pos;
        while ((pos = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, pos).trim();
          buffer = buffer.slice(pos + 2);
          if (chunk.startsWith('data:')) {
            try {
              events.push(JSON.parse(chunk.slice(5).trim()));
            } catch {}
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') throw e;
    }
  })();

  return {
    getHeaders: () => headers,
    getEvents: () => events,
    close: () => controller.abort(),
  };
}

const results = [];
function record(id, title, status, details = {}) {
  results.push({ id, title, status, ...details });
  console.log(`[${status}] ${id}: ${title}`);
}

async function main() {
  console.log('======================================================================');
  console.log('  KIỂM THỬ XÁC MINH S-11: MÀN HÌNH TRẠNG THÁI MỌI TRỤ & SSE (T-23, T-24, T-25)');
  console.log('======================================================================\n');

  let adminCookie, operatorCookie, owner1Cookie, owner2Cookie, driverCookie;
  try {
    adminCookie = await login('admin@csms.local', 'admin');
    operatorCookie = await login('operator@demo.csms.local');
    owner1Cookie = await login('owner@demo.csms.local');
    owner2Cookie = await login('owner2@demo.csms.local');
    driverCookie = await login('driver@demo.csms.local');
    record('TC-S11-A01', 'Đăng nhập thành công 5 vai trò (ADMIN, OPERATOR, OWNER 1, OWNER 2, DRIVER)', 'PASS');
  } catch (err) {
    record('TC-S11-A01', 'Đăng nhập', 'FAIL', { error: err.message });
    return;
  }

  // Giai đoạn B: T-23
  try {
    const t0 = performance.now();
    const adminSnap = await request('/api/fleet-status', { cookie: adminCookie });
    const dur = performance.now() - t0;
    const hasStations = Array.isArray(adminSnap.body?.stations) && adminSnap.body.stations.length > 0;
    const firstSt = adminSnap.body.stations[0];
    const is3Tier = hasStations && firstSt.charge_points?.length > 0 && firstSt.charge_points[0].connectors?.length > 0;
    record('TC-S11-B01', `ADMIN truy vấn cây 3 tầng (Trạm-Trụ-Đầu nối) thành công trong ${dur.toFixed(1)}ms (< 200ms)`, (adminSnap.status === 200 && is3Tier && dur < 200) ? 'PASS' : 'FAIL', {
      durationMs: dur,
      stationsCount: adminSnap.body?.stations?.length
    });
  } catch (err) {
    record('TC-S11-B01', 'ADMIN snapshot', 'FAIL', { error: err.message });
  }

  try {
    const opSnap = await request('/api/fleet-status', { cookie: operatorCookie });
    const adminSnap = await request('/api/fleet-status', { cookie: adminCookie });
    const match = opSnap.body?.stations?.length === adminSnap.body?.stations?.length;
    record('TC-S11-B02', 'OPERATOR thấy toàn bộ trạm trong hệ thống tương tự ADMIN', (opSnap.status === 200 && match) ? 'PASS' : 'FAIL');
  } catch (err) {
    record('TC-S11-B02', 'OPERATOR snapshot', 'FAIL', { error: err.message });
  }

  try {
    const o1Snap = await request('/api/fleet-status', { cookie: owner1Cookie });
    const o2Snap = await request('/api/fleet-status', { cookie: owner2Cookie });
    const o1Ids = o1Snap.body?.stations?.map(s => s.id) || [];
    const o2Ids = o2Snap.body?.stations?.map(s => s.id) || [];
    const overlap = o1Ids.some(id => o2Ids.includes(id));
    record('TC-S11-B03', 'Phân lập dữ liệu đa chủ trạm: OWNER 1 và OWNER 2 chỉ thấy trạm của riêng mình, không chồng lấn', (!overlap && o1Ids.length > 0 && o2Ids.length > 0) ? 'PASS' : 'FAIL', {
      owner1Stations: o1Ids, owner2Stations: o2Ids
    });
  } catch (err) {
    record('TC-S11-B03', 'Phân lập dữ liệu đa chủ trạm', 'FAIL', { error: err.message });
  }

  try {
    const drSnap = await request('/api/fleet-status', { cookie: driverCookie });
    record('TC-S11-B04', 'DRIVER không có quyền stations:read bị từ chối với HTTP 403 Forbidden', drSnap.status === 403 ? 'PASS' : 'FAIL', {
      statusCode: drSnap.status
    });
  } catch (err) {
    record('TC-S11-B04', 'DRIVER snapshot', 'FAIL', { error: err.message });
  }

  try {
    queryDb("UPDATE charge_points SET last_seen_at = CURRENT_TIMESTAMP, heartbeat_interval = 60 WHERE code = 'DEMO-ST01-CP1';");
    queryDb("UPDATE charge_points SET last_seen_at = CURRENT_TIMESTAMP - INTERVAL '3 minutes', heartbeat_interval = 60 WHERE code = 'DEMO-ST01-CP2';");
    const snap = await request('/api/fleet-status', { cookie: adminCookie });
    const st1 = snap.body.stations.find(s => s.charge_points.some(cp => cp.code === 'DEMO-ST01-CP1'));
    const cp1 = st1?.charge_points.find(cp => cp.code === 'DEMO-ST01-CP1');
    const cp2 = st1?.charge_points.find(cp => cp.code === 'DEMO-ST01-CP2');
    record('TC-S11-B05', 'Suy diễn trạng thái ngoại tuyến: last_seen_at <= 2*interval -> offline = true', (cp1?.offline === false && cp2?.offline === true) ? 'PASS' : 'FAIL', {
      cp1Offline: cp1?.offline, cp2Offline: cp2?.offline
    });
  } catch (err) {
    record('TC-S11-B05', 'Suy diễn ngoại tuyến', 'FAIL', { error: err.message });
  }

  // Giai đoạn C: T-25 SSE
  let sseAdmin, sseOwner1, sseOwner2;
  try {
    sseAdmin = createSseClient(adminCookie);
    sseOwner1 = createSseClient(owner1Cookie);
    sseOwner2 = createSseClient(owner2Cookie);

    await new Promise(r => setTimeout(r, 400));
    const h = sseAdmin.getHeaders();
    const isSseHeaders = h?.get('content-type')?.includes('text/event-stream') && h?.get('cache-control')?.includes('no-cache') && h?.get('x-accel-buffering') === 'no';
    record('TC-S11-C01', 'Kênh SSE GET /api/fleet-status/events mở thành công với các header chuẩn (text/event-stream, no-cache, X-Accel-Buffering: no)', isSseHeaders ? 'PASS' : 'FAIL');

    const cpCode = 'DEMO-ST01-CP1';
    const ws = await connectWs(cpCode);
    await sendAndReceive(ws, [2, 'boot-sse', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]);

    const tPushStart = performance.now();
    await sendAndReceive(ws, [2, 'stat-sse-1', 'StatusNotification', { connectorId: 1, status: 'Preparing', errorCode: 'NoError' }]);

    let latency = 0;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (sseAdmin.getEvents().length > 0 && sseOwner1.getEvents().length > 0) {
        latency = performance.now() - tPushStart;
        break;
      }
      await new Promise(r => setTimeout(r, 20));
    }

    const adminEvents = sseAdmin.getEvents();
    const owner1Events = sseOwner1.getEvents();
    const owner2Events = sseOwner2.getEvents();
    ws.close();

    record('TC-S11-C02', `Sự kiện StatusNotification đẩy qua SSE tức thời trong ${latency.toFixed(1)}ms (<= 1000ms)`, (adminEvents.length > 0 && latency <= 1000) ? 'PASS' : 'FAIL', {
      latencyMs: latency,
      event: adminEvents[0]
    });

    record('TC-S11-C03', 'Phân quyền kênh đẩy SSE: Chủ trạm 1 nhận sự kiện trạm mình, Chủ trạm 2 tuyệt đối không bị lộ sự kiện', (owner1Events.length > 0 && owner2Events.length === 0) ? 'PASS' : 'FAIL', {
      owner1Events: owner1Events.length,
      owner2Events: owner2Events.length
    });
  } catch (err) {
    record('TC-S11-C-ERR', 'Lỗi kiểm thử SSE', 'FAIL', { error: err.message });
  } finally {
    if (sseAdmin) sseAdmin.close();
    if (sseOwner1) sseOwner1.close();
    if (sseOwner2) sseOwner2.close();
  }

  console.log('\n======================================================================');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`TỔNG KẾT: ${results.length} Test Cases | PASS: ${pass} | FAIL: ${fail}`);
  console.log('======================================================================\n');

  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
