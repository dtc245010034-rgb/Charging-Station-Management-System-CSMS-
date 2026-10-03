const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { publish, subscribe } = require('../../src/modules/fleet-status/fleet-status.events');

describe('fleet-status.events: cách ly người nghe', () => {
  it('một listener ném lỗi không chặn các listener còn lại và không làm publish() ném lỗi', () => {
    const received = [];
    const off = [
      subscribe(() => { throw new Error('listener hỏng'); }),
      subscribe((event) => received.push(event.chargePointId)),
    ];
    try {
      assert.doesNotThrow(() => publish({ chargePointId: 7 }));
      assert.deepEqual(received, [7]);
    } finally {
      off.forEach((unsubscribe) => unsubscribe());
    }
  });
});
