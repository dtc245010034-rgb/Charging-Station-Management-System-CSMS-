const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { app, closePool } = require('../helpers/app');
const { env } = require('../helpers/db');

describe('SSE fleet-status: token hết hạn thì luồng bị đóng', () => {
  let server;
  let port;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  it('luồng SSE kết thúc ngay khi JWT hết hạn, không sống tiếp sau đó', { timeout: 15000 }, async () => {
    const token = jwt.sign({ id: 1, email: 'exp@test.invalid', role: 'ADMIN', roles: ['ADMIN'] }, env().JWT_SECRET, { expiresIn: 2 });
    const response = await fetch(`http://127.0.0.1:${port}/api/fleet-status/events`, {
      headers: { Cookie: `token=${token}`, Accept: 'text/event-stream' },
    });
    assert.strictEqual(response.status, 200);
    const reader = response.body.getReader();
    const startedAt = Date.now();
    let ended = false;
    const deadline = startedAt + 6000;
    while (Date.now() < deadline) {
      const { done } = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(() => resolve({ done: false }), 500))]);
      if (done) { ended = true; break; }
    }
    await reader.cancel().catch(() => {});
    assert.ok(ended, 'luồng phải đóng sau khi token hết hạn (2 giây)');
    assert.ok(Date.now() - startedAt < 5000, 'phải đóng sát thời điểm hết hạn');
  });
});
