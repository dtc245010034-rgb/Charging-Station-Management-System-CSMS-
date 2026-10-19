const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { installDom, frontend, waitFor } = require('../helpers/dom');

const TOTAL = 28;
const ALL_USERS = Array.from({ length: TOTAL }, (_, i) => ({
  id: String(i + 1),
  name: `Nguoi dung ${String(i + 1).padStart(2, '0')}`,
  email: `user${String(i + 1).padStart(2, '0')}@test.invalid`,
  roles: ['DRIVER'],
  role: 'DRIVER',
  created_at: '2026-01-01T00:00:00Z',
  disabled_at: null,
}));
const ROLES = ['ADMIN', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT', 'DRIVER'].map((code) => ({ code, name: code }));

// Giả lập backend: phân trang và tìm kiếm giống GET /api/admin/users (tham số query, page, limit).
function fakeBackend(url) {
  if (url === '/api/roles') return { body: ROLES };
  const parsed = new URL(url, 'http://localhost');
  if (parsed.pathname !== '/api/admin/users') return { status: 404, body: { error: { message: 'không có' } } };
  const q = (parsed.searchParams.get('query') ?? '').toLowerCase();
  const page = Number(parsed.searchParams.get('page') ?? 1);
  const limit = Number(parsed.searchParams.get('limit') ?? 20);
  const matched = ALL_USERS.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
  return { body: { users: matched.slice((page - 1) * limit, page * limit), total: matched.length, page, limit } };
}

describe('S2 giao diện: Quản lý tài khoản phân trang và tìm kiếm', () => {
  let env;
  afterEach(() => env?.restore());

  async function open() {
    env = installDom({ respond: fakeBackend });
    const { render } = await frontend('pages/admin/users.js');
    const root = env.document.getElementById('root');
    await render({ root });
    const rows = () => [...root.querySelectorAll('tbody tr')].map((tr) => tr.children[1]?.textContent);
    const button = (label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);
    return { root, rows, button, status: () => root.querySelector('.pagination .muted').textContent };
  }

  it('trang 1 hiện 20 tài khoản kèm "Hiện 1–20 / 28"; bấm sang trang 2 thấy 8 tài khoản còn lại (đủ 28)', async () => {
    const ui = await open();
    assert.strictEqual(ui.rows().length, 20);
    assert.match(ui.status(), /Hiện 1–20 \/ 28/);
    assert.strictEqual(ui.button('Trang trước').disabled, true);

    ui.button('Trang sau').click();
    await waitFor(() => /Hiện 21–28 \/ 28/.test(ui.status()) && ui.rows().length === 8);
    assert.strictEqual(ui.rows().length, 8);
    assert.strictEqual(ui.button('Trang sau').disabled, true);

    const seen = new Set(ui.rows());
    ui.button('Trang trước').click();
    await waitFor(() => /Hiện 1–20/.test(ui.status()) && ui.rows().length === 20);
    ui.rows().forEach((email) => seen.add(email));
    assert.strictEqual(seen.size, TOTAL, 'hai trang gộp lại phải đủ 28 tài khoản khác nhau');
  });

  it('ô tìm kiếm tìm được tài khoản thứ 21+ (nằm trang 2) và về trang 1 của kết quả', async () => {
    const ui = await open();
    ui.button('Trang sau').click();
    await waitFor(() => /Hiện 21–28/.test(ui.status()) && ui.rows().length === 8);

    const input = ui.root.querySelector('input[type="search"]');
    input.value = 'user27';
    input.dispatchEvent(new env.dom.window.Event('input', { bubbles: true }));
    await waitFor(() => ui.rows().length === 1 && ui.rows()[0] === 'user27@test.invalid');
    assert.match(ui.status(), /Hiện 1–1 \/ 1 · Trang 1 \/ 1/);
  });

  it('tìm không có kết quả hiện thông báo rõ ràng, tổng 0', async () => {
    const ui = await open();
    const input = ui.root.querySelector('input[type="search"]');
    input.value = 'khong-ton-tai';
    input.dispatchEvent(new env.dom.window.Event('input', { bubbles: true }));
    await waitFor(() => /Hiện 0–0 \/ 0/.test(ui.status()));
    assert.deepStrictEqual(ui.root.querySelector('tbody').textContent, 'Không tìm thấy người dùng');
  });

  it('đổi kích thước trang về 10 thì có 3 trang và gửi đúng limit/page lên máy chủ', async () => {
    const ui = await open();
    const select = ui.root.querySelector('select[aria-label="Số tài khoản mỗi trang"]');
    select.value = '10';
    select.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }));
    await waitFor(() => /Hiện 1–10 \/ 28 · Trang 1 \/ 3/.test(ui.status()));
    assert.ok(env.calls.some((c) => c.url.includes('page=1') && c.url.includes('limit=10')));
  });
});
