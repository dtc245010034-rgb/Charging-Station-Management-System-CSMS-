const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.resolve(__dirname, '../..');
const read = (...parts) => fs.readFileSync(path.join(backend, ...parts), 'utf8');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

// Biến mã backend đọc nhưng không phải cấu hình của người vận hành.
const NOT_OPERATOR_CONFIG = new Set([
  'PATH', // biến hệ thống
  'CSMS_SKIP_DOTENV', // cờ riêng của bộ test (README ghi chú ở mục kiểm thử)
]);

describe('S8 / K12: mọi biến môi trường backend đọc đều có tài liệu', () => {
  const envNames = new Set();
  for (const file of [...sourceFiles(path.join(backend, 'src')), ...sourceFiles(path.join(backend, 'scripts'))]) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) envNames.add(match[1]);
  }
  for (const match of read('src/config/env.js').matchAll(/^\s+([A-Z][A-Z0-9_]+):\s*z\./gm)) envNames.add(match[1]);
  for (const match of read('scripts/seed-demo.js').matchAll(/^\s+([A-Z][A-Z0-9_]+):\s*z\./gm)) envNames.add(match[1]);
  for (const name of NOT_OPERATOR_CONFIG) envNames.delete(name);

  const example = read('.env.example');
  const readme = fs.readFileSync(path.resolve(backend, '../README.md'), 'utf8');
  const tableRow = (name) => new RegExp(`^\\|\\s*\`${name}\`\\s*\\|`, 'm');

  it('phát hiện đủ biến (kiểm tra bản thân bộ quét)', () => {
    for (const name of ['DATABASE_URL', 'ALERT_ERROR_THRESHOLD', 'ALLOW_DEMO_SEED', 'REMOTE_STOP_WAIT_SECONDS']) assert.ok(envNames.has(name), name);
  });

  it('có trong backend/.env.example (dòng KEY= hoặc # KEY=)', () => {
    const missing = [...envNames].filter((name) => !new RegExp(`^#?\\s*${name}=`, 'm').test(example));
    assert.deepStrictEqual(missing.sort(), []);
  });

  it('có hàng trong bảng biến môi trường của README.md', () => {
    const missing = [...envNames].filter((name) => !tableRow(name).test(readme));
    assert.deepStrictEqual(missing.sort(), []);
  });
});

describe('S8 / K12: biến môi trường của công cụ trong tools/ cũng có tài liệu', () => {
  const toolsDir = path.resolve(backend, '../tools');
  const names = new Set();
  for (const file of fs.readdirSync(toolsDir).filter((f) => f.endsWith('.js'))) {
    for (const match of fs.readFileSync(path.join(toolsDir, file), 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) names.add(match[1]);
  }
  for (const name of ['PATH', 'DEMO_PASSWORD', 'DEMO_EMAIL_DOMAIN', 'DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'JWT_SECRET', 'APP_ORIGIN']) names.delete(name); // đã nằm ở bảng chính
  const example = read('.env.example');
  const readme = fs.readFileSync(path.resolve(backend, '../README.md'), 'utf8');

  it('phát hiện được biến công cụ (kiểm tra bộ quét)', () => {
    assert.ok(names.has('APP_BASE_URL') && names.has('STAGING_BASE_URL'));
  });
  it('mỗi biến có trong .env.example và README', () => {
    assert.deepStrictEqual([...names].filter((n) => !new RegExp(`^#?\\s*${n}=`, 'm').test(example)).sort(), []);
    assert.deepStrictEqual([...names].filter((n) => !new RegExp(`^\\|\\s*\`${n}\`\\s*\\|`, 'm').test(readme)).sort(), []);
  });
});
