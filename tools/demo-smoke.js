#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

async function request(route, { method = 'GET', body, cookie, baseUrl } = {}) {
  const response = await fetch(new URL(route, baseUrl), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${method} ${route} trả dữ liệu không phải JSON (HTTP ${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`${method} ${route} thất bại (HTTP ${response.status}): ${data?.error?.message || response.statusText}`);
  }
  return { data, response };
}

async function login(email, demoPassword, baseUrl) {
  const { data, response } = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password: demoPassword },
    baseUrl,
  });
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie, `Đăng nhập ${email} không trả cookie phiên`);
  return { user: data.user, cookie };
}

async function check(label, action) {
  await action();
  console.log(`PASS ${label}`);
}

async function main({
  baseUrl = process.env.CSMS_URL || 'http://localhost:3000',
  emailDomain = process.env.DEMO_EMAIL_DOMAIN || 'demo.csms.local',
  demoPassword = process.env.DEMO_PASSWORD,
} = {}) {
  if (!demoPassword || demoPassword.length < 8) {
    throw new Error('Cần DEMO_PASSWORD (tối thiểu 8 ký tự) giống giá trị đã dùng cho seed-demo.');
  }
  const api = (route, options = {}) => request(route, { ...options, baseUrl });
  const authenticate = (email) => login(email, demoPassword, baseUrl);
  let stationId;
  let driver;

  await check('tài khoản demo chủ trạm đăng nhập được', async () => {
    const owner = await authenticate(`owner@${emailDomain}`);
    const stations = await api('/api/stations', { cookie: owner.cookie });
    const station = stations.data.find((item) => item.name === 'Trạm Cầu Giấy');
    assert.ok(station, 'Thiếu Trạm Cầu Giấy trong dữ liệu demo chủ trạm');
    stationId = station.id;
  });

  await check('lịch hạn mức theo giờ được phục vụ từ API', async () => {
    const owner = await authenticate(`owner@${emailDomain}`);
    const { data } = await api(`/api/stations/${stationId}/power-windows`, { cookie: owner.cookie });
    assert.ok(data.some((window) => window.startTime === '00:00'
      && window.endTime === '06:00' && window.limitKw === 22));
    assert.ok(data.some((window) => window.startTime === '17:00'
      && window.endTime === '21:00' && window.limitKw === 22));
  });

  await check('tài khoản demo tài xế đăng nhập được', async () => {
    driver = await authenticate(`driver@${emailDomain}`);
    assert.ok(driver.user?.id, 'Thiếu mã tài xế trong phản hồi đăng nhập');
  });

  await check('ví demo và giao dịch phí gói có dữ liệu', async () => {
    const wallet = await api(`/api/drivers/${driver.user.id}/wallet`, { cookie: driver.cookie });
    assert.ok(BigInt(wallet.data.balanceDong) >= 0n);
    const transactions = await api(`/api/drivers/${driver.user.id}/wallet/transactions?page=1`, {
      cookie: driver.cookie,
    });
    assert.ok(transactions.data.items.some((entry) => entry.type === 'SUBSCRIPTION_FEE'));
  });

  await check('gói VIP tháng có giá và kỳ hạn cấu hình đúng', async () => {
    const { data } = await api('/api/me/subscription', { cookie: driver.cookie });
    assert.deepEqual(data.plan, {
      code: 'VIP',
      name: 'VIP',
      feeDong: 299000,
      pricePerKwhDong: 30000,
      durationDays: 30,
    });
    assert.equal(data.current?.planCode, 'VIP');
  });

  await check('danh sách đặt chỗ của tài xế được phục vụ', async () => {
    const { data } = await api('/api/me/reservations', { cookie: driver.cookie });
    assert.ok(Array.isArray(data));
  });

  console.log('KẾT QUẢ: 6/6 kiểm khói đạt.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`KẾT QUẢ: kiểm khói thất bại — ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
