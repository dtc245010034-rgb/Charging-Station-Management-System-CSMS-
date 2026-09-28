const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { run, resetSchema } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');

const frontend = path.resolve(__dirname, '../../../frontend');
const WORKSPACES = ['admin', 'operator', 'owner', 'accountant', 'driver'];

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

describe('S-02 frontend: trang theo vai trò, không lưu token ở client', () => {
  before(async () => { await resetSchema(); assert.strictEqual(run('src/db/migrate.js').status, 0); });
  after(async () => { await resetSchema(); await closePool(); });

  it('phục vụ trang đăng nhập, app shell, module JS/CSS; các trang cũ và script.js đã bỏ', async () => {
    const urls = ['/', '/app.html', '/main.js', '/app/auth.js', '/app/router.js', '/app/theme.js', '/app/theme-boot.js', '/services/api.js',
      '/pages/auth/login.js', '/pages/operator/dashboard.js', '/pages/shared/stations.js', '/styles/tokens.css', '/styles/themes.css',
      '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css'];
    for (const url of urls) assert.strictEqual((await request(app).get(url)).status, 200, url);
    for (const url of ['/script.js', '/pages/admin.html', '/js/api.js', '/styles.css']) assert.strictEqual((await request(app).get(url)).status, 404, url);
  });

  it('mọi workspace có trang tổng quan; router trỏ tới module có thật', async () => {
    const { pathToFileURL } = require('node:url');
    const { WORKSPACES: config } = await import(pathToFileURL(path.join(frontend, 'app/workspace.js')).href);
    const { pageLoader } = await import(pathToFileURL(path.join(frontend, 'app/router.js')).href);
    assert.deepStrictEqual(Object.keys(config).sort(), [...WORKSPACES].sort());
    for (const ws of WORKSPACES) assert.ok(pageLoader('overview', ws), ws);
    for (const [ws, def] of Object.entries(config)) {
      for (const item of def.groups.flatMap((g) => g.items).filter((i) => i.enabled)) {
        assert.ok(item.page === 'account' || pageLoader(item.page, ws), `${ws}/${item.page} đã bật nhưng chưa có trang`);
      }
    }
  });

  it('app.html nạp theme trước khi vẽ và chỉ có một điểm vào main.js', () => {
    const html = fs.readFileSync(path.join(frontend, 'app.html'), 'utf8');
    assert.ok(html.indexOf('theme-boot.js') < html.indexOf('tokens.css'));
    assert.ok(html.includes('type="module" src="/main.js"'));
  });

  it('không còn token/user trong storage; localStorage chỉ dùng cho giao diện sáng/tối', () => {
    for (const file of files(frontend).filter((f) => /\.(js|html)$/.test(f) && !f.includes(`${path.sep}vendor${path.sep}`))) {
      const text = fs.readFileSync(file, 'utf8');
      const rel = path.relative(frontend, file);
      assert.ok(!text.includes('csms-token') && !text.includes('csms-user'), rel);
      if (!['app/theme.js', 'app/theme-boot.js'].includes(rel.split(path.sep).join('/'))) assert.ok(!/localStorage|sessionStorage/.test(text), rel);
    }
  });

  it('không dùng innerHTML/outerHTML/insertAdjacentHTML/document.write (chống XSS từ dữ liệu trạm)', () => {
    for (const file of files(frontend).filter((f) => f.endsWith('.js') && !f.includes(`${path.sep}vendor${path.sep}`))) {
      assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(fs.readFileSync(file, 'utf8')), path.relative(frontend, file));
    }
  });

  it('không gọi tài nguyên ngoài (CDN/font) — mọi thư viện được vendor', () => {
    for (const file of files(frontend).filter((f) => /\.(html|css)$/.test(f) && !f.includes(`${path.sep}vendor${path.sep}`))) {
      assert.ok(!/https?:\/\/(?!\{)/.test(fs.readFileSync(file, 'utf8')), path.relative(frontend, file));
    }
  });

  it('index.html không còn dashboard nhúng, nút giả lập token và số liệu giả', () => {
    const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
    for (const word of ['dashboardLayout', 'testExpireBtn', 'apiResponseLog', 'script.js"', '96.8%', '4.2M']) assert.ok(!html.includes(word), word);
    assert.ok(html.includes('type="module"') && html.includes('/pages/auth/login.js'));
  });

  it('S-03: đăng ký không còn ô chọn vai trò và không gửi role; lỗi hiện dưới từng ô nhập', () => {
    const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
    assert.ok(!html.includes('regRole'));
    for (const id of ['loginEmail', 'loginPassword', 'regName', 'regEmail', 'regPassword']) {
      assert.ok(html.includes(`data-error-for="${id}"`), id);
    }
    const login = fs.readFileSync(path.join(frontend, 'pages/auth/login.js'), 'utf8');
    assert.ok(!/\brole\b/.test(login.split('register(')[1] || ''), 'login.js không được gửi role khi đăng ký');
  });
});
