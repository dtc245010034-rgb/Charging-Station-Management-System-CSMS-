const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { installDom, frontend, waitFor } = require('../helpers/dom');

// Hình dạng phản hồi lấy đúng từ API thật (GET /api/subscription-plans và /api/me/subscriptions trả MẢNG; đơn giá là `pricePerKwh`).
const PLAN = {
  id: '1', code: 'GOI_THANG_DEMO_3500', name: 'Gói Tháng Tiết Kiệm 3.500', priceDong: '300000', durationDays: 30,
  idleGraceMin: null, idlePerMinDong: null, active: true, createdBy: '1', createdAt: '2026-10-19T06:40:14.275Z',
  periods: [{ startMinute: 0, endMinute: 1440, from: '00:00', to: '24:00', pricePerKwh: '3500', label: 'Đồng giá cả ngày' }],
};
const SUBSCRIPTION = {
  id: '9', driverId: '6', planId: '1', planCode: PLAN.code, planName: PLAN.name,
  startsAt: new Date(Date.now() - 86400000).toISOString(), endsAt: new Date(Date.now() + 20 * 86400000).toISOString(),
  priceDong: '300000', idempotencyKey: 'k', createdAt: new Date().toISOString(),
};

function backend({ plans = [PLAN], subscriptions = [], plansStatus = 200, onBuy } = {}) {
  return (url, options = {}) => {
    const path = String(url).split('?')[0];
    if (path === '/api/subscription-plans') {
      return plansStatus === 200 ? { body: plans } : { status: plansStatus, body: { error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống' } } };
    }
    if (path === '/api/me/subscriptions' && options.method === 'POST') return { status: 201, body: onBuy?.(JSON.parse(options.body)) ?? SUBSCRIPTION };
    if (path === '/api/me/subscriptions') return { body: subscriptions };
    if (path.endsWith('/wallet')) return { body: { balanceDong: '1000000', minBalanceDong: '50000', inDebt: false, locked: false } };
    if (path.endsWith('/wallet/transactions')) return { body: { page: 1, hasMore: false, items: [] } };
    return { status: 404, body: { error: { message: 'không có' } } };
  };
}

describe('S8 giao diện: trang ví tài xế, mục gói thuê bao', () => {
  let env;
  let dispose;
  afterEach(() => { dispose?.(); env?.restore(); });

  async function open(options) {
    env = installDom({ respond: backend(options) });
    const { render } = await frontend('pages/driver/wallet.js');
    const root = env.document.getElementById('root');
    dispose = render({ root, user: { id: '6' }, params: { query: {} } });
    await waitFor(() => root.textContent.includes('Số dư hiện tại'));
    await waitFor(() => root.querySelector('section[aria-busy]') === null && /Gói thuê bao tháng/.test(root.textContent));
    return root;
  }

  it('chưa có gói nào mở bán: hiện câu thông báo rõ ràng thay vì khung trống', async () => {
    const root = await open({ plans: [] });
    assert.match(root.textContent, /Hiện chưa có gói thuê bao nào được mở bán\./);
    assert.strictEqual([...root.querySelectorAll('button')].filter((b) => /Mua gói/.test(b.textContent)).length, 0);
  });

  it('có gói mở bán: hiện tên, giá 300.000 đ, đơn giá 3.500 đ/kWh và nút Mua gói dùng được', async () => {
    const root = await open();
    assert.match(root.textContent, /Gói Tháng Tiết Kiệm 3\.500/);
    assert.match(root.textContent, /300\.000\s*đ/);
    assert.match(root.textContent, /00:00 - 24:00: 3\.500\s*đ\/kWh/);
    assert.doesNotMatch(root.textContent, /Hiện chưa có gói thuê bao/);
    const buy = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Mua gói');
    assert.ok(buy && !buy.disabled);
  });

  it('bấm Mua gói gửi POST /api/me/subscriptions với planId của gói và header Idempotency-Key', async () => {
    let body;
    const root = await open({ onBuy: (payload) => { body = payload; return SUBSCRIPTION; } });
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Mua gói').click();
    await waitFor(() => body);
    assert.deepStrictEqual(body, { planId: '1' });
    const call = env.calls.find((c) => c.options?.method === 'POST');
    assert.ok(call.options.headers['Idempotency-Key'].length >= 16);
  });

  it('đang có gói còn hiệu lực: hiện thẻ "Gói đang dùng" và khoá nút mua', async () => {
    const root = await open({ subscriptions: [SUBSCRIPTION] });
    assert.match(root.textContent, /Gói đang dùng: Gói Tháng Tiết Kiệm 3\.500/);
    const buy = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Đã có gói');
    assert.ok(buy && buy.disabled);
  });

  it('gói đã hết hạn không tính là đang dùng', async () => {
    const expired = { ...SUBSCRIPTION, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-02-01T00:00:00Z' };
    const root = await open({ subscriptions: [expired] });
    assert.doesNotMatch(root.textContent, /Gói đang dùng/);
    assert.match(root.textContent, /Bạn chưa đăng ký gói thuê bao nào\./);
  });

  it('lỗi tải gói hiện thông báo lỗi, không phải khung trống', async () => {
    const root = await open({ plansStatus: 500 });
    assert.match(root.textContent, /Không thể tải danh sách gói/);
  });

  it('thứ tự tiêu đề liên tục: h1 rồi h2 (không nhảy h3)', async () => {
    const root = await open();
    const levels = [...root.querySelectorAll('h1,h2,h3,h4')].map((el) => Number(el.tagName[1]));
    assert.strictEqual(levels[0], 1);
    for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] - levels[i - 1] <= 1, `nhảy cấp tiêu đề: ${levels.join(',')}`);
  });
});
