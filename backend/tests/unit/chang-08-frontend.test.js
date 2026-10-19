const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(__dirname, '../../../frontend', file)).href);
const savedGlobals = new Map();

class Element {
  constructor(tag) {
    this.tag = tag;
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.value = '';
    this.disabled = false;
    this.hidden = false;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'value') this.value = String(value);
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
    if (this.tag === 'select' && !this.value && children.length) {
      this.value = children[0].attributes?.value ?? '';
    }
  }

  setCustomValidity() {}

  reportValidity() {
    return true;
  }

  remove() {}

  get textContent() {
    return `${this._text ?? ''}${this.children.map((child) => child.textContent ?? '').join('')}`;
  }

  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
}

function setGlobal(name, value) {
  if (!savedGlobals.has(name)) savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function installBrowser() {
  const calls = [];
  const users = [
    { id: 7, name: 'Test Target', email: 'target@test.invalid', role: 'DRIVER', roles: ['DRIVER'], created_at: '2026-10-01T00:00:00Z', disabled_at: null },
    { id: 8, name: 'Other User', email: 'other@test.invalid', role: 'OPERATOR', roles: ['OPERATOR'], created_at: '2026-10-02T00:00:00Z', disabled_at: null },
  ];
  setGlobal('Node', Element);
  const body = new Element('body');
  setGlobal('document', {
    body,
    createElement: (tag) => new Element(tag),
    createElementNS: (_namespace, tag) => new Element(tag),
    createTextNode: (text) => ({ textContent: String(text) }),
  });
  setGlobal('location', { pathname: '/app.html' });
  setGlobal('fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    let body = {};
    if (String(url).includes('/api/reports/revenue?')) {
      body = { rows: [], total: { sessions: 0, totalWh: '0', energyDong: '0', idleDong: '0', totalDong: '0' } };
    } else if (String(url).includes('/api/reports/reconciliation?')) {
      body = { issues: [], summary: { sessionsChecked: 0, issueCount: 0, totalDiffDong: '0', whMeter: '0', whBilled: '0' } };
    } else if (String(url).includes('/api/health/overview')) {
      body = { points: [{
        at: '2026-10-18T00:00:00.000Z',
        ocpp_calls: 5,
        ocpp_errors: 1,
        latency_sum_ms: 100,
        cps_online: 3,
        cps_total: 4,
        sessions_active: 2,
      }] };
    } else if (String(url).endsWith('/api/partners')) {
      body = { partners: [{ id: 55, name: 'Test Partner' }] };
    } else if (String(url).includes('/share-rates')) {
      body = { share_rates: [{ id: 1, share_bp: 7000, include_idle: true, effective_from: '2026-01-01', note: null }] };
    } else if (String(url).includes('/api/settlements/')) {
      body = {
        statement: { month: '2026-10', version: 1 },
        lines: [{
          owner_id: 55,
          from_date: '2026-10-01',
          to_date: '2026-10-31',
          share_bp: 7000,
          sessions: 1,
          energy_dong: '1000',
          idle_dong: '0',
          base_dong: '1000',
          share_dong: '700',
        }],
      };
    } else if (String(url).includes('/api/roles')) {
      body = [
        { code: 'ADMIN', name: 'Quản trị' },
        { code: 'DRIVER', name: 'Tài xế' },
        { code: 'OPERATOR', name: 'Vận hành viên' },
      ];
    } else if (new URL(String(url), 'http://localhost').pathname === '/api/admin/users' && options.method === 'GET') {
      // S2: danh sách tài khoản phân trang và tìm kiếm phía máy chủ (tham số query/page/limit).
      const search = (new URL(String(url), 'http://localhost').searchParams.get('query') ?? '').toLowerCase();
      const matched = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search));
      body = { users: matched, total: matched.length, page: 1, limit: 20 };
    } else if (String(url).includes('/api/admin/users/') && options.method === 'PUT') {
      body = { user: { ...users[0], role: JSON.parse(options.body).role, roles: [JSON.parse(options.body).role] } };
    } else if (String(url).includes('/api/admin/users/') && options.method === 'POST') {
      body = { user: { ...users[0], disabled_at: String(url).endsWith('/enable') ? null : '2026-10-18T00:00:00Z' } };
    }
    return { ok: true, status: 200, json: async () => body };
  });
  return calls;
}

function find(node, predicate) {
  return [
    ...(predicate(node) ? [node] : []),
    ...node.children.flatMap((child) => child instanceof Element ? find(child, predicate) : []),
  ];
}

afterEach(() => {
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  savedGlobals.clear();
});

describe('Chặng 8 frontend pages', () => {
  it('đăng ký bảng kê và sức khỏe đúng workspace/quyền', async () => {
    const [{ pageLoader, PAGE_NEEDS }, { WORKSPACES, visibleNav }, { can }] = await Promise.all([
      load('app/router.js'),
      load('app/workspace.js'),
      load('app/permissions.js'),
    ]);

    assert.equal(typeof pageLoader('settlements', 'admin'), 'function');
    assert.equal(typeof pageLoader('settlements', 'accountant'), 'function');
    assert.equal(typeof pageLoader('settlements', 'owner'), 'function');
    assert.equal(typeof pageLoader('health', 'admin'), 'function');
    assert.equal(typeof pageLoader('health', 'operator'), 'function');
    assert.equal(pageLoader('health', 'driver'), null);
    assert.equal(PAGE_NEEDS.health, 'health:dashboard');

    for (const workspace of ['admin', 'accountant', 'owner']) {
      const pages = visibleNav(workspace, WORKSPACES[workspace].role, can).flatMap((group) => group.items.map((item) => item.page));
      assert.ok(pages.includes('settlements'), `${workspace} should have settlements`);
    }
    for (const workspace of ['admin', 'operator']) {
      const pages = visibleNav(workspace, WORKSPACES[workspace].role, can).flatMap((group) => group.items.map((item) => item.page));
      assert.ok(pages.includes('health'), `${workspace} should have health`);
    }
  });

  it('cung cấp CSV doanh thu và đối soát với delimiter đã chọn', async () => {
    const calls = installBrowser();
    const root = new Element('root');
    const [{ render: renderRevenue }, { render: renderReconciliation }] = await Promise.all([
      load('pages/shared/revenue.js'),
      load('pages/shared/reconciliation.js'),
    ]);

    renderRevenue({ root });
    const revenueLink = find(root, (node) => node.tag === 'a' && node.attributes.href?.includes('/api/reports/revenue.csv'))[0];
    assert.ok(revenueLink);
    assert.match(revenueLink.attributes.href, /delimiter=semicolon/);
    const revenueDelimiter = find(root, (node) => node.tag === 'select' && node.attributes.name === 'delimiter')[0];
    revenueDelimiter.value = 'comma';
    revenueDelimiter.listeners.change();
    assert.match(revenueLink.attributes.href, /delimiter=comma/);

    root.replaceChildren();
    renderReconciliation({ root });
    const reconciliationLink = find(root, (node) => node.tag === 'a' && node.attributes.href?.includes('/api/reports/reconciliation.csv'))[0];
    assert.ok(reconciliationLink);
    assert.match(reconciliationLink.attributes.href, /delimiter=semicolon/);
    const reconciliationDelimiter = find(root, (node) => node.tag === 'select' && node.attributes.name === 'delimiter')[0];
    reconciliationDelimiter.value = 'comma';
    reconciliationDelimiter.listeners.change();
    assert.match(reconciliationLink.attributes.href, /delimiter=comma/);
    assert.ok(calls.some((call) => call.url.includes('/api/reports/revenue?')));
  });

  it('trang sức khỏe và bảng kê tải dữ liệu từ API tương ứng', async () => {
    const calls = installBrowser();
    const healthRoot = new Element('root');
    const settlementRoot = new Element('root');
    const { pageLoader } = await load('app/router.js');
    const health = await pageLoader('health', 'admin')();
    const settlements = await pageLoader('settlements', 'admin')();

    health.render({ root: healthRoot });
    await settlements.render({ root: settlementRoot, can: () => true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(calls.some((call) => call.url.includes('/api/health/overview')));
    assert.ok(calls.some((call) => call.url.includes('/api/partners')));
    assert.ok(calls.some((call) => call.url.includes('/share-rates')));
    assert.ok(calls.some((call) => call.url.includes('/api/settlements/')));
    assert.ok(healthRoot.textContent.includes('3 / 4'));
    assert.ok(settlementRoot.textContent.includes('Test Partner'));
    assert.ok(settlementRoot.textContent.includes('Nền chia'));
  });

  it('trang tài khoản quản trị tải danh sách người dùng', async () => {
    const calls = installBrowser();
    const root = new Element('root');
    const { render } = await load('pages/admin/users.js');

    await render({ root });
    assert.ok(calls.some((call) => call.url.includes('/api/admin/users')));
    assert.ok(root.textContent.includes('target@test.invalid'));

    const search = find(root, (node) => node.tag === 'input' && node.attributes.type === 'search')[0];
    search.value = 'target';
    search.listeners.input();
    await new Promise((resolve) => setTimeout(resolve, 400)); // S2: ô tìm kiếm debounce 300 ms rồi gọi API với query=target
    assert.ok(calls.some((call) => call.url.includes('query=target')));
    assert.ok(root.textContent.includes('target@test.invalid'));
    assert.ok(!root.textContent.includes('other@test.invalid'));

    const roleSelect = find(root, (node) => node.tag === 'select' && node.attributes['aria-label'] === 'Vai trò của target@test.invalid')[0];
    roleSelect.value = 'OPERATOR';
    const saveRole = find(root, (node) => node.tag === 'button' && node.textContent === 'Lưu vai trò')[0];
    await saveRole.listeners.click();
    assert.ok(calls.some((call) => call.options.method === 'PUT' && call.url.endsWith('/role')));

    const disable = find(root, (node) => node.tag === 'button' && node.textContent === 'Khóa')[0];
    await disable.listeners.click();
    assert.ok(calls.some((call) => call.options.method === 'POST' && call.url.endsWith('/disable')));

    const enable = find(root, (node) => node.tag === 'button' && node.textContent === 'Mở khóa')[0];
    await enable.listeners.click();
    assert.ok(calls.some((call) => call.options.method === 'POST' && call.url.endsWith('/enable')));
  });
});
