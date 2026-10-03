/**
 * LƯU Ý: Script này chỉ dùng cho môi trường dev cục bộ (local development).
 * Yêu cầu: Docker compose đang chạy, tài khoản admin@csms.local / admin,
 * và biến ALLOW_WEAK_ADMIN_PASSWORD=1. Tuyệt đối không chạy trên staging/production.
 */
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
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }

  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, headers: res.headers, body: json, text, cookie: setCookie };
}

function parseCookie(cookieHeader) {
  if (!cookieHeader) return '';
  return cookieHeader.split(';')[0];
}

async function connectWs(code, protocols = ['ocpp1.6']) {
  const ws = new WebSocket(`${WS_URL}/ocpp/${encodeURIComponent(code)}`, protocols);
  await once(ws, 'open');
  return ws;
}

function receiveFrame(ws) {
  return new Promise((resolve, reject) => {
    ws.once('message', (raw) => {
      try {
        resolve(JSON.parse(raw.toString()));
      } catch (err) {
        reject(err);
      }
    });
    ws.once('error', reject);
  });
}

async function runLiveVerification() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TRỰC TIẾP T-16B & S-08 SERIAL_NUMBER ===\n');

  // 1. Đăng nhập / đăng ký tài khoản
  console.log('1. Thiết lập tài khoản ADMIN và DRIVER...');
  const adminEmail = `admin-live-${Date.now()}@example.com`;
  const driverEmail = `driver-live-${Date.now()}@example.com`;
  const password = 'password123456';

  // Seed / tạo admin bằng command dòng lệnh
  const { execSync } = require('node:child_process');
  execSync(`docker compose exec -e ADMIN_EMAIL=${adminEmail} -e ADMIN_PASSWORD=${password} -e ALLOW_WEAK_ADMIN_PASSWORD=1 app node scripts/create-admin.js`, { stdio: 'pipe' });

  // Đăng nhập Admin
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password },
  });
  if (adminLogin.status !== 200) {
    throw new Error(`Đăng nhập admin thất bại: ${adminLogin.status} ${adminLogin.text}`);
  }
  const adminCookie = parseCookie(adminLogin.cookie);
  console.log('   Admin đăng nhập thành công.');

  // Đăng ký Driver
  const driverReg = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Driver Live', email: driverEmail, password },
  });
  const driverCookie = parseCookie(driverReg.cookie);
  console.log('   Driver đăng ký thành công.');

  // 2. Tạo trạm và trụ sạc (Admin tạo trạm)
  console.log('\n2. Tạo trạm và trụ sạc...');
  const key = `idem-station-${Date.now()}`;
  const createStRes = await request('/api/stations', {
    method: 'POST',
    cookie: adminCookie,
    headers: { 'Idempotency-Key': key },
    body: {
      name: 'Trạm Thật Test Lock',
      address: '123 Đường Test, Hà Nội',
      latitude: '21.028511',
      longitude: '105.854444',
    },
  });
  if (createStRes.status !== 201) {
    throw new Error(`Tạo trạm thất bại: ${createStRes.status} ${createStRes.text}`);
  }
  const stationId = createStRes.body.id;
  console.log(`   Đã tạo trạm id=${stationId}`);

  const cpCode = `CP-LIVE-${Math.floor(Math.random() * 100000)}`;
  const createCpRes = await request(`/api/stations/${stationId}/charge-points`, {
    method: 'POST',
    cookie: adminCookie,
    body: { code: cpCode, model: 'VF-Model', vendor: 'VF-Vendor' },
  });
  if (createCpRes.status !== 201) {
    throw new Error(`Tạo trụ thất bại: ${createCpRes.status} ${createCpRes.text}`);
  }
  console.log(`   Đã tạo trụ mã=${cpCode}`);

  // 3. Kiểm tra RBAC và Validation cho route T-16b: PATCH /api/admin/stations/:id/lock
  console.log('\n3. Kiểm tra RBAC và Validation cho PATCH /api/admin/stations/:id/lock...');
  
  // Không xác thực -> 401
  const unauthRes = await request(`/api/admin/stations/${stationId}/lock`, {
    method: 'PATCH',
    body: { locked: true },
  });
  console.log(`   [401 Check] Không có cookie -> status: ${unauthRes.status} (Kỳ vọng: 401)`);
  if (unauthRes.status !== 401) throw new Error(`Kỳ vọng 401 nhưng nhận ${unauthRes.status}`);

  // Driver -> 403
  const driverLockRes = await request(`/api/admin/stations/${stationId}/lock`, {
    method: 'PATCH',
    cookie: driverCookie,
    body: { locked: true },
  });
  console.log(`   [403 Check] Driver gọi -> status: ${driverLockRes.status} (Kỳ vọng: 403)`);
  if (driverLockRes.status !== 403) throw new Error(`Kỳ vọng 403 nhưng nhận ${driverLockRes.status}`);

  // Trạm không tồn tại -> 404
  const notFoundRes = await request('/api/admin/stations/9999999/lock', {
    method: 'PATCH',
    cookie: adminCookie,
    body: { locked: true },
  });
  console.log(`   [404 Check] Trạm không tồn tại -> status: ${notFoundRes.status} (Kỳ vọng: 404)`);
  if (notFoundRes.status !== 404) throw new Error(`Kỳ vọng 404 nhưng nhận ${notFoundRes.status}`);

  // Body sai (không phải boolean) -> 400
  const badBodyRes = await request(`/api/admin/stations/${stationId}/lock`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { locked: 'yes' },
  });
  console.log(`   [400 Check] Body locked không phải boolean -> status: ${badBodyRes.status} (Kỳ vọng: 400)`);
  if (badBodyRes.status !== 400) throw new Error(`Kỳ vọng 400 nhưng nhận ${badBodyRes.status}`);

  // 4. Admin khoá trạm
  console.log('\n4. Admin khoá trạm (locked: true)...');
  const lockRes = await request(`/api/admin/stations/${stationId}/lock`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { locked: true },
  });
  console.log(`   Admin khoá trạm -> status: ${lockRes.status}`);
  console.log(`   locked_at: ${lockRes.body.locked_at}, locked_by: ${lockRes.body.locked_by}`);
  if (lockRes.status !== 200 || !lockRes.body.locked_at || !lockRes.body.locked_by) {
    throw new Error('Khoá trạm không cập nhật đúng locked_at / locked_by');
  }

  // 5. Trụ kết nối WebSocket và gửi BootNotification khi trạm bị khoá -> Rejected
  console.log('\n5. Trụ gửi BootNotification khi trạm bị khoá...');
  const ws1 = await connectWs(cpCode);
  const p1 = receiveFrame(ws1);
  ws1.send(JSON.stringify([
    2,
    'msg-live-01',
    'BootNotification',
    {
      chargePointVendor: 'VendorLive',
      chargePointModel: 'ModelLive',
      chargePointSerialNumber: 'SN-SHOULD-REJECT',
      firmwareVersion: '1.0.0',
    },
  ]));
  const res1 = await p1;
  console.log('   Khung phản hồi từ server:', JSON.stringify(res1));
  if (res1[0] !== 3 || res1[2]?.status !== 'Rejected') {
    throw new Error(`Kỳ vọng BootNotification Rejected nhưng nhận: ${JSON.stringify(res1)}`);
  }
  ws1.close();

  // 6. Admin mở khoá trạm
  console.log('\n6. Admin mở khoá trạm (locked: false)...');
  const unlockRes = await request(`/api/admin/stations/${stationId}/lock`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { locked: false },
  });
  console.log(`   Admin mở khoá trạm -> status: ${unlockRes.status}`);
  console.log(`   locked_at: ${unlockRes.body.locked_at}, locked_by: ${unlockRes.body.locked_by}`);
  if (unlockRes.status !== 200 || unlockRes.body.locked_at !== null || unlockRes.body.locked_by !== null) {
    throw new Error('Mở khoá trạm không reset locked_at / locked_by về null');
  }

  // 7. Trụ gửi BootNotification sau khi mở khoá -> Accepted và serial_number lưu vào DB
  console.log('\n7. Trụ gửi BootNotification sau khi mở khoá (với chargePointSerialNumber hợp lệ)...');
  const validSerial = 'SN-VF-987654321';
  const ws2 = await connectWs(cpCode);
  const p2 = receiveFrame(ws2);
  ws2.send(JSON.stringify([
    2,
    'msg-live-02',
    'BootNotification',
    {
      chargePointVendor: 'VendorLiveOK',
      chargePointModel: 'ModelLiveOK',
      chargePointSerialNumber: validSerial,
      firmwareVersion: '2.0.0',
    },
  ]));
  const res2 = await p2;
  console.log('   Khung phản hồi từ server:', JSON.stringify(res2));
  if (res2[0] !== 3 || res2[2]?.status !== 'Accepted') {
    throw new Error(`Kỳ vọng BootNotification Accepted nhưng nhận: ${JSON.stringify(res2)}`);
  }
  ws2.close();

  // Kiểm tra CSDL thật xem serial_number đã lưu chưa
  console.log('\n8. Kiểm tra CSDL thật cho cột serial_number...');
  const dbCheckOutput = execSync(
    `docker compose exec app node -e "const { pool } = require('./src/db/pool'); pool.query('SELECT code, vendor, model, firmware_version, serial_number, status FROM charge_points WHERE code = $1', ['${cpCode}']).then(r => { console.log(JSON.stringify(r.rows[0])); process.exit(0); });"`,
    { encoding: 'utf-8' }
  ).trim();
  console.log('   Dữ liệu trong bảng charge_points:', dbCheckOutput);
  const cpDb = JSON.parse(dbCheckOutput);
  if (cpDb.serial_number !== validSerial || cpDb.status !== 'ONLINE') {
    throw new Error(`serial_number (${cpDb.serial_number}) hoặc status (${cpDb.status}) không đúng trong CSDL!`);
  }

  // 9. Kiểm tra trường chargePointSerialNumber > 25 ký tự -> PropertyConstraintViolation
  console.log('\n9. Kiểm tra gửi chargePointSerialNumber vượt quá 25 ký tự...');
  const ws3 = await connectWs(cpCode);
  const p3 = receiveFrame(ws3);
  ws3.send(JSON.stringify([
    2,
    'msg-live-toolong',
    'BootNotification',
    {
      chargePointVendor: 'VendorX',
      chargePointModel: 'ModelX',
      chargePointSerialNumber: '12345678901234567890123456', // 26 chars
    },
  ]));
  const res3 = await p3;
  console.log('   Khung phản hồi lỗi từ server:', JSON.stringify(res3));
  if (res3[0] !== 4 || res3[2] !== 'PropertyConstraintViolation') {
    throw new Error(`Kỳ vọng PropertyConstraintViolation nhưng nhận: ${JSON.stringify(res3)}`);
  }
  ws3.close();

  console.log('\n=== TẤT CẢ CÁC BƯỚC KIỂM THỬ TRỰC TIẾP TRÊN SERVER THẬT ĐÃ ĐẠT 100% ===');
}

runLiveVerification().catch((err) => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
