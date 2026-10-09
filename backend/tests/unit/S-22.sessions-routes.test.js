const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { errorHandler } = require('../../src/middlewares/errorHandler');
const sessionsRoutes = require('../../src/modules/sessions/sessions.routes');
const sessionsService = require('../../src/modules/sessions/sessions.service');
const env = require('../../src/config/env');
const usersRepo = require('../../src/modules/users/users.repository');

const JWT_SECRET = env.JWT_SECRET;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', sessionsRoutes);
  app.use(errorHandler);
  return app;
}

function makeCookie(user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, roles: user.roles || [user.role], tv: 0 },
    JWT_SECRET,
    { expiresIn: 3600 }
  );
  return `token=${token}`;
}

describe('S-22: Sessions routes unit/integration mock tests', () => {
  const driver1 = { id: 10, email: 'd1@test.invalid', role: 'DRIVER', roles: ['DRIVER'] };
  const driver2 = { id: 20, email: 'd2@test.invalid', role: 'DRIVER', roles: ['DRIVER'] };
  const operator = { id: 99, email: 'op@test.invalid', role: 'OPERATOR', roles: ['OPERATOR'] };

  const originalTokenVersionOf = usersRepo.tokenVersionOf;
  const originalGetCurrent = sessionsService.getCurrentDriverSession;
  const originalGetById = sessionsService.getSessionById;

  usersRepo.tokenVersionOf = async () => 0;

  after(() => {
    usersRepo.tokenVersionOf = originalTokenVersionOf;
  });

  it('GET /api/me/sessions/current trả 401 khi chưa đăng nhập', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/me/sessions/current');
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/me/sessions/current trả 403 khi vai trò không phải DRIVER (sessions:read-own)', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/api/me/sessions/current')
      .set('Cookie', makeCookie(operator));
    assert.strictEqual(res.status, 403);
  });

  it('AC3: GET /api/me/sessions/current trả 204 khi tài xế không có phiên', async () => {
    sessionsService.getCurrentDriverSession = async () => null;
    try {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/me/sessions/current')
        .set('Cookie', makeCookie(driver1));
      assert.strictEqual(res.status, 204);
      assert.strictEqual(res.text, '');
    } finally {
      sessionsService.getCurrentDriverSession = originalGetCurrent;
    }
  });

  it('AC1: GET /api/me/sessions/current trả 200 kèm phiên đang sạc', async () => {
    const mockSession = {
      id: 55,
      station: { name: 'Trạm Test' },
      latest_reading: { energy_kwh: 4.2 },
    };
    sessionsService.getCurrentDriverSession = async () => mockSession;
    try {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/me/sessions/current')
        .set('Cookie', makeCookie(driver1));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, 55);
      assert.strictEqual(res.body.latest_reading.energy_kwh, 4.2);
    } finally {
      sessionsService.getCurrentDriverSession = originalGetCurrent;
    }
  });

  it('GET /api/sessions/:id trả 400 nếu id không phải số nguyên dương', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/api/sessions/abc')
      .set('Cookie', makeCookie(driver1));
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_INPUT');
  });

  it('AC4: GET /api/sessions/:id trả 403 khi xem phiên của tài xế khác', async () => {
    const { ForbiddenError } = require('../../src/lib/errors');
    sessionsService.getSessionById = async () => {
      throw new ForbiddenError('Không có quyền');
    };
    try {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/sessions/77')
        .set('Cookie', makeCookie(driver2));
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    } finally {
      sessionsService.getSessionById = originalGetById;
    }
  });

  it('GET /api/sessions/:id trả 200 khi truy cập đúng phiên của mình', async () => {
    sessionsService.getSessionById = async (id) => ({
      id,
      latest_reading: { energy_kwh: 10.0 },
    });
    try {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/sessions/77')
        .set('Cookie', makeCookie(driver1));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, 77);
      assert.strictEqual(res.body.latest_reading.energy_kwh, 10.0);
    } finally {
      sessionsService.getSessionById = originalGetById;
    }
  });
});
