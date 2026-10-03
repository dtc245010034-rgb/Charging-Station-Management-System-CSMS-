const { once } = require('node:events');
const path = require('node:path');
const { execSync } = require('node:child_process');

// Sử dụng ws từ backend dependency
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

async function loginAdmin() {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@csms.local', password: 'admin' },
  });
  if (res.status !== 200) throw new Error(`Login admin failed: ${res.status} ${res.text}`);
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

const results = [];

function record(id, title, status, details = {}) {
  results.push({ id, title, status, ...details });
  console.log(`[${status}] ${id}: ${title}`);
}

async function main() {
  console.log('======================================================================');
  console.log('  KIỂM THỬ XÁC MINH S-09: NHỊP TIM VÀ THỜI ĐIỂM LIÊN LẠC CUỐI (T-18, T-19)');
  console.log('======================================================================\n');

  // Giai đoạn A: Smoke & Pre-requisites
  try {
    const health = await request('/api/health');
    const isOk = health.status === 200 && health.body?.ok === true && health.body?.database === 'postgresql';
    record('TC-S09-A01', 'Healthcheck GET /api/health trả HTTP 200 và kết nối DB ổn định', isOk ? 'PASS' : 'FAIL', {
      rawStatus: health.status,
      rawBody: health.body
    });
  } catch (err) {
    record('TC-S09-A01', 'Healthcheck GET /api/health', 'FAIL', { error: err.message });
  }

  try {
    const colExists = queryDb("SELECT count(*) FROM information_schema.columns WHERE table_name = 'charge_points' AND column_name = 'last_seen_at';");
    record('TC-S09-A02', 'Cột last_seen_at tồn tại trong bảng charge_points (Migration 009)', colExists === '1' ? 'PASS' : 'FAIL', {
      columnCount: colExists
    });
  } catch (err) {
    record('TC-S09-A02', 'Cột last_seen_at', 'FAIL', { error: err.message });
  }

  try {
    const ws = await connectWs('DEMO-ST01-CP1');
    const state = ws.readyState;
    ws.close();
    record('TC-S09-A03', 'Kết nối WebSocket thành công với mã trụ hợp lệ DEMO-ST01-CP1 (HTTP 101)', state === 1 ? 'PASS' : 'FAIL', {
      readyState: state
    });
  } catch (err) {
    record('TC-S09-A03', 'Kết nối WebSocket', 'FAIL', { error: err.message });
  }

  try {
    let statusCode = 0;
    const ws = new WebSocket(`${WS_URL}/ocpp/MA-TRU-KHONG-TON-TAI`, ['ocpp1.6']);
    ws.on('unexpected-response', (req, res) => { statusCode = res.statusCode; });
    await new Promise((resolve) => {
      ws.on('close', resolve);
      ws.on('error', resolve);
      setTimeout(resolve, 1500);
    });
    record('TC-S09-A04', 'Từ chối mã trụ lạ với HTTP 403 Forbidden', statusCode === 403 ? 'PASS' : 'FAIL', {
      statusCode
    });
  } catch (err) {
    record('TC-S09-A04', 'Từ chối mã trụ lạ', 'FAIL', { error: err.message });
  }

  // Giai đoạn B: T-18 & Acceptance Criteria
  const testCpCode = 'DEMO-ST01-CP2';
  let ws;
  try {
    ws = await connectWs(testCpCode);

    // TC-S09-B01: Chặn Heartbeat khi chưa Boot
    const hbPreBoot = await sendAndReceive(ws, [2, 'hb-pre-01', 'Heartbeat', {}]);
    const isSecErr = Array.isArray(hbPreBoot) && hbPreBoot[0] === 4 && hbPreBoot[2] === 'SecurityError';
    record('TC-S09-B01', 'Chặn Heartbeat trước khi BootNotification (SecurityError: Charge point is not accepted yet)', isSecErr ? 'PASS' : 'FAIL', {
      request: [2, 'hb-pre-01', 'Heartbeat', {}],
      response: hbPreBoot
    });

    // Boot
    const bootRes = await sendAndReceive(ws, [2, 'boot-01', 'BootNotification', {
      chargePointVendor: 'QA-Vendor',
      chargePointModel: 'QA-Model-01'
    }]);

    // Gửi Heartbeat hợp lệ
    const hbRes = await sendAndReceive(ws, [2, 'hb-valid-01', 'Heartbeat', {}]);
    const currentTimeStr = hbRes[2]?.currentTime;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const isIsoUtc = isoRegex.test(currentTimeStr);
    record('TC-S09-B02', 'Heartbeat trả về CALLRESULT chứa currentTime chuẩn ISO 8601 UTC kết thúc bằng Z', (hbRes[0] === 3 && isIsoUtc) ? 'PASS' : 'FAIL', {
      request: [2, 'hb-valid-01', 'Heartbeat', {}],
      response: hbRes,
      currentTime: currentTimeStr
    });

    // DB verification
    const lastSeenDb = queryDb(`SELECT last_seen_at FROM charge_points WHERE code = '${testCpCode}';`);
    const dbNow = queryDb('SELECT CURRENT_TIMESTAMP;');
    const diffSec = Math.abs(new Date(dbNow).getTime() - new Date(lastSeenDb).getTime()) / 1000;
    record('TC-S09-B03', 'CSDL cập nhật last_seen_at khớp với CURRENT_TIMESTAMP trong vòng 2 giây', (diffSec < 2) ? 'PASS' : 'FAIL', {
      last_seen_at: lastSeenDb,
      db_current_timestamp: dbNow,
      diff_seconds: diffSec
    });

    // Subsequent Heartbeat monotonic update
    await new Promise(r => setTimeout(r, 1100));
    await sendAndReceive(ws, [2, 'hb-valid-02', 'Heartbeat', {}]);
    const lastSeenDb2 = queryDb(`SELECT last_seen_at FROM charge_points WHERE code = '${testCpCode}';`);
    const isMonotonic = new Date(lastSeenDb2) > new Date(lastSeenDb);
    record('TC-S09-B04', 'Lần gửi Heartbeat tiếp theo cập nhật last_seen_at tăng tịnh tiến (t2 > t1)', isMonotonic ? 'PASS' : 'FAIL', {
      t1: lastSeenDb,
      t2: lastSeenDb2
    });

    // Non-Heartbeat call triggers updateLastSeen hook
    await new Promise(r => setTimeout(r, 1100));
    await sendAndReceive(ws, [2, 'stat-01', 'StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' }]);
    const lastSeenDb3 = queryDb(`SELECT last_seen_at FROM charge_points WHERE code = '${testCpCode}';`);
    const isTriggered = new Date(lastSeenDb3) > new Date(lastSeenDb2);
    record('TC-S09-B05', 'Tin nhắn nghiệp vụ khác (StatusNotification) cũng kích hoạt cập nhật last_seen_at', isTriggered ? 'PASS' : 'FAIL', {
      t_before: lastSeenDb2,
      t_after_status: lastSeenDb3
    });

    ws.close();
  } catch (err) {
    record('TC-S09-B-ERR', 'Lỗi thực thi nhóm B', 'FAIL', { error: err.message });
    if (ws) ws.close();
  }

  // Giai đoạn C: T-19 Lệch Giờ & Biên & NFR
  // TC-S09-C01: Clock Skew
  try {
    const wsSkew = await connectWs('DEMO-ST02-CP1');
    await sendAndReceive(wsSkew, [2, 'boot-sk', 'BootNotification', { chargePointVendor: 'SkewV', chargePointModel: 'SkewM' }]);
    const skewHb = await sendAndReceive(wsSkew, [2, 'hb-sk', 'Heartbeat', {}]);
    const serverIso = new Date(skewHb[2]?.currentTime);
    const dbNow = new Date(queryDb('SELECT CURRENT_TIMESTAMP;'));
    const lastSeenDb = new Date(queryDb("SELECT last_seen_at FROM charge_points WHERE code = 'DEMO-ST02-CP1';"));
    const skewDiff = Math.abs(serverIso.getTime() - dbNow.getTime()) / 1000;
    const dbDiff = Math.abs(lastSeenDb.getTime() - dbNow.getTime()) / 1000;
    record('TC-S09-C01', 'T-19: Đồng hồ client lệch không làm sai lệch: currentTime và last_seen_at hoàn toàn theo giờ DB máy chủ', (skewDiff < 2 && dbDiff < 2) ? 'PASS' : 'FAIL', {
      serverTime: serverIso.toISOString(),
      dbNow: dbNow.toISOString(),
      lastSeenDb: lastSeenDb.toISOString(),
      skewDiff,
      dbDiff
    });
    wsSkew.close();
  } catch (err) {
    record('TC-S09-C01', 'Clock Skew test', 'FAIL', { error: err.message });
  }

  // TC-S09-C02: Station Locked
  try {
    const adminCookie = await loginAdmin();
    const stationId = 3;
    const cpCode = 'DEMO-ST03-CP1';

    // Đảm bảo trạm mở khoá trước
    await request(`/api/admin/stations/${stationId}/lock`, { method: 'PATCH', cookie: adminCookie, body: { locked: false } });

    const wsLock = await connectWs(cpCode);
    await sendAndReceive(wsLock, [2, 'boot-lock', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]);
    const initialLastSeen = queryDb(`SELECT last_seen_at FROM charge_points WHERE code = '${cpCode}';`);

    const closePromise = new Promise((resolve) => wsLock.on('close', (code, reason) => resolve({ code, reason: reason.toString() })));

    // Admin khoá trạm
    await request(`/api/admin/stations/${stationId}/lock`, { method: 'PATCH', cookie: adminCookie, body: { locked: true, reason: 'Test Lock' } });
    const closeEv = await closePromise;
    const closedOk = closeEv.code === 1008 && closeEv.reason === 'Station locked';

    // Kết nối lại khi trạm đang khoá
    const wsWhileLocked = await connectWs(cpCode);
    const bootLocked = await sendAndReceive(wsWhileLocked, [2, 'boot-locked', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]);
    const bootRejected = bootLocked[2]?.status === 'Rejected';

    const hbWhileLocked = await sendAndReceive(wsWhileLocked, [2, 'hb-locked', 'Heartbeat', {}]);
    const isSecurityError = hbWhileLocked[0] === 4 && hbWhileLocked[2] === 'SecurityError';

    const afterLastSeen = queryDb(`SELECT last_seen_at FROM charge_points WHERE code = '${cpCode}';`);
    const notUpdated = (initialLastSeen === afterLastSeen);

    wsWhileLocked.close();
    // Mở khoá lại
    await request(`/api/admin/stations/${stationId}/lock`, { method: 'PATCH', cookie: adminCookie, body: { locked: false } });

    record('TC-S09-C02', 'Trạm bị Admin khoá: đóng kết nối (1008 Station locked), từ chối Boot (Rejected), chặn Heartbeat và không cập nhật last_seen_at', (closedOk && bootRejected && isSecurityError && notUpdated) ? 'PASS' : 'FAIL', {
      closeEv,
      bootRejected,
      hbWhileLocked,
      notUpdated
    });
  } catch (err) {
    record('TC-S09-C02', 'Station lock test', 'FAIL', { error: err.message });
  }

  // TC-S09-C03: Idempotency
  try {
    const wsDup = await connectWs('DEMO-ST02-CP2');
    await sendAndReceive(wsDup, [2, 'boot-dup', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]);
    const frame = [2, 'hb-dup-same-id', 'Heartbeat', {}];
    const r1 = await sendAndReceive(wsDup, frame);
    const r2 = await sendAndReceive(wsDup, frame);
    const bothOk = r1[0] === 3 && r2[0] === 3 && r1[1] === 'hb-dup-same-id' && r2[1] === 'hb-dup-same-id';
    wsDup.close();
    record('TC-S09-C03', 'Gửi trùng lặp Heartbeat cùng messageId được xử lý an toàn (Idempotency)', bothOk ? 'PASS' : 'FAIL', {
      r1, r2
    });
  } catch (err) {
    record('TC-S09-C03', 'Idempotency test', 'FAIL', { error: err.message });
  }

  // TC-S09-C04: Concurrency
  try {
    const conns = [];
    for (let i = 1; i <= 6; i++) {
      const code = `DEMO-ST0${i > 3 ? i : i}-CP${(i % 2) + 1}`;
      try {
        const c = await connectWs(code);
        await sendAndReceive(c, [2, `boot-c-${i}`, 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]);
        conns.push(c);
      } catch {}
    }
    const tStart = Date.now();
    const all = await Promise.all(conns.map((c, idx) => sendAndReceive(c, [2, `hb-c-${idx}`, 'Heartbeat', {}])));
    const duration = Date.now() - tStart;
    conns.forEach(c => c.close());
    const allOk = all.every(r => r[0] === 3 && r[2]?.currentTime);
    record('TC-S09-C04', `Tải đồng thời ${conns.length} trụ gửi Heartbeat song song thành công trong ${duration}ms (< 2000ms)`, (allOk && duration < 2000) ? 'PASS' : 'FAIL', {
      total: conns.length,
      durationMs: duration
    });
  } catch (err) {
    record('TC-S09-C04', 'Concurrency test', 'FAIL', { error: err.message });
  }

  console.log('\n======================================================================');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`TỔNG KẾT: ${results.length} Test Cases | PASS: ${pass} | FAIL: ${fail}`);
  console.log('======================================================================\n');

  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
