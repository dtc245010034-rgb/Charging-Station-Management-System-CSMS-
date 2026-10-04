/**
 * LƯU Ý: Script này chỉ dùng cho môi trường dev cục bộ (local development).
 * Yêu cầu: server đang chạy và một tài khoản ADMIN có sẵn (tạo bằng scripts/create-admin.js
 * với mật khẩu mạnh). Đặt ADMIN_EMAIL và ADMIN_PASSWORD trong biến môi trường, ví dụ:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node tools/<tên-script>.js
 * Thiếu một trong hai biến thì script dừng. Tuyệt đối không chạy trên staging/production.
 */
const { requireAdminCredentials } = require('./lib/admin-credentials');
const { once } = require('node:events');
const { WebSocket } = require('ws');

const BASE_URL = 'http://127.0.0.1:3000';
const WS_URL = 'ws://127.0.0.1:3000';

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

async function runLiveVerification() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TRÊN SERVER THẬT (MIGRATION 001-007) ===\n');

  // 1. Đăng nhập ADMIN
  console.log('[1] Đăng nhập tài khoản admin (ADMIN_EMAIL)...');
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: requireAdminCredentials(),
  });
  if (loginRes.status !== 200) {
    throw new Error(`Đăng nhập thất bại: ${loginRes.status} ${loginRes.text}`);
  }
  const setCookie = loginRes.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : '';
  console.log('  -> Đăng nhập thành công, cookie session:', cookie.slice(0, 25) + '...\n');

  // ==========================================
  // B1: Mã trụ tạo qua API và handshake
  // ==========================================
  console.log('[2] Kiểm thử B1: Mã trụ đồng nhất giữa API và Handshake');
  const badCodes = ['CP.01', 'CP 02', 'cp/04', 'CP@01'];
  for (const badCode of badCodes) {
    const res = await request('/api/stations/1/charge-points', {
      method: 'POST',
      cookie,
      body: { code: badCode },
    });
    console.log(`  - Tạo trụ mã xấu "${badCode}": status=${res.status}, error=${res.body?.error?.code} | message="${res.body?.error?.message}"`);
    if (res.status !== 400) throw new Error(`Mong đợi 400 nhưng nhận ${res.status}`);
  }

  const checkCodeBad = await request('/api/charge-points/check-code?code=CP.01', { cookie });
  console.log(`  - check-code với mã xấu "CP.01": status=${checkCodeBad.status}, error=${checkCodeBad.body?.error?.code}`);
  if (checkCodeBad.status !== 400) throw new Error(`check-code mong đợi 400 nhưng nhận ${checkCodeBad.status}`);

  // Dọn dẹp nếu CP-LIVE-B1 đã tồn tại
  const listRes = await request('/api/charge-points', { cookie });
  const existingCp = listRes.body?.find?.((cp) => cp.code === 'CP-LIVE-B1');
  let cpId = existingCp?.id;
  if (!existingCp) {
    const createOk = await request('/api/stations/1/charge-points', {
      method: 'POST',
      cookie,
      body: { code: 'cp-live-b1' },
    });
    console.log(`  - Tạo trụ mã tốt "cp-live-b1": status=${createOk.status}, code được lưu="${createOk.body?.code}"`);
    if (createOk.status !== 201) throw new Error(`Tạo trụ thất bại: ${createOk.status} ${createOk.text}`);
    cpId = createOk.body.id;
  } else {
    console.log(`  - Trụ "CP-LIVE-B1" đã có sẵn trong DB (id=${cpId}), reset lại trạng thái UNKNOWN`);
    const { execSync } = require('node:child_process');
    execSync('docker compose exec -T db psql -U csms -d csms -c "UPDATE charge_points SET status = \'UNKNOWN\', vendor = NULL WHERE code = \'CP-LIVE-B1\';"');
  }

  // Thử kết nối WebSocket với mã tốt
  const ws1 = new WebSocket(`${WS_URL}/ocpp/CP-LIVE-B1`, ['ocpp1.6']);
  await once(ws1, 'open');
  console.log(`  - Kết nối WebSocket /ocpp/CP-LIVE-B1 thành công (protocol: ${ws1.protocol})`);
  ws1.close();
  await once(ws1, 'close');
  console.log('  -> KẾT QUẢ B1: ĐẠT (PASS)\n');

  // ==========================================
  // B2: Giới hạn kích thước khung & độ dài BootNotification
  // ==========================================
  console.log('[3] Kiểm thử B2: Giới hạn kích thước khung & độ dài trường BootNotification');
  const ws2 = new WebSocket(`${WS_URL}/ocpp/CP-LIVE-B1`, ['ocpp1.6']);
  ws2.on('error', () => {});
  await once(ws2, 'open');

  const closePromise = once(ws2, 'close');
  // Gửi khung 70 KB (> 64 KB maxPayload)
  const bigPayload = 'A'.repeat(70 * 1024);
  ws2.send(JSON.stringify([2, 'msg-oversize', 'Heartbeat', { data: bigPayload }]));
  const [closeCode] = await closePromise;
  console.log(`  - Gửi khung 70 KB: WebSocket bị đóng với close code=${closeCode} (1009 = Message Too Big)`);
  if (closeCode !== 1009) throw new Error(`Mong đợi close code 1009 nhưng nhận ${closeCode}`);

  // Kết nối lại để thử độ dài trường BootNotification
  const ws3 = new WebSocket(`${WS_URL}/ocpp/CP-LIVE-B1`, ['ocpp1.6']);
  await once(ws3, 'open');
  const receiveFrame = (ws) => new Promise((resolve) => ws.once('message', (raw) => resolve(JSON.parse(raw.toString()))));

  const bootErrPromise = receiveFrame(ws3);
  ws3.send(JSON.stringify([
    2,
    'msg-vendor-toolong',
    'BootNotification',
    {
      chargePointVendor: 'VendorExceeding20Chars!',
      chargePointModel: 'ValidModel',
    },
  ]));
  const bootErrRes = await bootErrPromise;
  console.log(`  - Gửi vendor quá 20 ký tự: nhận frame=${JSON.stringify(bootErrRes)}`);
  if (bootErrRes[0] !== 4 || bootErrRes[2] !== 'PropertyConstraintViolation') {
    throw new Error(`Mong đợi CALLERROR PropertyConstraintViolation nhưng nhận ${JSON.stringify(bootErrRes)}`);
  }

  // Kiểm tra DB trụ vẫn là UNKNOWN
  const checkCp = await request(`/api/charge-points/${cpId}`, { cookie });
  console.log(`  - Kiểm tra DB: status="${checkCp.body.status}", vendor="${checkCp.body.vendor}" (không bị ghi)`);
  if (checkCp.body.status !== 'UNKNOWN' || checkCp.body.vendor) {
    throw new Error('Dữ liệu DB bị thay đổi ngoài ý muốn!');
  }
  console.log('  -> KẾT QUẢ B2: ĐẠT (PASS)\n');

  // ==========================================
  // B4: Chống Log Injection
  // ==========================================
  console.log('[4] Kiểm thử B4: Chống Log Injection từ messageId chứa \\n');
  // Chấp nhận Boot trước để gửi được Heartbeat
  const bootOkPromise = receiveFrame(ws3);
  ws3.send(JSON.stringify([2, 'msg-boot-valid', 'BootNotification', { chargePointVendor: 'Delta', chargePointModel: 'City200' }]));
  const bootOkRes = await bootOkPromise;
  console.log(`  - Gửi BootNotification hợp lệ: status=${bootOkRes[2]?.status}`);

  const injectedId = 'msg-live-b4\n[OCPP] FAKE LINE LIVE TEST\n';
  const hbPromise = receiveFrame(ws3);
  ws3.send(JSON.stringify([2, injectedId, 'Heartbeat', {}]));
  const hbRes = await hbPromise;
  console.log(`  - Gửi messageId chứa \\n: nhận CALLRESULT=${hbRes[0]}, messageId khớp=${hbRes[1] === injectedId}`);
  if (hbRes[0] !== 3 || hbRes[1] !== injectedId) {
    throw new Error('Xử lý messageId có \\n thất bại');
  }
  ws3.close();
  await once(ws3, 'close');
  console.log('  -> KẾT QUẢ B4: ĐẠT (PASS)\n');

  // ==========================================
  // B7: BootNotification trả InternalError khi DB lỗi
  // ==========================================
  console.log('[5] Kiểm thử B7: Giả lập lỗi DB khi BootNotification -> trả CALLERROR InternalError');
  // Tạo trụ mới CP-LIVE-B7
  const cpB7Res = await request('/api/stations/1/charge-points', {
    method: 'POST',
    cookie,
    body: { code: 'cp-live-b7' },
  });
  let cpB7Id = cpB7Res.body?.id;
  if (!cpB7Id) {
    const listResB7 = await request('/api/charge-points', { cookie });
    const existingB7 = listResB7.body?.find?.((cp) => cp.code === 'CP-LIVE-B7');
    cpB7Id = existingB7?.id;
  }
  console.log(`  - Trụ thử nghiệm CP-LIVE-B7 (id=${cpB7Id})`);

  // Thêm CHECK constraint tạm thời vào DB để kích hoạt lỗi DB khi UPDATE
  const { execSync } = require('node:child_process');
  execSync('docker compose exec -T db psql -U csms -d csms -c "ALTER TABLE charge_points ADD CONSTRAINT test_fail_boot CHECK (vendor != \'TriggerDbError\');"');

  try {
    const ws4 = new WebSocket(`${WS_URL}/ocpp/CP-LIVE-B7`, ['ocpp1.6']);
    await once(ws4, 'open');

    const b7ErrPromise = receiveFrame(ws4);
    ws4.send(JSON.stringify([
      2,
      'msg-b7-error',
      'BootNotification',
      {
        chargePointVendor: 'TriggerDbError',
        chargePointModel: 'TestModel',
      },
    ]));
    const b7ErrRes = await b7ErrPromise;
    console.log(`  - Gửi BootNotification kích hoạt lỗi DB: nhận frame=${JSON.stringify(b7ErrRes)}`);
    if (b7ErrRes[0] !== 4 || b7ErrRes[2] !== 'InternalError' || b7ErrRes[3] !== 'Internal error') {
      throw new Error(`Mong đợi CALLERROR InternalError với "Internal error" nhưng nhận ${JSON.stringify(b7ErrRes)}`);
    }

    // Kiểm tra DB trụ CP-LIVE-B7 vẫn là UNKNOWN, vendor vẫn NULL
    const checkCpB7 = await request(`/api/charge-points/${cpB7Id}`, { cookie });
    console.log(`  - Kiểm tra DB: status="${checkCpB7.body.status}", vendor="${checkCpB7.body.vendor}" (DB không bị lưu nửa vời)`);
    if (checkCpB7.body.status !== 'UNKNOWN' || checkCpB7.body.vendor) {
      throw new Error('Trạng thái DB bị thay đổi khi lỗi!');
    }

    ws4.close();
    await once(ws4, 'close');
  } finally {
    // Xoá CHECK constraint tạm thời
    execSync('docker compose exec -T db psql -U csms -d csms -c "ALTER TABLE charge_points DROP CONSTRAINT IF EXISTS test_fail_boot;"');
  }
  console.log('  -> KẾT QUẢ B7: ĐẠT (PASS)\n');

  console.log('=== HOÀN THÀNH TẤT CẢ CÁC BƯỚC KIỂM THỬ TRÊN SERVER THẬT: TẤT CẢ ĐỀU ĐẠT (PASS) ===');
}

runLiveVerification().catch((err) => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});
