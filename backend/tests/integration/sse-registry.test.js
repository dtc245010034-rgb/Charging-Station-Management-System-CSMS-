const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/app'); // nạp biến môi trường test trước khi require env
const env = require('../../src/config/env');
const { registerStream, closeStreamsOf, openStreamCount } = require('../../src/lib/sse-registry');

describe('sse-registry: giới hạn luồng theo tài khoản', () => {
  const original = env.SSE_MAX_CONNECTIONS_PER_USER;
  beforeEach(() => { env.SSE_MAX_CONNECTIONS_PER_USER = 2; });
  afterEach(() => { env.SSE_MAX_CONNECTIONS_PER_USER = original; closeStreamsOf(1); closeStreamsOf(2); });

  const track = () => {
    const state = { closed: false, release: null };
    state.close = () => { state.closed = true; state.release?.(); };
    return state;
  };

  it('vượt giới hạn thì đóng luồng cũ nhất, giữ luồng mới', () => {
    const a = track(); const b = track(); const c = track();
    a.release = registerStream(1, a.close);
    b.release = registerStream(1, b.close);
    c.release = registerStream(1, c.close);
    assert.equal(a.closed, true);
    assert.equal(b.closed, false);
    assert.equal(c.closed, false);
    assert.equal(openStreamCount(1), 2);
  });

  it('giới hạn 1: luồng mới vẫn được ghi nhận và đăng xuất đóng được nó', () => {
    env.SSE_MAX_CONNECTIONS_PER_USER = 1;
    const a = track(); const b = track();
    a.release = registerStream(1, a.close);
    b.release = registerStream(1, b.close);
    assert.equal(a.closed, true);
    assert.equal(openStreamCount(1), 1);
    closeStreamsOf(1);
    assert.equal(b.closed, true);
    assert.equal(openStreamCount(1), 0);
  });

  it('release gỡ luồng khỏi bộ đếm; tài khoản khác không bị ảnh hưởng', () => {
    const a = track(); const other = track();
    const releaseA = registerStream(1, a.close);
    registerStream(2, other.close);
    releaseA();
    assert.equal(openStreamCount(1), 0);
    closeStreamsOf(1);
    assert.equal(other.closed, false);
    assert.equal(openStreamCount(2), 1);
  });

  it('một hàm đóng ném lỗi không giữ các luồng còn lại mở', () => {
    const bad = () => { throw new Error('boom'); };
    const good = track();
    registerStream(1, bad);
    good.release = registerStream(1, good.close);
    assert.doesNotThrow(() => closeStreamsOf(1));
    assert.equal(good.closed, true);
  });
});
