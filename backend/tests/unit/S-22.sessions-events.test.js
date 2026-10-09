const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { publish, subscribe } = require('../../src/modules/sessions/sessions.events');

describe('sessions.events: Pub/Sub thời gian thực cho tài xế', () => {
  it('đăng ký listener và nhận sự kiện đúng dữ liệu', () => {
    const received = [];
    const unsubscribe = subscribe((event) => received.push(event));

    try {
      const payload = {
        type: 'METER_VALUE',
        sessionId: 101,
        driverId: 5,
        energy_kwh: 12.5,
      };
      publish(payload);
      assert.strictEqual(received.length, 1);
      assert.deepEqual(received[0], payload);
    } finally {
      unsubscribe();
    }
  });

  it('huỷ đăng ký (unsubscribe) không còn nhận sự kiện mới', () => {
    const received = [];
    const unsubscribe = subscribe((event) => received.push(event));
    unsubscribe();

    publish({ type: 'METER_VALUE', sessionId: 102 });
    assert.strictEqual(received.length, 0);
  });

  it('một listener bị lỗi không chặn các listener khác và không làm sập hàm publish', () => {
    const received = [];
    const off = [
      subscribe(() => {
        throw new Error('Listener gặp sự cố!');
      }),
      subscribe((event) => received.push(event.sessionId)),
    ];

    try {
      assert.doesNotThrow(() => publish({ sessionId: 999 }));
      assert.deepEqual(received, [999]);
    } finally {
      off.forEach((fn) => fn());
    }
  });

  it('subscribe từ chối tham số không phải là function', () => {
    assert.throws(() => subscribe(null), TypeError);
    assert.throws(() => subscribe('not a function'), TypeError);
  });
});
