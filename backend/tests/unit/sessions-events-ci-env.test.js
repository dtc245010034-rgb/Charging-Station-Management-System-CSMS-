const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const backendDir = path.join(__dirname, '..', '..');

// Chạy trong tiến trình con chỉ có PATH, giống môi trường CI, để process.exit(1) của env.js
// không giết tiến trình test chính mà vẫn bị phát hiện.
function runInBareEnv(body) {
  const script = `
    const events = require('./src/modules/sessions/sessions.events');
    (async () => {
      ${body}
      const loaded = Object.keys(require.cache)
        .some((key) => /[\\\\/]db[\\\\/]pool\\.js$/.test(key) || /[\\\\/]config[\\\\/]env\\.js$/.test(key));
      process.stdout.write(loaded ? 'LOADED' : 'CLEAN');
    })();
  `;
  return spawnSync(process.execPath, ['-e', script], {
    cwd: backendDir,
    env: { PATH: process.env.PATH },
    encoding: 'utf8',
  });
}

describe('sessions.events khi không có biến cấu hình (C1)', () => {
  it('không ai đăng ký: không nạp db/pool hay config/env', () => {
    const result = runInBareEnv('await events.publishSessionUpdateFromDb(1, { driverId: 5 });');
    assert.equal(result.status, 0, `thoát với mã ${result.status}: ${result.stderr}`);
    assert.equal(result.stdout, 'CLEAN');
  });

  it('chỉ có người nghe tài xế khác: vẫn không nạp db/pool hay config/env', () => {
    const result = runInBareEnv(`
      events.subscribe(() => {}, { driverId: 99 });
      await events.publishSessionUpdateFromDb(1, { driverId: 5 });
    `);
    assert.equal(result.status, 0, `thoát với mã ${result.status}: ${result.stderr}`);
    assert.equal(result.stdout, 'CLEAN');
  });

  it('không biết tài xế sở hữu phiên (driverId rỗng): không truy vấn, không nạp db/pool', () => {
    const result = runInBareEnv(`
      events.subscribe(() => {}, { driverId: 99 });
      await events.publishSessionUpdateFromDb(1, {});
    `);
    assert.equal(result.status, 0, `thoát với mã ${result.status}: ${result.stderr}`);
    assert.equal(result.stdout, 'CLEAN');
  });
});
