const { once } = require('node:events');
const { WebSocket } = require('ws');
const { execSync } = require('node:child_process');

const BASE_URL = 'http://127.0.0.1:3000';
const WS_URL = 'ws://127.0.0.1:3000';

function queryDb(sql) {
  const sanitizedSql = sql.replace(/"/g, '\\"');
  const cmd = `docker compose exec -T db psql -U csms -d csms -t -A -c "${sanitizedSql}"`;
  const output = execSync(cmd, { encoding: 'utf8' }).trim();
  return output;
}

async function request(path, options = {}) {
  const url = new URL(path, BASE_URL);
  const headers = { ...options.headers };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, headers: res.headers, body: json, text };
}

function receiveFrame(ws) {
  return new Promise((resolve) => ws.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
}

async function connectWs(code, protocols = ['ocpp1.6']) {
  const ws = new WebSocket(`${WS_URL}/ocpp/${encodeURIComponent(code)}`, protocols);
  ws.on('error', () => {});
  await once(ws, 'open');
  return ws;
}

async function runLiveVerification() {
  console.log('=== BẮT ĐẦU KIỂM THỬ THỰC TẾ TRÊN SERVER THẬT: B3 + B8 + B9 ===\n');

  // 1. Đăng nhập ADMIN
  console.log('[1] Đăng nhập admin@csms.local...');
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@csms.local', password: 'admin' },
  });
  if (loginRes.status !== 200) {
    throw new Error(`Đăng nhập thất bại: ${loginRes.status} ${loginRes.text}`);
  }
  const setCookie = loginRes.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : '';
  console.log('  -> Đăng nhập thành công, cookie session:', cookie.slice(0, 25) + '...\n');

  // Tạo các mã trụ nếu chưa tồn tại
  function ensureChargePoint(code) {
    const check = queryDb(`SELECT id, code, status FROM charge_points WHERE code = '${code}'`);
    if (!check) {
      queryDb(`INSERT INTO charge_points (station_id, code, status) VALUES (1, '${code}', 'UNKNOWN')`);
    } else {
      queryDb(`UPDATE charge_points SET status = 'UNKNOWN' WHERE code = '${code}'`);
    }
  }

  ensureChargePoint('CP-LIVE-B3');
  ensureChargePoint('CP-LIVE-B8');
  ensureChargePoint('CP-LIVE-S13');

  // ==========================================
  // THỬ NGHIỆM B3: 3000 Heartbeat liên tiếp bị chặn bởi Rate Limiter
  // ==========================================
  console.log('[2] Kiểm thử B3: Bơm 3000 Heartbeat liên tiếp tới trụ CP-LIVE-B3 (ngưỡng 50 tin/giây)');
  const wsB3 = await connectWs('CP-LIVE-B3');

  // BootNotification để vào phiên
  const bootPromiseB3 = receiveFrame(wsB3);
  wsB3.send(JSON.stringify([2, 'b3-live-boot', 'BootNotification', { chargePointVendor: 'ABB', chargePointModel: 'Terra54' }]));
  const bootResB3 = await bootPromiseB3;
  console.log('  - BootNotification trả về:', bootResB3[2].status);

  let statusB3 = queryDb("SELECT status FROM charge_points WHERE code = 'CP-LIVE-B3'");
  console.log('  - Trạng thái DB trước khi flood:', statusB3); // ONLINE

  const closePromiseB3 = once(wsB3, 'close');
  let repliesCount = 0;
  wsB3.on('message', () => { repliesCount++; });

  console.log('  - Đang gửi liên tục 3000 tin nhắn Heartbeat...');
  const startTime = Date.now();
  for (let i = 1; i <= 3000; i++) {
    if (wsB3.readyState === WebSocket.OPEN) {
      wsB3.send(JSON.stringify([2, `hb-live-${i}`, 'Heartbeat', {}]));
    }
  }

  const [closeCodeB3, closeReasonB3] = await closePromiseB3;
  const elapsedMs = Date.now() - startTime;
  console.log(`  - Kết nối đã bị đóng sau ${elapsedMs}ms!`);
  console.log(`  - Mã đóng WebSocket: ${closeCodeB3} (mong đợi 1008 Policy Violation)`);
  console.log(`  - Lý do đóng WebSocket: "${closeReasonB3}"`);
  console.log(`  - Số tin nhắn máy chủ trả lời trước khi cắt kết nối: ${repliesCount} tin (thay vì trả lời cả 3000 tin)`);

  if (closeCodeB3 !== 1008) {
    throw new Error(`B3 thất bại: mã đóng là ${closeCodeB3}, mong đợi 1008`);
  }

  // Đợi DB cập nhật offline (B8)
  await new Promise((r) => setTimeout(r, 100));
  statusB3 = queryDb("SELECT status FROM charge_points WHERE code = 'CP-LIVE-B3'");
  console.log('  - Trạng thái DB sau khi bị ngắt bởi rate limit:', statusB3);
  if (statusB3 !== 'UNKNOWN') {
    throw new Error(`B8 thất bại trên ca B3: DB vẫn là ${statusB3}, mong đợi UNKNOWN`);
  }
  console.log('  -> ĐẠT: 3000 Heartbeat bị chặn với mã 1008, DB chuyển về UNKNOWN.\n');

  // ==========================================
  // THỬ NGHIỆM B8: Đóng socket -> DB hết ONLINE (về UNKNOWN)
  // ==========================================
  console.log('[3] Kiểm thử B8: Đóng socket -> Trạng thái DB chuyển từ ONLINE về UNKNOWN (offline)');
  const wsB8 = await connectWs('CP-LIVE-B8');

  const bootPromiseB8 = receiveFrame(wsB8);
  wsB8.send(JSON.stringify([2, 'b8-live-boot', 'BootNotification', { chargePointVendor: 'Schneider', chargePointModel: 'EVlink' }]));
  await bootPromiseB8;

  let statusB8 = queryDb("SELECT status FROM charge_points WHERE code = 'CP-LIVE-B8'");
  console.log('  - Trạng thái DB khi đang kết nối (sau Boot):', statusB8);
  if (statusB8 !== 'ONLINE') {
    throw new Error(`Mong đợi ONLINE nhưng là ${statusB8}`);
  }

  console.log('  - Client chủ động đóng kết nối WebSocket...');
  wsB8.close();
  await once(wsB8, 'close');

  await new Promise((r) => setTimeout(r, 100));
  statusB8 = queryDb("SELECT status FROM charge_points WHERE code = 'CP-LIVE-B8'");
  console.log('  - Trạng thái DB sau khi đóng socket:', statusB8);
  if (statusB8 !== 'UNKNOWN') {
    throw new Error(`B8 thất bại: DB vẫn là ${statusB8}, mong đợi UNKNOWN`);
  }
  console.log('  -> ĐẠT: Ngắt kết nối socket lập tức đưa trụ về UNKNOWN.\n');

  // ==========================================
  // THỬ NGHIỆM B8 + S-13: Kết nối đôi (Duplicate Connection)
  // ==========================================
  console.log('[4] Kiểm thử S-13 (kết nối đôi): Socket cũ đóng (1000) KHÔNG được ghi đè trạng thái ONLINE của socket mới');
  const wsS13_1 = await connectWs('CP-LIVE-S13');

  const bootPromiseS13_1 = receiveFrame(wsS13_1);
  wsS13_1.send(JSON.stringify([2, 's13-live-boot-1', 'BootNotification', { chargePointVendor: 'Siemens', chargePointModel: 'VersiCharge' }]));
  await bootPromiseS13_1;

  let statusS13 = queryDb("SELECT status FROM charge_points WHERE code = 'CP-LIVE-S13'");
  console.log('  - Socket 1 kết nối & Boot -> DB status:', statusS13);

  console.log('  - Socket 2 kết nối cùng mã trụ CP-LIVE-S13...');
  const closePromiseS13_1 = once(wsS13_1, 'close');
  const wsS13_2 = await connectWs('CP-LIVE-S13');

  const [closeCodeS13_1] = await closePromiseS13_1;
  console.log(`  - Socket 1 đã bị ngắt bởi server với mã đóng: ${closeCodeS13_1} (mong đợi 1000)`);

  const bootPromiseS13_2 = receiveFrame(wsS13_2);
  wsS13_2.send(JSON.stringify([2, 's13-live-boot-2', 'BootNotification', { chargePointVendor: 'Siemens', chargePointModel: 'VersiCharge' }]));
  await bootPromiseS13_2;

  // Đợi sự kiện close của socket 1 hoàn tất
  await new Promise((r) => setTimeout(r, 100));

  statusS13 = queryDb("SELECT status FROM charge_points WHERE code = 'CP-LIVE-S13'");
  console.log('  - Trạng thái DB sau khi Socket 1 đóng và Socket 2 đang active:', statusS13);
  if (statusS13 !== 'ONLINE') {
    throw new Error(`S-13 thất bại: Socket 1 đóng đã ghi đè DB thành ${statusS13}, mong đợi ONLINE`);
  }

  console.log('  - Đóng Socket 2 (kết nối active cuối cùng)...');
  wsS13_2.close();
  await once(wsS13_2, 'close');

  await new Promise((r) => setTimeout(r, 100));
  statusS13 = queryDb("SELECT status FROM charge_points WHERE code = 'CP-LIVE-S13'");
  console.log('  - Trạng thái DB sau khi Socket 2 đóng:', statusS13);
  if (statusS13 !== 'UNKNOWN') {
    throw new Error(`Mong đợi UNKNOWN sau khi Socket 2 đóng, nhưng là ${statusS13}`);
  }
  console.log('  -> ĐẠT: Ca kết nối đôi S-13 xử lý chính xác tuyệt đối.\n');

  console.log('=== TẤT CẢ CÁC BÀI KIỂM THỬ THỰC TẾ ĐÃ HOÀN TẤT VÀ ĐẠT 100%! ===');
}

runLiveVerification()
  .catch((err) => {
    console.error('LỖI KIỂM THỬ THỰC TẾ:', err);
    process.exitCode = 1;
  });
