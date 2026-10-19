#!/usr/bin/env node
'use strict';

const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const passwordEnv = process.env.DEMO_PASSWORD;
if (!passwordEnv || typeof passwordEnv !== 'string' || passwordEnv.trim().length < 12) {
  console.error('LỖI: Biến môi trường DEMO_PASSWORD bắt buộc và phải có ít nhất 12 ký tự.');
  process.exit(1);
}
const demoPassword = passwordEnv.trim();

let totalSteps = 0;
let passedSteps = 0;
let failedSteps = 0;

function logPass(msg) {
  totalSteps += 1;
  passedSteps += 1;
  console.log(`  [PASS] ${msg}`);
}

function logFail(msg, detail = '') {
  totalSteps += 1;
  failedSteps += 1;
  console.error(`  [FAIL] ${msg} ${detail}`);
}

async function loginUser(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Đăng nhập thất bại (${res.status}): ${errText}`);
  }
  const setCookie = res.headers.get('set-cookie');
  let cookieHeader = '';
  if (setCookie) {
    cookieHeader = setCookie.split(',').map((c) => c.split(';')[0].trim()).join('; ');
  }
  const body = await res.json();
  return { user: body.user, cookie: cookieHeader };
}

async function apiGet(path, cookie) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      Cookie: cookie,
      Accept: 'application/json',
    },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function runSmoke() {
  console.log(`==> Bắt đầu kiểm khói hệ thống CSMS tại ${baseUrl}...`);

  // 1. Kiểm tra Health
  try {
    const hRes = await fetch(`${baseUrl}/api/health`);
    if (hRes.ok) {
      logPass('Bước 1: GET /api/health trả về 200 OK');
    } else {
      logFail(`Bước 1: GET /api/health trả về ${hRes.status}`);
    }
  } catch (err) {
    logFail('Bước 1: GET /api/health gặp lỗi kết nối', err.message);
  }

  // 2. Vai DRIVER: Đăng nhập -> Kiểm tra số dư ví & gói thuê bao
  try {
    const driver = await loginUser('demo.driver@csms.local', demoPassword);
    logPass(`Bước 2.1: Đăng nhập DRIVER thành công (${driver.user.email})`);

    const wRes = await apiGet(`/api/drivers/${driver.user.id}/wallet`, driver.cookie);
    if (wRes.status === 200 && BigInt(wRes.data.balanceDong || 0) >= 0n) {
      logPass(`Bước 2.2: Đọc thông tin ví thành công (Số dư: ${wRes.data.balanceDong} đ)`);
    } else {
      logFail(`Bước 2.2: Đọc thông tin ví thất bại`, JSON.stringify(wRes));
    }

    const subRes = await apiGet('/api/subscription-plans', driver.cookie);
    if (subRes.status === 200 && Array.isArray(subRes.data)) {
      logPass(`Bước 2.3: Xem danh sách gói thuê bao tháng (${subRes.data.length} gói)`);
    } else {
      logFail(`Bước 2.3: Đọc danh sách gói thất bại`, JSON.stringify(subRes));
    }
  } catch (err) {
    logFail('Bước 2: Vai DRIVER gặp lỗi', err.message);
  }

  // 3. Vai STATION_OWNER: Đăng nhập -> Xem danh sách trạm & khung giờ công suất
  try {
    const owner = await loginUser('demo.owner1@csms.local', demoPassword);
    logPass(`Bước 3.1: Đăng nhập STATION_OWNER thành công (${owner.user.email})`);

    const stRes = await apiGet('/api/stations', owner.cookie);
    if (stRes.status === 200 && Array.isArray(stRes.data) && stRes.data.length > 0) {
      logPass(`Bước 3.2: Liệt kê trạm của chủ trạm (${stRes.data.length} trạm)`);
      const stationId = stRes.data[0].id;
      const winRes = await apiGet(`/api/stations/${stationId}/power-windows`, owner.cookie);
      if (winRes.status === 200 && Array.isArray(winRes.data.windows)) {
        logPass(`Bước 3.3: Xem khung giờ công suất trạm #${stationId} (${winRes.data.windows.length} khung)`);
      } else {
        logFail(`Bước 3.3: Xem khung giờ công suất thất bại`, JSON.stringify(winRes));
      }
    } else {
      logFail(`Bước 3.2: Liệt kê trạm của chủ trạm thất bại`, JSON.stringify(stRes));
    }
  } catch (err) {
    logFail('Bước 3: Vai STATION_OWNER gặp lỗi', err.message);
  }

  // 4. Vai OPERATOR: Đăng nhập -> Xem giám sát trụ sạc & phiên sạc
  try {
    const operator = await loginUser('demo.operator@csms.local', demoPassword);
    logPass(`Bước 4.1: Đăng nhập OPERATOR thành công (${operator.user.email})`);

    const cpRes = await apiGet('/api/charge-points', operator.cookie);
    if (cpRes.status === 200) {
      logPass('Bước 4.2: Giám sát danh sách trụ sạc');
    } else {
      logFail('Bước 4.2: Giám sát trụ sạc thất bại', JSON.stringify(cpRes));
    }

    const sessRes = await apiGet('/api/sessions', operator.cookie);
    if (sessRes.status === 200) {
      logPass('Bước 4.3: Giám sát các phiên sạc đang hoạt động');
    } else {
      logFail('Bước 4.3: Giám sát phiên sạc thất bại', JSON.stringify(sessRes));
    }
  } catch (err) {
    logFail('Bước 4: Vai OPERATOR gặp lỗi', err.message);
  }

  // 5. Vai ACCOUNTANT: Đăng nhập -> Xem đối soát & kỳ đối soát
  try {
    const accountant = await loginUser('demo.accountant@csms.local', demoPassword);
    logPass(`Bước 5.1: Đăng nhập ACCOUNTANT thành công (${accountant.user.email})`);

    const recRes = await apiGet('/api/reports/reconciliation?from=2026-01-01&to=2026-12-31', accountant.cookie);
    if (recRes.status === 200) {
      logPass('Bước 5.2: Truy vấn báo cáo đối soát doanh thu');
    } else {
      logFail('Bước 5.2: Truy vấn báo cáo đối soát thất bại', JSON.stringify(recRes));
    }
  } catch (err) {
    logFail('Bước 5: Vai ACCOUNTANT gặp lỗi', err.message);
  }

  // 6. Vai ADMIN: Đăng nhập -> Xem nhật ký kiểm toán & quản lý gói
  try {
    const admin = await loginUser('demo.admin@csms.local', demoPassword);
    logPass(`Bước 6.1: Đăng nhập ADMIN thành công (${admin.user.email})`);

    const auditRes = await apiGet('/api/audit-logs?limit=5', admin.cookie);
    if (auditRes.status === 200) {
      logPass('Bước 6.2: Kiểm tra nhật ký kiểm toán (Audit Logs)');
    } else {
      logFail('Bước 6.2: Kiểm tra audit logs thất bại', JSON.stringify(auditRes));
    }
  } catch (err) {
    logFail('Bước 6: Vai ADMIN gặp lỗi', err.message);
  }

  console.log('\n=============================================');
  console.log(`KẾT QUẢ KIỂM KHÓI: ${passedSteps}/${totalSteps} BƯỚC ĐẠT (PASS)`);
  if (failedSteps > 0) {
    console.error(`CÓ ${failedSteps} BƯỚC THẤT BẠI!`);
    process.exit(1);
  }
  console.log('TOÀN BỘ CÁC VAI ĐỀU HOẠT ĐỘNG HOÀN HẢO.');
  process.exit(0);
}

if (require.main === module) {
  runSmoke().catch((err) => {
    console.error('LỖI KIỂM KHÓI NGHIÊM TRỌNG:', err);
    process.exit(1);
  });
}

module.exports = { runSmoke };
