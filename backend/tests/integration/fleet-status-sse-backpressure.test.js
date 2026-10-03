const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { app, closePool } = require('../helpers/app');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { issueToken } = require('../../src/modules/auth/auth.service');
const { publish } = require('../../src/modules/fleet-status/fleet-status.events');

describe('SSE fleet-status: client đọc chậm', () => {
  let server;
  let port;
  let admin;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('sse-bp@test.invalid', 'ADMIN');
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('client ngừng đọc: server đóng luồng, không ghi sau khi res.end() và không có lỗi chưa bắt', async () => {
    const uncaught = [];
    const onUncaught = (error) => uncaught.push(error.code || error.message);
    process.on('uncaughtException', onUncaught);
    try {
      const token = issueToken(admin, ['ADMIN']);
      let serverSideClosed = false;
      server.once('connection', (socket) => socket.on('close', () => { serverSideClosed = true; }));
      const client = net.connect(port, '127.0.0.1');
      client.write(`GET /api/fleet-status/events HTTP/1.1\r\nHost: x\r\nCookie: token=${token}\r\nAccept: text/event-stream\r\n\r\n`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      client.pause();

      let sent = 0;
      while (!serverSideClosed && uncaught.length === 0 && sent < 600000) {
        for (let i = 0; i < 20; i += 1) { publish({ ownerId: 1, stationId: 1, chargePointId: 1, connectorId: 1 }); sent += 1; }
        await new Promise((resolve) => setImmediate(resolve));
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      client.destroy();

      assert.deepEqual(uncaught, [], 'ghi vào luồng đã end() không được gây lỗi chưa bắt');
      assert.ok(serverSideClosed, `server phải đóng luồng của client đọc chậm (đã gửi ${sent} sự kiện)`);
    } finally {
      process.off('uncaughtException', onUncaught);
    }
  });
});
