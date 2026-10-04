const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { run, resetSchema } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { secureRouter, registry } = require('../../src/security/routeGuard');
const permissions = require('../../src/security/permissions');
const { errorHandler } = require('../../src/middlewares/errorHandler');

// Số route đã đăng ký qua guard khi app thật được dựng (trước khi test tạo router phụ).
const realRoutes = registry.map((r) => ({ ...r }));

function countRoutes(stack) {
  return stack.reduce((n, layer) => n + (layer.route ? 1 : layer.handle?.stack ? countRoutes(layer.handle.stack) : 0), 0);
}

function fakeApp(register) {
  const router = secureRouter();
  register(router);
  const a = express();
  a.use(cookieParser());
  a.use(router);
  a.use(errorHandler);
  return a;
}

describe('S-03 route guard: mặc định từ chối', () => {
  let admin;
  let owner;
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    admin = await createUser('admin@example.com', 'ADMIN', 'password123');
    owner = await createUser('owner@example.com', 'STATION_OWNER', 'password123');
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('S-03 AC: route chưa khai báo quyền → 403 kể cả ADMIN, và có cảnh báo lúc khai báo', async () => {
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    let a;
    try {
      a = fakeApp((r) => r.get('/undeclared', (req, res) => res.json({ ok: true })));
    } finally {
      console.warn = original;
    }
    assert.ok(warnings.some((w) => w.includes('/undeclared')));
    const res = await request(a).get('/undeclared').set('Cookie', admin.cookie);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    assert.strictEqual((await request(a).get('/undeclared')).status, 403);
  });

  it('route khai access mảng vai trò: vai trò trong danh sách → 200, ngoài danh sách → 403, không phiên → 401', async () => {
    const a = fakeApp((r) => r.get('/only-admin', { access: ['ADMIN'] }, (req, res) => res.json({ ok: true })));
    assert.strictEqual((await request(a).get('/only-admin').set('Cookie', admin.cookie)).status, 200);
    assert.strictEqual((await request(a).get('/only-admin').set('Cookie', owner.cookie)).status, 403);
    assert.strictEqual((await request(a).get('/only-admin')).status, 401);
  });

  it("access: 'public' không cần phiên", async () => {
    const a = fakeApp((r) => r.get('/open', { access: 'public' }, (req, res) => res.json({ ok: true })));
    assert.strictEqual((await request(a).get('/open')).status, 200);
  });

  it('access sai (vai trò lạ, mảng rỗng, chuỗi khác public) → ném lỗi ngay khi khai báo', () => {
    for (const access of [['ROOT'], [], 'everyone', 42]) {
      assert.throws(() => secureRouter().get('/x', { access }, () => {}), /access/i, JSON.stringify(access));
    }
  });

  it('router.all / router.use bị chặn để không đi vòng guard', () => {
    assert.throws(() => secureRouter().all('/x', () => {}));
    assert.throws(() => secureRouter().use(() => {}));
  });

  it('quét app thật: mọi route đều đi qua guard và đều khai access', () => {
    assert.ok(realRoutes.length > 0);
    assert.strictEqual(countRoutes(app.router.stack), realRoutes.length, 'có route đăng ký ngoài secureRouter');
    for (const r of realRoutes) assert.ok(r.access !== undefined, `${r.method} ${r.path} thiếu access`);
  });

  it('permissions.js là nguồn duy nhất: khớp ma trận Sprint 1 và chỉ dùng 5 vai trò hợp lệ', () => {
    const { permissions: p } = permissions;
    assert.deepStrictEqual(p['stations:read'], ['ADMIN', 'STATION_OWNER', 'OPERATOR']);
    assert.deepStrictEqual(p['charge-points:read'], ['ADMIN', 'STATION_OWNER', 'OPERATOR']);
    assert.deepStrictEqual(p['stations:write'], ['ADMIN', 'STATION_OWNER']);
    assert.deepStrictEqual(p['charge-points:write'], ['ADMIN', 'STATION_OWNER']);
    assert.deepStrictEqual(p['users:create'], ['ADMIN']);
    assert.deepStrictEqual(p['roles:read'], ['ADMIN']);
    assert.strictEqual(p['auth:public'], 'public');
    assert.throws(() => permissions.access('khong:ton-tai'));
  });
});
