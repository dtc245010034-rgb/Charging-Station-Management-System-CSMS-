const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { installDom, frontend } = require('../helpers/dom');

const styles = (file) => fs.readFileSync(path.resolve(__dirname, '../../../frontend/styles', file), 'utf8');

// Đọc giá trị token (--ten: #rrggbb) trong một khối CSS.
const tokensOf = (css, selectorPattern) => {
  const block = css.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`))[1];
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('S7: trợ năng', () => {
  const dark = tokensOf(styles('tokens.css'), ':root');
  const light = { ...dark, ...tokensOf(styles('themes.css'), ':root\\[data-theme="light"\\]') };

  for (const [name, tokens] of [['tối', dark], ['sáng', light]]) {
    it(`theme ${name}: chữ màu lỗi (--danger-text) đạt 4,5:1 trên mọi nền bề mặt`, () => {
      for (const surface of ['--bg-primary', '--bg-secondary', '--surface', '--surface-elevated']) {
        assert.ok(contrast(tokens['--danger-text'], tokens[surface]) >= 4.5, `--danger-text trên ${surface}: ${contrast(tokens['--danger-text'], tokens[surface]).toFixed(2)}`);
      }
    });
    it(`theme ${name}: liên kết/chữ thương hiệu (--brand-primary) đạt 4,5:1 trên nền, và chữ trên nền thương hiệu đạt 4,5:1`, () => {
      for (const surface of ['--bg-primary', '--bg-secondary', '--surface', '--surface-elevated', '--surface-hover']) {
        assert.ok(contrast(tokens['--brand-primary'], tokens[surface]) >= 4.5, `--brand-primary trên ${surface}: ${contrast(tokens['--brand-primary'], tokens[surface]).toFixed(2)}`);
      }
      assert.ok(contrast(tokens['--on-brand'], tokens['--brand-primary']) >= 4.5);
    });
  }

  it('.table-wrap có position: relative để phần tử .sr-only (absolute) trong tiêu đề cột không làm trang tràn ngang ở 360 px', () => {
    assert.match(styles('components.css'), /\.table-wrap\s*\{[^}]*position:\s*relative/);
  });

  describe('topbar', () => {
    let env;
    afterEach(() => env?.restore());

    it('nút tài khoản có tên truy cập được kể cả khi tên hiển thị bị ẩn ở màn hình hẹp (button-name)', async () => {
      env = installDom();
      const { createTopbar } = await frontend('components/topbar.js');
      const bar = createTopbar({ user: { name: 'Nguyễn Văn A', email: 'a@test.invalid', roles: ['DRIVER'] }, workspaceId: 'driver', onMenu() {}, onSearch() {}, onSwitch() {}, onLogout() {}, onAccount() {} });
      const trigger = bar.el?.querySelector('.user-trigger') ?? bar.querySelector('.user-trigger');
      assert.ok(trigger, 'không tìm thấy nút tài khoản');
      assert.match(trigger.getAttribute('aria-label'), /Nguyễn Văn A/, 'tên truy cập phải chứa tên hiển thị (label-in-name)');
    });
  });
});
