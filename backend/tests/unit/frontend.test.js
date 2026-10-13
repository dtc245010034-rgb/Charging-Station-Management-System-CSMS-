const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(__dirname, '../../../frontend', file)).href);

function stubBrowser({ pathname = '/pages/admin.html', respond }) {
  const calls = { fetch: [], replace: [], storageWrites: [] };
  const storage = { setItem: (...a) => calls.storageWrites.push(a), getItem: () => null, removeItem: () => {} };
  const saved = {};
  const define = (name, value) => {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  define('location', { pathname, replace: (url) => calls.replace.push(url) });
  define('localStorage', storage);
  define('sessionStorage', storage);
  define('fetch', async (url, options) => {
    calls.fetch.push({ url, options });
    const { status = 200, body = null } = respond(url, options);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
  const restore = () => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  return { calls, restore };
}

describe('S-02 frontend: router', () => {
  it('homePathFor: mỗi vai trò có workspace riêng, vai trò lạ về /index.html', async () => {
    const { homePathFor } = await load('app/workspace.js');
    assert.strictEqual(homePathFor('ADMIN'), '/app.html#/admin/overview');
    assert.strictEqual(homePathFor('STATION_OWNER'), '/app.html#/owner/overview');
    assert.strictEqual(homePathFor('OPERATOR'), '/app.html#/operator/overview');
    assert.strictEqual(homePathFor('ACCOUNTANT'), '/app.html#/accountant/overview');
    assert.strictEqual(homePathFor('DRIVER'), '/app.html#/driver/overview');
    assert.strictEqual(homePathFor('ROOT'), '/index.html');
    assert.strictEqual(homePathFor(null), '/index.html');
  });

  it('parseHash: tách workspace, trang, id và query; thiếu trang thì là overview', async () => {
    const { parseHash } = await load('app/router.js');
    assert.deepStrictEqual(parseHash('#/operator/charge-points/12?status=fault'), { workspace: 'operator', page: 'charge-points', id: '12', query: { status: 'fault' } });
    assert.strictEqual(parseHash('#/owner').page, 'overview');
    assert.strictEqual(parseHash('').workspace, undefined);
  });

  it('nav: mục chưa có backend (enabled:false) không bao giờ hiện; phiên bất thường chỉ hiện cho Operator/Kế toán/Admin', async () => {
    const { visibleNav, WORKSPACES } = await load('app/workspace.js');
    const { can } = await load('app/permissions.js');
    const pages = (ws) => visibleNav(ws, WORKSPACES[ws].role, can).flatMap((g) => g.items.map((i) => i.page));
    assert.ok(pages('operator').includes('sessions') && !pages('operator').includes('alerts'));
    assert.ok(pages('operator').includes('unexpected-sessions'));
    assert.ok(pages('operator').includes('stations') && pages('admin').includes('users'));
    assert.ok(pages('admin').includes('sessions'));
    assert.ok(!pages('owner').includes('sessions') && !pages('accountant').includes('sessions'));
    assert.ok(pages('accountant').includes('unexpected-sessions'));
    assert.ok(pages('admin').includes('unexpected-sessions'));
    assert.ok(pages('driver').includes('sessions'));
  });

  it('S-11 T-24: operator và owner có đường dẫn tới lưới trạng thái', async () => {
    const { visibleNav, WORKSPACES } = await load('app/workspace.js');
    const { can } = await load('app/permissions.js');
    const { pageLoader, PAGE_NEEDS } = await load('app/router.js');
    const pages = (workspace) => visibleNav(workspace, WORKSPACES[workspace].role, can).flatMap((group) => group.items.map((item) => item.page));

    assert.ok(pages('operator').includes('fleet-status'));
    assert.ok(pages('owner').includes('fleet-status'));
    assert.ok(pages('admin').includes('fleet-status'), 'admin cần vào được trang có nút Khởi động lại (charge-points:reset)');
    assert.strictEqual(PAGE_NEEDS['fleet-status'], 'charge-points:read');
    assert.strictEqual(typeof pageLoader('fleet-status', 'operator'), 'function');
  });

  it('S-23: trang phiên vận hành chỉ được tải ở Operator và Admin', async () => {
    const { pageLoader, PAGE_NEEDS } = await load('app/router.js');
    assert.strictEqual(typeof pageLoader('sessions', 'operator'), 'function');
    assert.strictEqual(typeof pageLoader('sessions', 'admin'), 'function');
    assert.strictEqual(pageLoader('sessions', 'owner'), null);
    assert.deepStrictEqual(PAGE_NEEDS.sessions, ['sessions:read-own', 'sessions:read']);
  });

  it('S-25: trang phiên bất thường chỉ được tải cho Operator, Kế toán và Admin', async () => {
    const { pageLoader, PAGE_NEEDS } = await load('app/router.js');
    const { can } = await load('app/permissions.js');
    assert.strictEqual(typeof pageLoader('unexpected-sessions', 'operator'), 'function');
    assert.strictEqual(typeof pageLoader('unexpected-sessions', 'accountant'), 'function');
    assert.strictEqual(typeof pageLoader('unexpected-sessions', 'admin'), 'function');
    assert.strictEqual(pageLoader('unexpected-sessions', 'owner'), null);
    assert.strictEqual(PAGE_NEEDS['unexpected-sessions'], 'sessions:unexpected:read');
    for (const role of ['OPERATOR', 'ACCOUNTANT', 'ADMIN']) {
      assert.ok(can(role, 'sessions:unexpected:read'), `${role} can read`);
    }
    assert.ok(!can('ACCOUNTANT', 'sessions:unexpected:close'));
    assert.ok(can('OPERATOR', 'sessions:unexpected:close'));
    assert.ok(can('ADMIN', 'sessions:unexpected:close'));
  });

  it('S-33: trang hóa đơn chỉ được tải cho tài xế có quyền đọc hóa đơn của mình', async () => {
    const { pageLoader, PAGE_NEEDS } = await load('app/router.js');
    const { can } = await load('app/permissions.js');
    assert.strictEqual(typeof pageLoader('invoice', 'driver'), 'function');
    assert.strictEqual(pageLoader('invoice', 'operator'), null);
    assert.strictEqual(PAGE_NEEDS.invoice, 'invoices:read-own');
    assert.ok(can('DRIVER', 'invoices:read-own'));
    assert.ok(!can('DRIVER', 'invoices:read'));
  });

  it('S-27: nhật ký điều khiển chỉ hiện và chỉ tải cho Admin', async () => {
    const { pageLoader, PAGE_NEEDS } = await load('app/router.js');
    const { visibleNav, WORKSPACES } = await load('app/workspace.js');
    const { can } = await load('app/permissions.js');
    assert.strictEqual(pageLoader('control-log', 'operator'), null);
    assert.strictEqual(typeof pageLoader('control-log', 'admin'), 'function');
    assert.strictEqual(pageLoader('control-log', 'accountant'), null);
    assert.strictEqual(pageLoader('control-log', 'driver'), null);
    assert.strictEqual(pageLoader('control-log', 'owner'), null);
    assert.strictEqual(PAGE_NEEDS['control-log'], 'audit-logs:read');
    assert.ok(can('ADMIN', 'audit-logs:read'));
    assert.ok(!can('OPERATOR', 'audit-logs:read'));
    assert.ok(!can('ACCOUNTANT', 'audit-logs:read'));
    const operatorPages = visibleNav('operator', WORKSPACES.operator.role, can).flatMap((group) => group.items.map((item) => item.page));
    const adminPages = visibleNav('admin', WORKSPACES.admin.role, can).flatMap((group) => group.items.map((item) => item.page));
    assert.ok(!operatorPages.includes('control-log'));
    assert.ok(adminPages.includes('control-log'));
  });

  it('S-27: restores filters from URL, syncs pagination, translates badges, and renders metadata as text', async () => {
    const saved = new Map();
    const calls = [];
    const define = (name, value) => {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    };
    class Element {
      constructor(tag) {
        this.tag = tag;
        this.attributes = {};
        this.children = [];
        this.listeners = {};
        this.style = {};
        this.dataset = {};
        this.disabled = false;
        this.value = '';
      }
      setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'value') this.value = String(value);
      }
      addEventListener(name, handler) { this.listeners[name] = handler; }
      append(...children) { this.children.push(...children); }
      replaceChildren(...children) { this.children = children; }
      get textContent() { return this.children.map((child) => child.textContent ?? '').join(''); }
      set textContent(value) { this.children = [{ textContent: String(value) }]; }
    }
    const location = { pathname: '/app.html', search: '', hash: '#/admin/control-log?page=2' };
    define('Node', Element);
    define('document', {
      createElement: (tag) => new Element(tag),
      createElementNS: (_namespace, tag) => new Element(tag),
      createTextNode: (text) => ({ textContent: String(text) }),
    });
    define('location', location);
    define('history', {
      replaceState: (_state, _title, url) => { location.hash = new URL(url, 'http://localhost').hash; },
    });
    let failNext = false;
    define('fetch', async (url) => {
      calls.push(url);
      if (failNext) {
        failNext = false;
        return { ok: false, status: 500, json: async () => ({ error: { message: 'Lỗi tải nhật ký' } }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 101,
          items: [{
            id: '1',
            created_at: '2026-10-11T17:00:00.000Z',
            user_id: '7',
            user_name: 'Admin',
            action: 'REMOTE_START',
            entity: 'connector',
            entity_id: '2',
            charge_point_code: 'CP-2',
            result: 'ACCEPTED',
            ip: '203.0.113.42',
            metadata: { note: '<img src=x onerror=alert(1)>' },
          }],
        }),
      };
    });

    let dispose;
    try {
      const { render, auditActionLabel, auditResultLabel } = await load('pages/shared/audit-logs.js');
      const root = new Element('root');
      dispose = render({
        root,
        workspace: 'admin',
        params: { query: { page: '2', charge_point: 'CP & 2', user: 'Admin', from: '2026-10-11', to: '2026-10-12' } },
        can: () => true,
      });
      await new Promise((resolve) => setImmediate(resolve));
      assert.match(calls[0], /page=2/);
      assert.match(calls[0], /charge_point=CP\+%26\+2/);
      assert.match(calls[0], /from=2026-10-11/);

      const find = (node, predicate) => [
        ...(predicate(node) ? [node] : []),
        ...node.children.flatMap((child) => child instanceof Element ? find(child, predicate) : []),
      ];
      const pre = find(root, (node) => node.tag === 'pre')[0];
      assert.ok(pre);
      assert.match(pre.textContent, /<img src=x onerror=alert\(1\)>/);
      assert.equal(find(root, (node) => node.tag === 'img').length, 0);
      assert.ok(find(root, (node) => node.tag === 'span').some((node) => node.textContent === 'Bắt đầu sạc từ xa'));
      assert.ok(find(root, (node) => node.tag === 'span').some((node) => node.textContent === 'Đã chấp nhận'));
      assert.ok(find(root, (node) => node.tag === 'td').some((node) => node.textContent === '203.0.113.42'));
      assert.ok(find(root, (node) => node.tag === 'span' && node.attributes.class === 'badge badge--ready').length > 0);
      assert.equal(auditActionLabel('UNKNOWN_ACTION'), 'UNKNOWN_ACTION');
      assert.equal(auditResultLabel('TIMED_OUT'), 'Hết thời gian');
      assert.equal(auditResultLabel('Accepted'), 'Đã chấp nhận');

      const next = find(root, (node) => node.tag === 'button' && node.textContent === 'Trang sau')[0];
      next.listeners.click();
      await new Promise((resolve) => setImmediate(resolve));
      assert.match(location.hash, /page=3/);
      assert.match(location.hash, /user=Admin/);

      const inputs = find(root, (node) => node.tag === 'input');
      inputs.find((node) => node.attributes.name === 'charge_point').value = 'CP-3';
      const form = find(root, (node) => node.tag === 'form')[0];
      form.listeners.submit({ preventDefault() {} });
      await new Promise((resolve) => setImmediate(resolve));
      assert.match(location.hash, /page=1/);
      assert.match(location.hash, /charge_point=CP-3/);

      failNext = true;
      const refresh = find(root, (node) => node.tag === 'button' && node.textContent.includes('Làm mới'))[0];
      refresh.listeners.click();
      await new Promise((resolve) => setImmediate(resolve));
      assert.ok(find(root, (node) => node.attributes.class === 'state state--error').length > 0);
      assert.ok(find(root, (node) => node.tag === 'p' && node.textContent === 'Lỗi tải nhật ký').length > 0);
      const retry = find(root, (node) => node.tag === 'button' && node.textContent.includes('Thử lại'))[0];
      retry.listeners.click();
      await new Promise((resolve) => setImmediate(resolve));
      assert.ok(find(root, (node) => node.tag === 'pre').length > 0);
    } finally {
      dispose?.();
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });

  it('S-25: sửa ô lý do xóa custom validity sau khi submit lý do trắng', async () => {
    const saved = new Map();
    const define = (name, value) => {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    };
    class Element {
      constructor(tag) {
        this.tag = tag;
        this.attributes = {};
        this.children = [];
        this.listeners = {};
        this.style = {};
        this.dataset = {};
      }
      setAttribute(name, value) { this.attributes[name] = String(value); }
      addEventListener(name, handler) { this.listeners[name] = handler; }
      append(...children) { this.children.push(...children); }
      replaceChildren(...children) { this.children = children; }
      setCustomValidity(message) { this.customValidity = message; }
      reportValidity() { this.didReportValidity = true; }
    }
    define('Node', Element);
    define('document', {
      createElement: (tag) => new Element(tag),
      createElementNS: (_namespace, tag) => new Element(tag),
      createTextNode: (text) => ({ textContent: String(text) }),
    });
    define('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => [{
        id: 25,
        charge_point_code: 'CP-25',
        connector_no: 1,
        latest_readings: [],
      }],
    }));
    define('location', { pathname: '/app.html', replace() {} });
    define('setInterval', () => 1);
    define('clearInterval', () => {});

    let dispose;
    try {
      const { render } = await load('pages/shared/unexpected-sessions.js');
      const root = new Element('root');
      dispose = render({ root, can: () => true });
      await new Promise((resolve) => setImmediate(resolve));
      const find = (node, predicate) => [
        ...(predicate(node) ? [node] : []),
        ...node.children.flatMap((child) => child instanceof Element ? find(child, predicate) : []),
      ];
      const reason = find(root, (node) => node.tag === 'input' && node.attributes.name === 'reason')[0];
      const form = find(root, (node) => node.tag === 'form')[0];
      assert.ok(reason);
      assert.ok(form);
      reason.value = '   ';
      await form.listeners.submit({ preventDefault() {} });
      assert.equal(reason.customValidity, 'Vui lòng nhập lý do đóng phiên.');
      assert.equal(reason.didReportValidity, true);

      reason.value = 'Đã kiểm tra';
      reason.listeners.input();
      assert.equal(reason.customValidity, '');
    } finally {
      dispose?.();
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });

  it('S-24: trang bắt đầu sạc chỉ được tải cho tài xế có quyền RemoteStart', async () => {
    const { pageLoader, PAGE_NEEDS } = await load('app/router.js');
    assert.strictEqual(typeof pageLoader('start', 'driver'), 'function');
    assert.strictEqual(pageLoader('start', 'operator'), null);
    assert.strictEqual(PAGE_NEEDS.start, 'remote-start:create');
  });

  it('S-24: điều hướng phiên sạc dùng đúng route mà router đăng ký', async () => {
    const { parseHash, pageLoader } = await load('app/router.js');
    const route = parseHash('#/driver/sessions');
    assert.equal(route.workspace, 'driver');
    assert.equal(route.page, 'sessions');
    assert.equal(typeof pageLoader(route.page, route.workspace), 'function');
  });

  it('quyền nút trên giao diện: Reset cho Admin/Operator, khoá trạm chỉ Admin', async () => {
    const { can } = await load('app/permissions.js');
    assert.ok(can('ADMIN', 'charge-points:reset') && can('OPERATOR', 'charge-points:reset'));
    assert.ok(!can('STATION_OWNER', 'charge-points:reset') && !can('DRIVER', 'charge-points:reset'));
    assert.ok(can('ADMIN', 'stations:lock'));
    for (const role of ['OPERATOR', 'STATION_OWNER', 'ACCOUNTANT', 'DRIVER']) assert.ok(!can(role, 'stations:lock'), role);
  });

  it('status: gom 9 trạng thái OCPP vào nhóm hiển thị, trạng thái lạ/UNKNOWN là offline, giá trị gốc không đổi', async () => {
    const { groupOf, OCPP_STATUSES, CONNECTOR_STATUS_LABELS, worstGroup, countByGroup } = await load('app/status.js');
    assert.strictEqual(OCPP_STATUSES.length, 9);
    assert.ok(OCPP_STATUSES.every((s) => ['ready', 'charging', 'fault', 'offline'].includes(groupOf(s))));
    assert.strictEqual(groupOf('UNKNOWN'), 'offline');
    assert.strictEqual(groupOf('Faulted'), 'fault');
    assert.deepStrictEqual(
      ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'ERROR'].map((status) => CONNECTOR_STATUS_LABELS[status]),
      ['Rảnh', 'Bận', 'Đặt chỗ', 'Lỗi']
    );
    assert.deepStrictEqual(
      ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'ERROR'].map(groupOf),
      ['ready', 'charging', 'ready', 'fault']
    );
    assert.strictEqual(worstGroup(['Available', 'Faulted', 'Charging']), 'fault');
    assert.deepStrictEqual(countByGroup(['Available', 'Charging', 'UNKNOWN']), { ready: 1, charging: 1, warning: 0, fault: 0, offline: 1 });
  });

  it('F2: trụ ONLINE (đang kết nối) thuộc nhóm Sẵn sàng, nhãn dễ hiểu, giá trị gốc không đổi', async () => {
    const { groupOf, statusLabel } = await load('app/status.js');
    assert.strictEqual(groupOf('ONLINE'), 'ready');
    assert.strictEqual(statusLabel('ONLINE'), 'Sẵn sàng');
    assert.strictEqual(statusLabel('UNKNOWN'), 'Chưa rõ');
    assert.strictEqual(statusLabel('ERROR'), 'Lỗi');
  });

  it('F4: đầu nối UNAVAILABLE thuộc nhóm ngoại tuyến, nhãn "Tạm ngừng"', async () => {
    const { groupOf, statusLabel } = await load('app/status.js');
    assert.strictEqual(groupOf('UNAVAILABLE'), 'offline');
    assert.strictEqual(statusLabel('UNAVAILABLE'), 'Tạm ngừng');
  });

  it('F2: màu đại diện của trụ ONLINE lấy theo đầu nối nặng nhất; trụ không ONLINE không bị đầu nối kéo lên', async () => {
    const { pointGroup, worstGroup, countByGroup } = await load('app/status.js');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['AVAILABLE'] }), 'ready');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['AVAILABLE', 'OCCUPIED'] }), 'charging');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['OCCUPIED', 'ERROR'] }), 'fault');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['UNAVAILABLE', 'UNKNOWN'] }), 'ready');
    assert.strictEqual(pointGroup({ status: 'ONLINE' }), 'ready');
    assert.strictEqual(pointGroup({ status: 'UNKNOWN', connector_statuses: ['ERROR'] }), 'offline');
    const points = [{ status: 'ONLINE', connector_statuses: ['ERROR'] }, { status: 'ONLINE', connector_statuses: ['AVAILABLE'] }, { status: 'UNKNOWN' }];
    assert.strictEqual(worstGroup(points, pointGroup), 'fault');
    assert.deepStrictEqual(countByGroup(points, pointGroup), { ready: 1, charging: 0, warning: 0, fault: 1, offline: 1 });
  });

  it('trụ ONLINE mà mọi đầu nối đều UNAVAILABLE là ngoại tuyến; đầu nối UNKNOWN (chưa báo trạng thái) không hạ cấp trụ', async () => {
    const { pointGroup, countByGroup } = await load('app/status.js');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['UNAVAILABLE'] }), 'offline');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['UNAVAILABLE', 'UNAVAILABLE'] }), 'offline');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['UNKNOWN'] }), 'ready');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['UNAVAILABLE', 'UNKNOWN'] }), 'ready');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['UNAVAILABLE', 'AVAILABLE'] }), 'ready');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['UNAVAILABLE', 'OCCUPIED'] }), 'charging');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: ['UNAVAILABLE', 'ERROR'] }), 'fault');
    assert.strictEqual(pointGroup({ status: 'ONLINE', connector_statuses: [] }), 'ready');
    const points = [{ status: 'ONLINE', connector_statuses: ['UNAVAILABLE'] }, { status: 'ONLINE', connector_statuses: ['AVAILABLE'] }];
    assert.deepStrictEqual(countByGroup(points, pointGroup), { ready: 1, charging: 0, warning: 0, fault: 0, offline: 1 });
  });

  it('nhãn trạng thái trụ khớp chú giải: UNKNOWN là "Ngoại tuyến / chưa rõ", ONLINE-toàn-đầu-nối-tạm-ngừng là "Trực tuyến – tạm ngừng"; nhãn đầu nối giữ nguyên', async () => {
    const { pointLabel, pointGroup, statusLabel } = await load('app/status.js');
    assert.strictEqual(pointLabel('UNKNOWN', 'offline'), 'Ngoại tuyến / chưa rõ');
    assert.strictEqual(pointLabel(undefined, 'offline'), 'Ngoại tuyến / chưa rõ');
    const idle = { status: 'ONLINE', connector_statuses: ['UNAVAILABLE'] };
    assert.strictEqual(pointLabel(idle.status, pointGroup(idle)), 'Trực tuyến – tạm ngừng');
    assert.strictEqual(pointLabel('ONLINE', 'ready'), 'Sẵn sàng');
    assert.strictEqual(pointLabel('ONLINE', 'fault'), 'Lỗi');
    assert.strictEqual(statusLabel('UNKNOWN'), 'Chưa rõ');
    assert.strictEqual(statusLabel('UNAVAILABLE'), 'Tạm ngừng');
  });
});

describe('F12: nhãn trạng thái trụ thống nhất giữa trang Trụ sạc và Trạng thái trụ', () => {
  it('fleetPointLabel: cùng một trụ cho cùng một nhãn và màu ở cả hai trang', async () => {
    const { fleetPointLabel, pointLabel, pointGroup } = await load('app/status.js');
    const idle = { status: 'ONLINE', offline: false, connectors: [{ status: 'UNAVAILABLE' }, { status: 'UNAVAILABLE' }] };
    assert.deepStrictEqual(fleetPointLabel(idle), { label: 'Trực tuyến – tạm ngừng', tone: 'offline' });
    const asPoint = { status: idle.status, connector_statuses: idle.connectors.map((c) => c.status) };
    assert.strictEqual(fleetPointLabel(idle).label, pointLabel(asPoint.status, pointGroup(asPoint)));
    assert.deepStrictEqual(fleetPointLabel({ status: 'ONLINE', offline: false, connectors: [{ status: 'AVAILABLE' }] }), { label: 'Trực tuyến', tone: 'ready' });
    assert.deepStrictEqual(fleetPointLabel({ status: 'ONLINE', offline: false, connectors: [] }), { label: 'Trực tuyến', tone: 'ready' });
    assert.deepStrictEqual(fleetPointLabel({ status: 'OFFLINE', offline: true, connectors: [{ status: 'UNAVAILABLE' }] }), { label: 'Ngoại tuyến', tone: 'offline' });
    assert.deepStrictEqual(fleetPointLabel({ status: 'UNKNOWN', offline: false, connectors: [] }), { label: 'Chưa rõ', tone: 'offline' });
  });
});

describe('S-02 frontend: api.js và auth.js', () => {
  let env;
  afterEach(() => env?.restore());

  it('S-02 AC4: 401 ở bất kỳ API → về /index.html và ném lỗi', async () => {
    env = stubBrowser({ respond: () => ({ status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập' } } }) });
    const { api, ApiError } = await load('services/api.js');
    await assert.rejects(api('/api/stations'), (e) => e instanceof ApiError && e.status === 401);
    assert.deepStrictEqual(env.calls.replace, ['/index.html']);
  });

  it('401 khi đã ở /index.html hoặc redirectOn401:false → không điều hướng (để form đăng nhập hiện lỗi)', async () => {
    env = stubBrowser({ pathname: '/index.html', respond: () => ({ status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Sai' } } }) });
    const { api } = await load('services/api.js');
    await assert.rejects(api('/api/auth/login', { method: 'POST', body: {} }));
    env.restore();
    env = stubBrowser({ pathname: '/pages/admin.html', respond: () => ({ status: 401, body: { error: { message: 'x' } } }) });
    await assert.rejects(api('/api/auth/me', { redirectOn401: false }));
    assert.deepStrictEqual(env.calls.replace, []);
  });

  it('lỗi khác 401 → ApiError mang message và code của envelope; 429 hiển thị đúng thông báo chung', async () => {
    env = stubBrowser({ respond: () => ({ status: 429, body: { error: { code: 'ACCOUNT_LOCKED', message: 'Đăng nhập tạm bị khoá, thử lại sau' } } }) });
    const { api } = await load('services/api.js');
    await assert.rejects(api('/api/auth/login', { method: 'POST', body: {} }), (e) => e.status === 429 && e.code === 'ACCOUNT_LOCKED' && e.message === 'Đăng nhập tạm bị khoá, thử lại sau');
    assert.deepStrictEqual(env.calls.replace, []);
  });

  it('luôn gửi cookie (credentials include), JSON, không gắn Authorization', async () => {
    env = stubBrowser({ respond: () => ({ body: { ok: true } }) });
    const { api } = await load('services/api.js');
    await api('/api/auth/login', { method: 'POST', headers: { 'Idempotency-Key': 'station-request-0001' }, body: { email: 'a@b.co', password: 'x' } });
    const { url, options } = env.calls.fetch[0];
    assert.strictEqual(url, '/api/auth/login');
    assert.strictEqual(options.credentials, 'include');
    assert.strictEqual(options.headers['Content-Type'], 'application/json');
    assert.strictEqual(options.headers.Authorization, undefined);
    assert.strictEqual(options.headers['Idempotency-Key'], 'station-request-0001');
    assert.strictEqual(options.body, JSON.stringify({ email: 'a@b.co', password: 'x' }));
  });

  it('auth.login / me / logout không ghi token hay user vào localStorage/sessionStorage', async () => {
    env = stubBrowser({ respond: (url) => ({ body: url.endsWith('logout') ? { ok: true } : { user: { id: '1', role: 'DRIVER' } } }) });
    const auth = await load('app/auth.js');
    const { user } = await auth.login('a@b.co', 'x');
    assert.strictEqual(user.role, 'DRIVER');
    await auth.logout();
    assert.deepStrictEqual(env.calls.storageWrites, []);
    assert.deepStrictEqual(env.calls.fetch.map((c) => c.url), ['/api/auth/login', '/api/auth/logout']);
  });

  it('ApiError mang details của envelope để gắn lỗi vào đúng ô nhập', async () => {
    const details = [{ field: 'email', message: 'Email không hợp lệ' }];
    env = stubBrowser({ respond: () => ({ status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Email không hợp lệ', details } } }) });
    const { api } = await load('services/api.js');
    await assert.rejects(api('/api/auth/register', { method: 'POST', body: {} }), (e) => e.status === 400 && JSON.stringify(e.details) === JSON.stringify(details));
  });
});

describe('S-02 frontend: kiểm tra form phía client (validate.js)', () => {
  it('đăng nhập: bắt buộc email và mật khẩu, email phải đúng định dạng', async () => {
    const { validateLogin } = await load('app/validate.js');
    assert.deepStrictEqual(Object.keys(validateLogin({ email: '', password: '' })).sort(), ['email', 'password']);
    assert.deepStrictEqual(Object.keys(validateLogin({ email: 'khong-phai-email', password: 'x' })), ['email']);
    assert.deepStrictEqual(validateLogin({ email: 'a@b.co', password: 'x' }), {});
  });

  it('đăng ký: tên bắt buộc, email hợp lệ, mật khẩu >= 8 ký tự', async () => {
    const { validateRegister } = await load('app/validate.js');
    assert.deepStrictEqual(Object.keys(validateRegister({ name: ' ', email: 'a', password: 'short' })).sort(), ['email', 'name', 'password']);
    assert.match(validateRegister({ name: 'A', email: 'a@b.co', password: '1234567' }).password, /8/);
    assert.deepStrictEqual(validateRegister({ name: 'A', email: 'a@b.co', password: '12345678' }), {});
  });
});
