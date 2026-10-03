const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeErrorMessage } = require('../../src/lib/constants');
const { errorHandler } = require('../../src/middlewares/errorHandler');
const { AppError } = require('../../src/lib/errors');
const { createShutdown } = require('../../src/modules/ocpp/shutdown');

function captureErrorLog(err) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => { lines.push(args.map((arg) => (arg instanceof Error ? `${arg.stack}` : String(arg))).join(' ')); };
  const res = { status() { return this; }, json() { return this; } };
  try { errorHandler(err, {}, res, () => {}); } finally { console.error = original; }
  return lines.join('\n');
}

describe('GYM-35 vệ sinh log (4.3)', () => {
  it('sanitizeErrorMessage che địa chỉ host:port của DB', () => {
    assert.ok(!sanitizeErrorMessage('connect ECONNREFUSED 127.0.0.1:5441').includes('127.0.0.1'));
    assert.ok(!sanitizeErrorMessage('connect ECONNREFUSED 127.0.0.1:5441').includes('5441'));
    assert.ok(!sanitizeErrorMessage('connect ECONNREFUSED ::1:5441').includes('::1'));
    assert.ok(!sanitizeErrorMessage('getaddrinfo ENOTFOUND db.internal.example').includes('db.internal.example'));
    assert.match(sanitizeErrorMessage('connect ECONNREFUSED 127.0.0.1:5441'), /ECONNREFUSED/);
  });

  it('sanitizeErrorMessage không che nhầm chuỗi giờ và vẫn che IPv6 đầy đủ', () => {
    assert.equal(sanitizeErrorMessage('lúc 10:20:30 lỗi'), 'lúc 10:20:30 lỗi');
    assert.equal(sanitizeErrorMessage('timestamp 2026-10-03T10:20:30Z'), 'timestamp 2026-10-03T10:20:30Z');
    assert.ok(!sanitizeErrorMessage('connect ECONNREFUSED fe80::1').includes('fe80'));
    assert.ok(!sanitizeErrorMessage('connect ECONNREFUSED 2001:db8:0:0:0:0:0:1').includes('2001'));
  });

  it('sanitizeErrorMessage giữ hành vi che mật khẩu cũ', () => {
    assert.equal(sanitizeErrorMessage('postgres://user:secret@db/x'), 'postgres://user:***@db/x');
  });

  it('AppError 5xx chỉ log một dòng status + code, không kèm stack hay đường dẫn', () => {
    const output = captureErrorLog(new AppError(503, 'DB_UNAVAILABLE', 'Cơ sở dữ liệu không sẵn sàng'));
    assert.match(output, /503/);
    assert.match(output, /DB_UNAVAILABLE/);
    assert.ok(!output.includes('\n'), 'chỉ một dòng');
    assert.ok(!output.includes('/home/') && !/\sat\s/.test(output) && !output.includes('.js:'), `lộ stack: ${output}`);
  });

  it('lỗi không lường trước vẫn log đầy đủ stack để gỡ lỗi', () => {
    const output = captureErrorLog(new Error('boom bất ngờ'));
    assert.match(output, /boom bất ngờ/);
    assert.match(output, /\sat\s/);
  });

  it('lỗi khi tắt máy không lộ host:port của DB trong log', async () => {
    const errors = [];
    const shutdown = createShutdown({
      server: { close() {} },
      wss: { clients: new Set() },
      pool: { query: async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:5441'); }, end: async () => {} },
      log: () => {},
      logError: (...args) => errors.push(args.join(' ')),
      exit: () => {},
    });
    await shutdown('SIGTERM');
    const output = errors.join('\n');
    assert.match(output, /ECONNREFUSED/);
    assert.ok(!output.includes('127.0.0.1') && !output.includes('5441'), `lộ host:port: ${output}`);
  });
});
