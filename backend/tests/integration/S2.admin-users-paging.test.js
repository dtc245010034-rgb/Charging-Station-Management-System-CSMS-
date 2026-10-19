'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const TOTAL_USERS = 28;

describe('S2: danh sách tài khoản quản trị phân trang đủ 28 tài khoản', { concurrency: false }, () => {
  let admin;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('s2-admin@test.invalid', 'ADMIN');
    for (let i = 1; i < TOTAL_USERS; i += 1) {
      await createUser(`s2-user-${String(i).padStart(2, '0')}@test.invalid`, 'DRIVER');
    }
  });
  after(async () => { await resetSchema(); await closePool(); });

  const get = (path) => request(app).get(path).set('Cookie', admin.cookie);

  it('trang 1 có 20, trang 2 có 8, total = 28, không trùng tài khoản giữa hai trang', async () => {
    const first = await get('/api/admin/users?page=1&limit=20');
    const second = await get('/api/admin/users?page=2&limit=20');
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.users.length, 20);
    assert.equal(second.body.users.length, 8);
    assert.equal(first.body.total, TOTAL_USERS);
    assert.equal(second.body.total, TOTAL_USERS);
    const ids = [...first.body.users, ...second.body.users].map((u) => u.id);
    assert.equal(new Set(ids).size, TOTAL_USERS);
  });

  it('mặc định (không tham số) trả 20 tài khoản đầu và total = 28', async () => {
    const res = await get('/api/admin/users');
    assert.equal(res.body.users.length, 20);
    assert.equal(res.body.total, TOTAL_USERS);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.limit, 20);
  });

  it('trang vượt quá tổng số trả danh sách rỗng nhưng vẫn báo total', async () => {
    const res = await get('/api/admin/users?page=9&limit=20');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.users, []);
    assert.equal(res.body.total, TOTAL_USERS);
  });

  it('page = 0, limit = 0 hoặc limit quá lớn trả 400 chứ không phải 500 hay trả cả bảng', async () => {
    for (const q of ['page=0', 'limit=0', 'limit=101', 'limit=1000000000000', 'page=99999999999999999999']) {
      const res = await get(`/api/admin/users?${q}`);
      assert.equal(res.status, 400, q);
      assert.equal(res.body.error.code, 'BAD_REQUEST', q);
    }
  });

  it('tìm theo email tài khoản thứ 21 trở đi (nằm ở trang 2) bằng tham số query', async () => {
    const res = await get('/api/admin/users?query=s2-user-27');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.users[0].email, 's2-user-27@test.invalid');
  });

  it('ký tự đặc biệt % và _ trong ô tìm kiếm được xử lý như văn bản thường', async () => {
    await query("UPDATE users SET name = 'Nguyen_Van%A' WHERE email = 's2-user-05@test.invalid'");
    await query("UPDATE users SET name = 'NguyenXVanYA' WHERE email = 's2-user-06@test.invalid'");
    const literal = await get(`/api/admin/users?query=${encodeURIComponent('Nguyen_Van%A')}`);
    assert.equal(literal.body.total, 1);
    assert.equal(literal.body.users[0].email, 's2-user-05@test.invalid');
    const wildcard = await get(`/api/admin/users?query=${encodeURIComponent('%')}`);
    assert.equal(wildcard.body.total, 1, 'dấu % đơn lẻ chỉ khớp tên chứa đúng ký tự %');
  });

  it('chỉ ADMIN được xem danh sách', async () => {
    const owner = await createUser('s2-owner@test.invalid', 'STATION_OWNER');
    const res = await request(app).get('/api/admin/users').set('Cookie', owner.cookie);
    assert.equal(res.status, 403);
  });
});
