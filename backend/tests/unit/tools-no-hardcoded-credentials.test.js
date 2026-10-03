const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const toolsDir = path.resolve(__dirname, '../../../tools');
const scripts = fs.readdirSync(toolsDir).filter((name) => name.endsWith('.js'));

describe('tools/*.js: không hard-code thông tin đăng nhập', () => {
  it('có script để quét', () => {
    assert.ok(scripts.length > 0);
  });

  for (const name of scripts) {
    it(`${name} không chứa admin/admin, mật khẩu yếu hay ALLOW_WEAK_ADMIN_PASSWORD`, () => {
      const text = fs.readFileSync(path.join(toolsDir, name), 'utf8');
      assert.ok(!/admin\s*\/\s*admin/.test(text), 'còn chuỗi admin/admin');
      assert.ok(!/password\s*:\s*'admin'/.test(text), "còn password: 'admin'");
      assert.ok(!/password123456/.test(text), 'còn mật khẩu yếu password123456');
      assert.ok(!text.includes('ALLOW_WEAK_ADMIN_PASSWORD'), 'còn ALLOW_WEAK_ADMIN_PASSWORD');
    });
  }
});
