const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app, closePool } = require('../helpers/app');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { openStreamCount } = require('../../src/lib/sse-registry');

const MAX = 5; // SSE_MAX_CONNECTIONS_PER_USER mặc định

describe('SSE: giới hạn luồng theo tài khoản và đóng luồng khi token bị thu hồi', () => {
  let server;
  let base;
  const opened = [];

  const openStream = async (path, cookie) => {
    const response = await fetch(`${base}${path}`, { headers: { Cookie: cookie, Accept: 'text/event-stream' } });
    assert.strictEqual(response.status, 200);
    const reader = response.body.getReader();
    await reader.read(); // chunk đầu tiên: "retry: 1000"
    opened.push(reader);
    return reader;
  };

  const endsWithin = async (reader, ms) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const { done } = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(() => resolve({ done: false }), 200))]);
      if (done) return true;
    }
    return false;
  };

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    for (const reader of opened) await reader.cancel().catch(() => {});
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('mở luồng thứ MAX+1 thì luồng cũ nhất bị đóng, số luồng không vượt MAX', { timeout: 15000 }, async () => {
    const driver = await createUser('sse-cap@test.invalid', 'DRIVER');
    const readers = [];
    for (let i = 0; i < MAX; i += 1) readers.push(await openStream('/api/me/sessions/events', driver.cookie));
    assert.strictEqual(openStreamCount(driver.id), MAX);

    readers.push(await openStream('/api/me/sessions/events', driver.cookie));
    assert.ok(await endsWithin(readers[0], 3000), 'luồng cũ nhất phải bị đóng');
    assert.strictEqual(openStreamCount(driver.id), MAX);
  });

  it('đăng xuất thì mọi luồng của tài khoản đó đóng ngay, tài khoản khác không bị ảnh hưởng', { timeout: 15000 }, async () => {
    const driver = await createUser('sse-logout@test.invalid', 'DRIVER');
    const other = await createUser('sse-other@test.invalid', 'DRIVER');
    const mine = await openStream('/api/me/sessions/events', driver.cookie);
    const mine2 = await openStream('/api/sessions/events', driver.cookie);
    const theirs = await openStream('/api/me/sessions/events', other.cookie);

    const res = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: driver.cookie, 'Content-Type': 'application/json' }, body: '{}' });
    assert.strictEqual(res.status, 200);

    assert.ok(await endsWithin(mine, 3000), 'luồng /me/sessions/events phải đóng');
    assert.ok(await endsWithin(mine2, 3000), 'luồng /sessions/events phải đóng');
    assert.strictEqual(openStreamCount(driver.id), 0);
    assert.strictEqual(openStreamCount(other.id), 1);
    assert.strictEqual(await endsWithin(theirs, 500), false, 'tài khoản khác vẫn nhận luồng');
  });

  it('luồng fleet-status cũng đóng khi đăng xuất', { timeout: 15000 }, async () => {
    const admin = await createUser('sse-admin@test.invalid', 'ADMIN');
    const stream = await openStream('/api/fleet-status/events', admin.cookie);
    const res = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' }, body: '{}' });
    assert.strictEqual(res.status, 200);
    assert.ok(await endsWithin(stream, 3000), 'luồng fleet-status phải đóng');
    assert.strictEqual(openStreamCount(admin.id), 0);
  });
});
