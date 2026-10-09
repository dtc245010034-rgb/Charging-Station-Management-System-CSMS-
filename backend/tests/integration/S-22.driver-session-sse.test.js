const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { app, closePool } = require('../helpers/app');
const { env, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { publish } = require('../../src/modules/sessions/sessions.events');

describe('S-22 SSE: Luồng sự kiện phiên sạc tài xế (T-48 / GYM-48)', () => {
  let server;
  let baseUrl;
  let driver1;
  let driver2;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();

    driver1 = await createUser('driver-sse-1@test.invalid', 'DRIVER');
    driver2 = await createUser('driver-sse-2@test.invalid', 'DRIVER');

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  it('AC2: Tài xế nhận đúng sự kiện của mình và KHÔNG nhận sự kiện của tài xế khác', { timeout: 10000 }, async () => {
    const res = await fetch(`${baseUrl}/api/me/sessions/events`, {
      headers: { Cookie: driver1.cookie, Accept: 'text/event-stream' },
    });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let receivedChunks = '';

    // Đọc lời mở đầu (retry: 1000)
    const first = await reader.read();
    receivedChunks += decoder.decode(first.value, { stream: true });

    // Phát sự kiện cho driver2 (người khác) -> driver1 KHÔNG được nhận
    publish({
      driverId: driver2.id,
      sessionId: 888,
      status: 'CHARGING',
      currentKwh: 12.3,
      latestPowerW: 50000,
      type: 'meter_value',
    });

    // Phát sự kiện cho driver1 (chính mình) -> driver1 PHẢI nhận được
    publish({
      driverId: driver1.id,
      sessionId: 777,
      status: 'CHARGING',
      currentKwh: 3.5,
      latestPowerW: 22000,
      type: 'meter_value',
    });

    // Chờ nhận dữ liệu
    const deadline = Date.now() + 4000;
    let foundMyEvent = false;
    let foundOtherEvent = false;

    while (Date.now() < deadline) {
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ done: false, value: null }), 500)),
      ]);
      if (done) break;
      if (value) {
        receivedChunks += decoder.decode(value, { stream: true });
        if (receivedChunks.includes('"session_id":777')) {
          foundMyEvent = true;
          break;
        }
      }
    }
    await reader.cancel().catch(() => {});

    foundOtherEvent = receivedChunks.includes('"session_id":888');

    assert.ok(foundMyEvent, 'Tài xế 1 phải nhận được sự kiện phiên 777 của chính mình');
    assert.strictEqual(foundOtherEvent, false, 'Tài xế 1 tuyệt đối không được nhận sự kiện 888 của tài xế 2');
    assert.ok(receivedChunks.includes('"current_kwh":3.5'), 'Số kWh cập nhật phải có trong dữ liệu sự kiện');
  });

  it('NFR / Token Expiry: Luồng SSE tự đóng khi JWT hết hạn', { timeout: 15000 }, async () => {
    // Tạo token hết hạn sau 2 giây
    const token = jwt.sign(
      { id: driver1.id, email: driver1.email, role: 'DRIVER', roles: ['DRIVER'], tv: 0 },
      env().JWT_SECRET,
      { expiresIn: 2 }
    );

    const response = await fetch(`${baseUrl}/api/me/sessions/events`, {
      headers: { Cookie: `token=${token}`, Accept: 'text/event-stream' },
    });
    assert.strictEqual(response.status, 200);

    const reader = response.body.getReader();
    const startedAt = Date.now();
    let ended = false;
    const deadline = startedAt + 6000;

    while (Date.now() < deadline) {
      const { done } = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ done: false }), 500)),
      ]);
      if (done) {
        ended = true;
        break;
      }
    }
    await reader.cancel().catch(() => {});

    assert.ok(ended, 'Luồng SSE phải tự đóng sau khi token hết hạn (2 giây)');
    assert.ok(Date.now() - startedAt < 5000, 'Phải đóng sát mốc 2 giây, không treo kết nối');
  });
});
