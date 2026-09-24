const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { run, resetSchema } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');

const frontend = path.resolve(__dirname, '../../../frontend');
const PAGES = { ADMIN: 'admin', STATION_OWNER: 'station-owner', OPERATOR: 'operator', ACCOUNTANT: 'accountant', DRIVER: 'driver' };

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

describe('S-02 frontend: trang theo vai trò, không lưu token ở client', () => {
  before(async () => { await resetSchema(); assert.strictEqual(run('src/db/migrate.js').status, 0); });
  after(async () => { await resetSchema(); await closePool(); });

  it('phục vụ trang đăng nhập, module JS và 5 trang vai trò; script.js cũ đã bỏ', async () => {
    const urls = ['/', '/js/api.js', '/js/auth.js', '/js/router.js', '/js/theme.js', '/js/pages/login.js', '/js/pages/dashboard.js',
      ...Object.values(PAGES).map((p) => `/pages/${p}.html`)];
    for (const url of urls) assert.strictEqual((await request(app).get(url)).status, 200, url);
    assert.strictEqual((await request(app).get('/script.js')).status, 404);
  });

  it('mỗi trang vai trò khai báo data-role đúng và nạp dashboard.js', () => {
    for (const [role, page] of Object.entries(PAGES)) {
      const html = fs.readFileSync(path.join(frontend, 'pages', `${page}.html`), 'utf8');
      assert.ok(html.includes(`data-role="${role}"`), page);
      assert.ok(html.includes('/js/pages/dashboard.js'), page);
      assert.ok(html.includes('id="logoutBtn"') && html.includes('id="userName"'), page);
    }
  });

  it('không còn token/user trong localStorage; localStorage chỉ dùng cho giao diện sáng/tối', () => {
    for (const file of files(frontend).filter((f) => /\.(js|html)$/.test(f))) {
      const text = fs.readFileSync(file, 'utf8');
      const rel = path.relative(frontend, file);
      assert.ok(!text.includes('csms-token') && !text.includes('csms-user'), rel);
      if (rel !== path.join('js', 'theme.js')) assert.ok(!/localStorage|sessionStorage/.test(text), rel);
    }
  });

  it('index.html không còn dashboard nhúng và nút giả lập token', () => {
    const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
    for (const word of ['dashboardLayout', 'testExpireBtn', 'apiResponseLog', 'script.js"']) assert.ok(!html.includes(word), word);
    assert.ok(html.includes('type="module"') && html.includes('/js/pages/login.js'));
  });

  it('S-03: đăng ký không còn ô chọn vai trò và không gửi role; lỗi hiện dưới từng ô nhập', () => {
    const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
    assert.ok(!html.includes('regRole'));
    for (const id of ['loginEmail', 'loginPassword', 'regName', 'regEmail', 'regPassword']) {
      assert.ok(html.includes(`data-error-for="${id}"`), id);
    }
    const login = fs.readFileSync(path.join(frontend, 'js/pages/login.js'), 'utf8');
    assert.ok(!/\brole\b/.test(login.split('register(')[1] || ''), 'login.js không được gửi role khi đăng ký');
  });
});
