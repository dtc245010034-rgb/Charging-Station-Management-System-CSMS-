const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../../src/lib/rate-limit');
const { clientIpOf } = require('../../src/lib/client-ip');

describe('rate-limit: cửa sổ cố định theo khoá', () => {
  it('cho phép tối đa `limit` lần trong cửa sổ rồi chặn kèm retryAfterSec', () => {
    let time = 1000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 10000, now: () => time });
    assert.deepEqual([1, 2, 3].map(() => limiter.take('a').allowed), [true, true, true]);
    time += 4000;
    const blocked = limiter.take('a');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSec, 6);
  });

  it('khoá khác nhau độc lập; hết cửa sổ thì đếm lại', () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
    assert.equal(limiter.take('a').allowed, true);
    assert.equal(limiter.take('a').allowed, false);
    assert.equal(limiter.take('b').allowed, true);
    time += 1000;
    assert.equal(limiter.take('a').allowed, true);
  });

  it('peek không đếm; hit đếm; chặn khi số lần đã đạt limit', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    assert.equal(limiter.peek('a').allowed, true);
    limiter.hit('a');
    assert.equal(limiter.peek('a').allowed, true);
    limiter.hit('a');
    assert.equal(limiter.peek('a').allowed, false);
  });

  it('bộ nhớ có trần: không giữ quá maxKeys khoá', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 100000, maxKeys: 50, now: () => 0 });
    for (let index = 0; index < 500; index += 1) limiter.take(`k${index}`);
    assert.ok(limiter.size() <= 50, `size = ${limiter.size()}`);
  });
});

describe('client-ip: IP thật theo số proxy tin cậy', () => {
  const request = (forwarded, remote = '10.0.0.1') => ({ headers: forwarded ? { 'x-forwarded-for': forwarded } : {}, socket: { remoteAddress: remote } });

  it('trustProxy = 0: bỏ qua X-Forwarded-For', () => {
    assert.equal(clientIpOf(request('1.1.1.1'), 0), '10.0.0.1');
  });

  it('trustProxy = 1: lấy phần tử cuối của X-Forwarded-For', () => {
    assert.equal(clientIpOf(request('9.9.9.9, 1.1.1.1'), 1), '1.1.1.1');
  });

  it('trustProxy = 2: lấy phần tử áp cuối, kẻ giả mạo đầu chuỗi không có tác dụng', () => {
    assert.equal(clientIpOf(request('6.6.6.6, 1.1.1.1, 10.0.0.9'), 2), '1.1.1.1');
  });

  it('thiếu header hoặc ít hơn số proxy: dùng địa chỉ socket / phần tử đầu', () => {
    assert.equal(clientIpOf(request(undefined), 2), '10.0.0.1');
    assert.equal(clientIpOf(request('1.1.1.1'), 3), '1.1.1.1');
  });
});
