const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { closeWithGrace } = require('../../src/modules/charge-points/connection-registry');

function fakeSocket() {
  const ws = new EventEmitter();
  ws.closeCalls = [];
  ws.terminateCalls = 0;
  ws.close = (code, reason) => ws.closeCalls.push([code, reason]);
  ws.terminate = () => { ws.terminateCalls += 1; };
  return ws;
}

describe('F6: closeWithGrace', () => {
  it('gọi terminate khi sau thời gian chờ socket vẫn chưa đóng', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const ws = fakeSocket();

    closeWithGrace(ws, 1008, 'Station locked', 1500);
    assert.deepEqual(ws.closeCalls, [[1008, 'Station locked']]);

    t.mock.timers.tick(1499);
    assert.equal(ws.terminateCalls, 0);
    t.mock.timers.tick(1);
    assert.equal(ws.terminateCalls, 1);
  });

  it('không terminate và không để lại hẹn giờ khi socket đã đóng đúng hạn', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const ws = fakeSocket();

    closeWithGrace(ws, 1008, 'Station locked', 1500);
    ws.emit('close');
    t.mock.timers.tick(5000);

    assert.equal(ws.terminateCalls, 0);
    assert.equal(ws.listenerCount('close'), 0);
  });

  it('không ném lỗi khi close() ném lỗi: chuyển sang terminate ngay', () => {
    const ws = fakeSocket();
    ws.close = () => { throw new Error('boom'); };

    closeWithGrace(ws, 1008, 'Station locked', 1500);
    assert.equal(ws.terminateCalls, 1);
  });
});
