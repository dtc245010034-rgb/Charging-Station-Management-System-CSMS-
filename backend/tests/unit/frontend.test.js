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

  it('nav: mục chưa có backend (enabled:false) không bao giờ hiện; mục cần quyền bị ẩn khi thiếu quyền', async () => {
    const { visibleNav, WORKSPACES } = await load('app/workspace.js');
    const { can } = await load('app/permissions.js');
    const pages = (ws) => visibleNav(ws, WORKSPACES[ws].role, can).flatMap((g) => g.items.map((i) => i.page));
    assert.ok(!pages('operator').includes('sessions') && !pages('operator').includes('alerts'));
    assert.ok(pages('operator').includes('stations') && pages('admin').includes('users'));
    assert.ok(!pages('owner').includes('users') && !pages('accountant').includes('stations'));
  });

  it('S-11 T-24: operator và owner có đường dẫn tới lưới trạng thái', async () => {
    const { visibleNav, WORKSPACES } = await load('app/workspace.js');
    const { can } = await load('app/permissions.js');
    const { pageLoader, PAGE_NEEDS } = await load('app/router.js');
    const pages = (workspace) => visibleNav(workspace, WORKSPACES[workspace].role, can).flatMap((group) => group.items.map((item) => item.page));

    assert.ok(pages('operator').includes('fleet-status'));
    assert.ok(pages('owner').includes('fleet-status'));
    assert.strictEqual(PAGE_NEEDS['fleet-status'], 'charge-points:read');
    assert.strictEqual(typeof pageLoader('fleet-status', 'operator'), 'function');
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

  it('nhãn trạng thái trụ khớp chú giải: UNKNOWN và ONLINE-toàn-đầu-nối-tạm-ngừng là "Ngoại tuyến / chưa rõ"; nhãn đầu nối giữ nguyên', async () => {
    const { pointLabel, pointGroup, statusLabel } = await load('app/status.js');
    assert.strictEqual(pointLabel('UNKNOWN', 'offline'), 'Ngoại tuyến / chưa rõ');
    assert.strictEqual(pointLabel(undefined, 'offline'), 'Ngoại tuyến / chưa rõ');
    const idle = { status: 'ONLINE', connector_statuses: ['UNAVAILABLE'] };
    assert.strictEqual(pointLabel(idle.status, pointGroup(idle)), 'Ngoại tuyến / chưa rõ');
    assert.strictEqual(pointLabel('ONLINE', 'ready'), 'Sẵn sàng');
    assert.strictEqual(pointLabel('ONLINE', 'fault'), 'Lỗi');
    assert.strictEqual(statusLabel('UNKNOWN'), 'Chưa rõ');
    assert.strictEqual(statusLabel('UNAVAILABLE'), 'Tạm ngừng');
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
