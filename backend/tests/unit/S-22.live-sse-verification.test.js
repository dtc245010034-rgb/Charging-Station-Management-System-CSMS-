const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const sessionsRoutes = require('../../src/modules/sessions/sessions.routes');
const sessionsEvents = require('../../src/modules/sessions/sessions.events');
const env = require('../../src/config/env');
const usersRepo = require('../../src/modules/users/users.repository');
const { errorHandler } = require('../../src/middlewares/errorHandler');

const JWT_SECRET = env.JWT_SECRET;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', sessionsRoutes);
  app.use(errorHandler);
  return app;
}

function makeToken(user, expiresIn = 3600) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, roles: user.roles || [user.role], tv: 0 },
    JWT_SECRET,
    { expiresIn }
  );
}

describe('S-22: Live HTTP & SSE Stream Verification', () => {
  const driverA = { id: 101, email: 'driverA@test.invalid', role: 'DRIVER', roles: ['DRIVER'] };
  const driverB = { id: 202, email: 'driverB@test.invalid', role: 'DRIVER', roles: ['DRIVER'] };
  let server;
  let port;
  const originalTokenVersionOf = usersRepo.tokenVersionOf;

  usersRepo.tokenVersionOf = async () => 0;

  it('khởi tạo live HTTP server', async () => {
    const app = createTestApp();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
    assert.ok(port > 0);
  });

  it('AC2 & NFR: SSE truyền tin thời gian thực đúng cấu trúc và cô lập giữa 2 tài xế', async () => {
    const tokenA = makeToken(driverA);
    const tokenB = makeToken(driverB);

    // Mở 2 luồng EventSource fetch đồng thời cho Driver A và Driver B
    const resA = await fetch(`http://127.0.0.1:${port}/api/me/sessions/events`, {
      headers: { Cookie: `token=${tokenA}`, Accept: 'text/event-stream' },
    });
    const resB = await fetch(`http://127.0.0.1:${port}/api/me/sessions/events`, {
      headers: { Cookie: `token=${tokenB}`, Accept: 'text/event-stream' },
    });

    assert.strictEqual(resA.status, 200);
    assert.strictEqual(resB.status, 200);

    const readerA = resA.body.getReader();
    const readerB = resB.body.getReader();
    const decoder = new TextDecoder();

    // Bỏ qua tin khởi tạo retry
    await readerA.read();
    await readerB.read();

    // 1. Phát tin cho Driver A
    sessionsEvents.publish({
      type: 'METER_VALUE',
      sessionId: 501,
      driverId: driverA.id,
      energy_kwh: 3.5,
      power_kw: 11.0,
      current_a: 16.0,
      sampled_at: new Date().toISOString(),
    });

    // 2. Đọc từ A: phải nhận đúng tin
    const chunkA = await readerA.read();
    const textA = decoder.decode(chunkA.value);
    assert.ok(textA.includes('"energy_kwh":3.5'));
    assert.ok(textA.includes(`"sessionId":501`));

    // 3. Phát tin cho Driver B
    sessionsEvents.publish({
      type: 'METER_VALUE',
      sessionId: 808,
      driverId: driverB.id,
      energy_kwh: 12.8,
      power_kw: 50.0,
      current_a: 72.0,
      sampled_at: new Date().toISOString(),
    });

    // 4. Đọc từ B: phải nhận đúng tin
    const chunkB = await readerB.read();
    const textB = decoder.decode(chunkB.value);
    assert.ok(textB.includes('"energy_kwh":12.8'));
    assert.ok(textB.includes(`"sessionId":808`));
    assert.ok(!textB.includes('501'), 'Driver B tuyệt đối không nhận tin của Driver A');

    await readerA.cancel();
    await readerB.cancel();
  });

  it('SSE đóng kết nối ngay khi JWT hết hạn', { timeout: 10000 }, async () => {
    // Ký token hết hạn sau 2 giây
    const tokenExpiring = makeToken(driverA, 2);
    const res = await fetch(`http://127.0.0.1:${port}/api/me/sessions/events`, {
      headers: { Cookie: `token=${tokenExpiring}`, Accept: 'text/event-stream' },
    });
    assert.strictEqual(res.status, 200);

    const reader = res.body.getReader();
    const startedAt = Date.now();
    let closed = false;
    const deadline = startedAt + 5000;

    while (Date.now() < deadline) {
      const { done } = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ done: false }), 400)),
      ]);
      if (done) {
        closed = true;
        break;
      }
    }
    await reader.cancel().catch(() => {});
    assert.ok(closed, 'Luồng SSE phải tự động đóng khi token hết hạn');
  });

  it('dọn dẹp live server', async () => {
    usersRepo.tokenVersionOf = originalTokenVersionOf;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });
});
