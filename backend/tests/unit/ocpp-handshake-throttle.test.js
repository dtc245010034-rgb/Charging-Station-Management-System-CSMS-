const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');
const { createRateLimiter } = require('../../src/lib/rate-limit');

function fakeSocket() {
  const socket = { destroyed: false, written: '', end(data) { this.written += data; this.destroyed = true; } };
  return socket;
}
const upgradeRequest = (code, ip) => ({
  url: `/ocpp/${code}`,
  headers: { 'sec-websocket-protocol': 'ocpp1.6', 'x-forwarded-for': ip },
  socket: { remoteAddress: ip },
});

describe('S-13/#10: giới hạn tần suất bắt tay WebSocket theo (IP, mã trụ)', () => {
  function build(limit = 5) {
    const lookups = [];
    const handler = createOcppUpgradeHandler({
      wss: { handleUpgrade: (request, socket, head, callback) => callback({}), emit() {} },
      lookupChargePoint: async (code) => { lookups.push(code); return { id: 1, code, station_id: 1, station_status: 'ACTIVE' }; },
      handshakeLimiter: createRateLimiter({ limit, windowMs: 10000, now: () => 0 }),
      clientIpOf: (request) => request.socket.remoteAddress,
      logWarning: () => {},
      logError: () => {},
    });
    return { handler, lookups };
  }

  it('20 bắt tay cùng (IP, mã) trong một cửa sổ: chỉ 5 lần tới DB, 15 lần bị 429', async () => {
    const { handler, lookups } = build();
    const sockets = [];
    for (let index = 0; index < 20; index += 1) {
      const socket = fakeSocket();
      sockets.push(socket);
      await handler(upgradeRequest('CP-THROTTLE', '203.0.113.7'), socket, Buffer.alloc(0));
    }
    assert.equal(lookups.length, 5);
    assert.equal(sockets.filter((socket) => socket.written.startsWith('HTTP/1.1 429')).length, 15);
  });

  it('IP khác hoặc mã khác không bị ảnh hưởng', async () => {
    const { handler, lookups } = build(1);
    await handler(upgradeRequest('CP-A', '203.0.113.7'), fakeSocket(), Buffer.alloc(0));
    const blocked = fakeSocket();
    await handler(upgradeRequest('CP-A', '203.0.113.7'), blocked, Buffer.alloc(0));
    await handler(upgradeRequest('CP-A', '203.0.113.8'), fakeSocket(), Buffer.alloc(0));
    await handler(upgradeRequest('CP-B', '203.0.113.7'), fakeSocket(), Buffer.alloc(0));
    assert.match(blocked.written, /^HTTP\/1\.1 429/);
    assert.equal(lookups.length, 3);
  });
});
