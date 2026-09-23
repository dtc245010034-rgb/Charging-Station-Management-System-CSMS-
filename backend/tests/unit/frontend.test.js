const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(__dirname, '../../../frontend/js', file)).href);

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
  it('homePathFor: mỗi vai trò có trang chính riêng, vai trò lạ về /index.html', async () => {
    const { homePathFor } = await load('router.js');
    assert.strictEqual(homePathFor('ADMIN'), '/pages/admin.html');
    assert.strictEqual(homePathFor('STATION_OWNER'), '/pages/station-owner.html');
    assert.strictEqual(homePathFor('OPERATOR'), '/pages/operator.html');
    assert.strictEqual(homePathFor('ACCOUNTANT'), '/pages/accountant.html');
    assert.strictEqual(homePathFor('DRIVER'), '/pages/driver.html');
    assert.strictEqual(homePathFor('ROOT'), '/index.html');
    assert.strictEqual(homePathFor(null), '/index.html');
  });
});

describe('S-02 frontend: api.js và auth.js', () => {
  let env;
  afterEach(() => env?.restore());

  it('S-02 AC4: 401 ở bất kỳ API → về /index.html và ném lỗi', async () => {
    env = stubBrowser({ respond: () => ({ status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập' } } }) });
    const { api, ApiError } = await load('api.js');
    await assert.rejects(api('/api/stations'), (e) => e instanceof ApiError && e.status === 401);
    assert.deepStrictEqual(env.calls.replace, ['/index.html']);
  });

  it('401 khi đã ở /index.html hoặc redirectOn401:false → không điều hướng (để form đăng nhập hiện lỗi)', async () => {
    env = stubBrowser({ pathname: '/index.html', respond: () => ({ status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Sai' } } }) });
    const { api } = await load('api.js');
    await assert.rejects(api('/api/auth/login', { method: 'POST', body: {} }));
    env.restore();
    env = stubBrowser({ pathname: '/pages/admin.html', respond: () => ({ status: 401, body: { error: { message: 'x' } } }) });
    await assert.rejects(api('/api/auth/me', { redirectOn401: false }));
    assert.deepStrictEqual(env.calls.replace, []);
  });

  it('lỗi khác 401 → ApiError mang message và code của envelope; 429 hiển thị đúng thông báo chung', async () => {
    env = stubBrowser({ respond: () => ({ status: 429, body: { error: { code: 'ACCOUNT_LOCKED', message: 'Đăng nhập tạm bị khoá, thử lại sau' } } }) });
    const { api } = await load('api.js');
    await assert.rejects(api('/api/auth/login', { method: 'POST', body: {} }), (e) => e.status === 429 && e.code === 'ACCOUNT_LOCKED' && e.message === 'Đăng nhập tạm bị khoá, thử lại sau');
    assert.deepStrictEqual(env.calls.replace, []);
  });

  it('luôn gửi cookie (credentials include), JSON, không gắn Authorization', async () => {
    env = stubBrowser({ respond: () => ({ body: { ok: true } }) });
    const { api } = await load('api.js');
    await api('/api/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' } });
    const { url, options } = env.calls.fetch[0];
    assert.strictEqual(url, '/api/auth/login');
    assert.strictEqual(options.credentials, 'include');
    assert.strictEqual(options.headers['Content-Type'], 'application/json');
    assert.strictEqual(options.headers.Authorization, undefined);
    assert.strictEqual(options.body, JSON.stringify({ email: 'a@b.co', password: 'x' }));
  });

  it('auth.login / me / logout không ghi token hay user vào localStorage/sessionStorage', async () => {
    env = stubBrowser({ respond: (url) => ({ body: url.endsWith('logout') ? { ok: true } : { user: { id: '1', role: 'DRIVER' } } }) });
    const auth = await load('auth.js');
    const { user } = await auth.login('a@b.co', 'x');
    assert.strictEqual(user.role, 'DRIVER');
    await auth.logout();
    assert.deepStrictEqual(env.calls.storageWrites, []);
    assert.deepStrictEqual(env.calls.fetch.map((c) => c.url), ['/api/auth/login', '/api/auth/logout']);
  });
});
