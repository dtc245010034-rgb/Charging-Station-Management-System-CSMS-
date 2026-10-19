#!/usr/bin/env node
'use strict';

// Kiểm khói demo: 6 nhóm (health + 5 vai trò) trên dữ liệu do `npm run seed-demo` tạo.
// Một nhóm chỉ ĐẠT khi mọi kiểm tra con đều đạt. Có nhóm FAIL thì thoát mã 1.
const path = require('node:path');
const { ACCOUNTS, DEFAULT_EMAIL_DOMAIN, DEMO_PASSWORD_MIN_LENGTH, emailOf } = require(path.join(__dirname, '..', 'backend', 'scripts', 'lib', 'demo-accounts'));

const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const emailDomain = process.env.DEMO_EMAIL_DOMAIN || DEFAULT_EMAIL_DOMAIN;
const demoEmail = (key) => {
  if (!ACCOUNTS.some((account) => account.key === key)) throw new Error(`Tài khoản demo không có trong bảng dùng chung: ${key}`);
  return emailOf(key, emailDomain);
};

function readPassword(env = process.env) {
  const value = typeof env.DEMO_PASSWORD === 'string' ? env.DEMO_PASSWORD.trim() : '';
  if (value.length < DEMO_PASSWORD_MIN_LENGTH) {
    console.error(`LỖI: Biến môi trường DEMO_PASSWORD bắt buộc và phải có ít nhất ${DEMO_PASSWORD_MIN_LENGTH} ký tự.`);
    process.exit(1);
  }
  return value;
}

async function login(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Đăng nhập ${email} thất bại (${res.status}): ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0].trim()).join('; ');
  const body = await res.json();
  return { user: body.user, cookie };
}

async function apiGet(apiPath, cookie) {
  const res = await fetch(`${baseUrl}${apiPath}`, { headers: { Cookie: cookie, Accept: 'application/json' } });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// Mỗi nhóm trả về danh sách [đạt?, mô tả, chi tiết lỗi].
const groups = (password) => [
  ['1. Health', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    return [[res.ok, `GET /api/health trả về ${res.status}`]];
  }],
  ['2. DRIVER', async () => {
    const { user, cookie } = await login(demoEmail('driver'), password);
    const wallet = await apiGet(`/api/drivers/${user.id}/wallet`, cookie);
    const plans = await apiGet('/api/subscription-plans', cookie);
    const planList = Array.isArray(plans.data) ? plans.data : [];
    return [
      [true, `Đăng nhập ${user.email}`],
      [wallet.status === 200 && BigInt(wallet.data.balanceDong ?? -1) >= 0n, `Đọc ví (số dư ${wallet.data.balanceDong} đ)`, JSON.stringify(wallet)],
      [plans.status === 200 && planList.length > 0, `Có gói thuê bao đang mở bán (${planList.length} gói)`, JSON.stringify(plans)],
    ];
  }],
  ['3. STATION_OWNER', async () => {
    const { user, cookie } = await login(demoEmail('owner'), password);
    const stations = await apiGet('/api/stations', cookie);
    const list = Array.isArray(stations.data) ? stations.data : (stations.data.items ?? []);
    const checks = [
      [true, `Đăng nhập ${user.email}`],
      [stations.status === 200 && list.length > 0, `Liệt kê trạm của chủ trạm (${list.length} trạm)`, JSON.stringify(stations)],
    ];
    const windowCounts = await Promise.all(list.map(async (station) => {
      const windows = await apiGet(`/api/stations/${station.id}/power-windows`, cookie);
      return windows.status === 200 && Array.isArray(windows.data) ? windows.data.length : -1;
    }));
    checks.push([windowCounts.length > 0 && !windowCounts.includes(-1) && windowCounts.some((n) => n > 0), `Xem khung công suất (số khung theo trạm: ${windowCounts.join(', ')})`]);
    return checks;
  }],
  ['4. OPERATOR', async () => {
    const { user, cookie } = await login(demoEmail('operator'), password);
    const points = await apiGet('/api/charge-points', cookie);
    const sessions = await apiGet('/api/sessions', cookie);
    return [
      [true, `Đăng nhập ${user.email}`],
      [points.status === 200, 'Giám sát danh sách trụ sạc', JSON.stringify(points)],
      [sessions.status === 200, 'Giám sát phiên sạc', JSON.stringify(sessions)],
    ];
  }],
  ['5. ACCOUNTANT', async () => {
    const { user, cookie } = await login(demoEmail('accountant'), password);
    const report = await apiGet('/api/reports/reconciliation?from=2026-01-01&to=2026-12-31', cookie);
    return [
      [true, `Đăng nhập ${user.email}`],
      [report.status === 200, 'Truy vấn báo cáo đối soát', JSON.stringify(report)],
    ];
  }],
  ['6. ADMIN', async () => {
    const { user, cookie } = await login(demoEmail('admin'), password);
    const audit = await apiGet('/api/audit-logs?limit=5', cookie);
    return [
      [true, `Đăng nhập ${user.email}`],
      [audit.status === 200, 'Đọc nhật ký kiểm toán', JSON.stringify(audit)],
    ];
  }],
];

async function runSmoke(password = readPassword()) {
  console.log(`==> Kiểm khói hệ thống CSMS tại ${baseUrl}`);
  const list = groups(password);
  let passed = 0;
  for (const [title, run] of list) {
    let checks;
    try {
      checks = await run();
    } catch (error) {
      checks = [[false, 'Lỗi không mong đợi', error.message]];
    }
    const ok = checks.every(([pass]) => pass);
    if (ok) passed += 1;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${title}`);
    for (const [pass, label, detail] of checks) console.log(`    ${pass ? 'ok  ' : 'LỖI'} ${label}${pass || !detail ? '' : ` -> ${detail}`}`);
  }
  console.log(`\nKẾT QUẢ KIỂM KHÓI: ${passed}/${list.length} NHÓM ĐẠT (PASS)`);
  return passed === list.length;
}

if (require.main === module) {
  runSmoke().then((ok) => process.exit(ok ? 0 : 1)).catch((error) => {
    console.error('LỖI KIỂM KHÓI NGHIÊM TRỌNG:', error);
    process.exit(1);
  });
}

module.exports = { runSmoke };
