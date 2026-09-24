const { describe, it } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const SECRET = 'x'.repeat(40);
const URL_VALUE = 'postgresql://u:supersecretpw@localhost:5432/db';

function load(env) {
  return spawnSync(process.execPath, ['-e', "const e = require('./src/config/env'); console.log(JSON.stringify(e))"], {
    cwd: root,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
}

const without = (obj, key) => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));

const valid = { DATABASE_URL: URL_VALUE, JWT_SECRET: SECRET, APP_ORIGIN: 'http://localhost:3000' };

describe('S-01 env: cấu hình bắt buộc', () => {
  it('thiếu JWT_SECRET → thoát mã 1, nêu tên biến, không lộ giá trị', () => {
    const r = load(without(valid, 'JWT_SECRET'));
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /JWT_SECRET/);
    assert.ok(!r.stderr.includes('supersecretpw'));
  });

  it('thiếu DATABASE_URL hoặc APP_ORIGIN → thoát mã 1', () => {
    for (const key of ['DATABASE_URL', 'APP_ORIGIN']) {
      const r = load(without(valid, key));
      assert.strictEqual(r.status, 1, key);
      assert.match(r.stderr, new RegExp(key));
    }
  });

  it('JWT_SECRET 31 ký tự → thoát mã 1 và không in giá trị', () => {
    const short = 'y'.repeat(31);
    const r = load({ ...valid, JWT_SECRET: short });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /JWT_SECRET/);
    assert.ok(!r.stderr.includes(short));
  });

  it('đủ biến → NODE_ENV mặc định development, PORT mặc định 3000', () => {
    const r = load(valid);
    assert.strictEqual(r.status, 0, r.stderr);
    const cfg = JSON.parse(r.stdout);
    assert.strictEqual(cfg.NODE_ENV, 'development');
    assert.strictEqual(cfg.PORT, 3000);
  });
});
