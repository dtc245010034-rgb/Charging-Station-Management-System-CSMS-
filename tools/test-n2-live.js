/**
 * LƯU Ý: Script này chỉ dùng cho môi trường dev cục bộ (local development).
 * Yêu cầu: Docker compose đang chạy, tài khoản admin@csms.local / admin,
 * và biến ALLOW_WEAK_ADMIN_PASSWORD=1. Tuyệt đối không chạy trên staging/production.
 */
const { WebSocket } = require('ws');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const WS_URL = process.env.WS_URL || 'ws://localhost:3000';

async function request(urlPath, options = {}) {
  const url = `${BASE_URL}${urlPath}`;
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  return { status: res.status, headers: res.headers, text, json };
}

async function main() {
  console.log('=== BẮT ĐẦU KIỂM THỬ N2 TRÊN SERVER THẬT ===\n');

  // 1. Đăng nhập Admin
  console.log('[1] Đăng nhập admin@csms.local...');
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@csms.local', password: 'admin' }),
  });
  if (loginRes.status !== 200) {
    throw new Error(`Đăng nhập thất bại: ${loginRes.status} ${loginRes.text}`);
  }
  const setCookie = loginRes.headers.get('set-cookie');
  const tokenCookie = setCookie ? setCookie.split(';')[0] : '';
  console.log('    Đăng nhập thành công! Cookie:', tokenCookie ? `${tokenCookie.slice(0, 30)}...` : 'none');

  // Đảm bảo trạm 1 mở khoá ban đầu
  console.log('\n[2] Đảm bảo Trạm 1 ở trạng thái mở khoá (locked = false)...');
  await request('/api/admin/stations/1/lock', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: tokenCookie,
    },
    body: JSON.stringify({ locked: false }),
  });

  // 2. Kết nối WebSocket client tới DEMO-ST01-CP1
  const cpCode = 'DEMO-ST01-CP1';
  console.log(`\n[3] Kết nối WebSocket tới ${WS_URL}/ocpp/${cpCode}...`);
  const ws = new WebSocket(`${WS_URL}/ocpp/${cpCode}`, ['ocpp1.6']);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  console.log('    WebSocket connected thành công!');

  // 3. Gửi BootNotification
  console.log('\n[4] Gửi BootNotification frame...');
  const bootMsgId = 'boot-test-01';
  const bootPayload = [
    2,
    bootMsgId,
    'BootNotification',
    {
      chargePointVendor: 'TestVendor',
      chargePointModel: 'TestModel',
      chargePointSerialNumber: 'SN-N2-001',
    },
  ];

  const bootPromise = new Promise((resolve) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 3 && msg[1] === bootMsgId) {
        resolve(msg);
      }
    });
  });

  ws.send(JSON.stringify(bootPayload));
  const bootResp = await bootPromise;
  console.log('    BootNotification response:', JSON.stringify(bootResp));
  if (bootResp[2]?.status !== 'Accepted') {
    throw new Error(`Kỳ vọng Boot Accepted nhưng nhận: ${JSON.stringify(bootResp)}`);
  }

  // 4. Lắng nghe close event trên WS client
  const closePromise = new Promise((resolve) => {
    ws.on('close', (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
  });

  // 5. Gọi REST API khoá trạm (Trạm 1)
  console.log('\n[5] Gọi PATCH /api/admin/stations/1/lock { locked: true }...');
  const lockRes = await request('/api/admin/stations/1/lock', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: tokenCookie,
    },
    body: JSON.stringify({ locked: true }),
  });
  console.log(`    Lock station response status: ${lockRes.status}`);
  console.log(`    Lock station body: ${lockRes.text}`);

  if (lockRes.status !== 200) {
    throw new Error(`Khoá trạm thất bại: ${lockRes.status}`);
  }

  // 6. Chờ socket đóng và kiểm tra mã đóng
  console.log('\n[6] Đang chờ WebSocket client nhận close frame...');
  const closeEvent = await closePromise;
  console.log('    Client đã nhận CLOSE event!');
  console.log(`    Close code  : ${closeEvent.code} (Kỳ vọng: 1008)`);
  console.log(`    Close reason: "${closeEvent.reason}" (Kỳ vọng: "Station locked")`);

  if (closeEvent.code !== 1008) {
    throw new Error(`Sai mã đóng! Nhận ${closeEvent.code}, kỳ vọng 1008`);
  }
  if (closeEvent.reason !== 'Station locked') {
    throw new Error(`Sai lý do đóng! Nhận "${closeEvent.reason}", kỳ vọng "Station locked"`);
  }

  // Chờ 500ms cho handler B8 cập nhật DB
  await new Promise((r) => setTimeout(r, 500));

  // 7. Thử kết nối lại trong khi trạm đang bị khoá
  console.log('\n[7] Thử kết nối lại khi trạm vẫn đang bị khoá...');
  const wsLocked = new WebSocket(`${WS_URL}/ocpp/${cpCode}`, ['ocpp1.6']);
  await new Promise((resolve, reject) => {
    wsLocked.on('open', resolve);
    wsLocked.on('error', reject);
  });
  console.log('    WebSocket mở, gửi BootNotification...');
  const bootLockedPromise = new Promise((resolve) => {
    wsLocked.on('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
  wsLocked.send(JSON.stringify([2, 'boot-locked-01', 'BootNotification', {
    chargePointVendor: 'TestVendor',
    chargePointModel: 'TestModel',
  }]));
  const bootLockedResp = await bootLockedPromise;
  console.log('    BootNotification response khi trạm bị khoá:', JSON.stringify(bootLockedResp));
  if (bootLockedResp[2]?.status !== 'Rejected') {
    throw new Error(`Kỳ vọng Rejected nhưng nhận: ${JSON.stringify(bootLockedResp)}`);
  }
  wsLocked.close();

  // 8. Mở khoá trạm (locked: false)
  console.log('\n[8] Gọi PATCH /api/admin/stations/1/lock { locked: false } để mở khoá...');
  const unlockRes = await request('/api/admin/stations/1/lock', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: tokenCookie,
    },
    body: JSON.stringify({ locked: false }),
  });
  console.log(`    Unlock station status: ${unlockRes.status}`);

  // 9. Kết nối lại sau khi mở khoá
  console.log('\n[9] Kết nối lại sau khi mở khoá và gửi BootNotification...');
  const wsUnlocked = new WebSocket(`${WS_URL}/ocpp/${cpCode}`, ['ocpp1.6']);
  await new Promise((resolve, reject) => {
    wsUnlocked.on('open', resolve);
    wsUnlocked.on('error', reject);
  });
  const bootUnlockedPromise = new Promise((resolve) => {
    wsUnlocked.on('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
  wsUnlocked.send(JSON.stringify([2, 'boot-unlocked-01', 'BootNotification', {
    chargePointVendor: 'TestVendor',
    chargePointModel: 'TestModel',
  }]));
  const bootUnlockedResp = await bootUnlockedPromise;
  console.log('    BootNotification response khi đã mở khoá:', JSON.stringify(bootUnlockedResp));
  if (bootUnlockedResp[2]?.status !== 'Accepted') {
    throw new Error(`Kỳ vọng Accepted nhưng nhận: ${JSON.stringify(bootUnlockedResp)}`);
  }
  wsUnlocked.close();

  console.log('\n=== TẤT CẢ KIỂM THỬ THỰC TẾ TRÊN LIVE SERVER ĐÃ PASS HOÀN TOÀN! ===');
}

main().catch((err) => {
  console.error('\n[LỖI THỰC THI]', err);
  process.exit(1);
});
