'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { effectiveLimitW } = require('../../src/modules/power/schedule');
const { allocate } = require('../../src/modules/power/allocate');

describe('S-45 / GYM-71: Hạn mức công suất theo khung giờ (Bảng W01–W12)', () => {
  let ownerA;
  let ownerB;
  let stationWithBaseId;
  let stationNoBaseId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    ownerA = await createUser('owner-a@example.com', 'STATION_OWNER');
    ownerB = await createUser('owner-b@example.com', 'STATION_OWNER');

    // Trạm của ownerA có hạn mức nền 22 kW (22000 W), múi giờ Asia/Ho_Chi_Minh
    const stA = await query(
      "INSERT INTO stations (name, address, owner_id, power_limit_w, timezone) VALUES ('Trạm A', '123 Đường A', $1, 22000, 'Asia/Ho_Chi_Minh') RETURNING id",
      [ownerA.id]
    );
    stationWithBaseId = stA.rows[0].id;

    // Trạm của ownerB không có hạn mức nền (power_limit_w = NULL)
    const stB = await query(
      "INSERT INTO stations (name, address, owner_id, power_limit_w, timezone) VALUES ('Trạm B', '456 Đường B', $1, NULL, 'Asia/Ho_Chi_Minh') RETURNING id",
      [ownerB.id]
    );
    stationNoBaseId = stB.rows[0].id;
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('W01–W04: Kiểm tra tính hạn mức hiệu lực theo ranh giới giờ trạm', () => {
    const timezone = 'Asia/Ho_Chi_Minh';
    const baseLimitW = 22000;
    const windows = [
      { id: 1, start_minute: 17 * 60, end_minute: 20 * 60, limit_w: 11000 },
    ];

    // W01: 16:59:59 giờ trạm -> 22 000 W (nền)
    const w01 = effectiveLimitW({ baseLimitW, windows, timezone, at: '2026-10-18T09:59:59Z' });
    assert.deepEqual(w01, { limitW: 22000, source: 'BASE' });

    // W02: 17:00:00 giờ trạm (= 10:00:00 UTC) -> 11 000 W (khung)
    const w02 = effectiveLimitW({ baseLimitW, windows, timezone, at: '2026-10-18T10:00:00Z' });
    assert.deepEqual(w02, { limitW: 11000, source: 'WINDOW', windowId: 1 });

    // W03: 19:59:59 giờ trạm -> 11 000 W (khung)
    const w03 = effectiveLimitW({ baseLimitW, windows, timezone, at: '2026-10-18T12:59:59Z' });
    assert.deepEqual(w03, { limitW: 11000, source: 'WINDOW', windowId: 1 });

    // W04: 20:00:00 giờ trạm -> 22 000 W (nền)
    const w04 = effectiveLimitW({ baseLimitW, windows, timezone, at: '2026-10-18T13:00:00Z' });
    assert.deepEqual(w04, { limitW: 22000, source: 'BASE' });
  });

  it('W05–W08: Phân bổ công suất chia đều có trần theo khung và xe vào/ra', () => {
    // 3 phiên: C (7,4 kW), B (11 kW), A (22 kW)
    const sessions3 = [
      { sessionId: 'C', ratedW: 7400 },
      { sessionId: 'B', ratedW: 11000 },
      { sessionId: 'A', ratedW: 22000 },
    ];

    // W05 Trước ranh giới 17:00 (22 kW): C 7 300, B 7 300, A 7 400 (Σ 22 000)
    const alloc22 = allocate({ limitW: 22000, sessions: sessions3 });
    const map22 = new Map(alloc22.map((s) => [s.sessionId, s.limitW]));
    assert.equal(map22.get('C'), 7300);
    assert.equal(map22.get('B'), 7300);
    assert.equal(map22.get('A'), 7400);
    assert.equal(alloc22.reduce((acc, s) => acc + s.limitW, 0), 22000);

    // W05 Sau ranh giới 17:00 (11 kW): C 3 600, B 3 700, A 3 700 (Σ 11 000)
    const alloc11 = allocate({ limitW: 11000, sessions: sessions3 });
    const map11 = new Map(alloc11.map((s) => [s.sessionId, s.limitW]));
    assert.equal(map11.get('C'), 3600);
    assert.equal(map11.get('B'), 3700);
    assert.equal(map11.get('A'), 3700);
    assert.equal(alloc11.reduce((acc, s) => acc + s.limitW, 0), 11000);

    // W07 18:30 phiên D (7,4 kW) vào -> 4 phiên chia 11 kW: C 2 700, D 2 700, B 2 800, A 2 800 (Σ 11 000)
    const sessions4 = [
      { sessionId: 'C', ratedW: 7400 },
      { sessionId: 'D', ratedW: 7400 },
      { sessionId: 'B', ratedW: 11000 },
      { sessionId: 'A', ratedW: 22000 },
    ];
    const alloc11_4 = allocate({ limitW: 11000, sessions: sessions4 });
    const map11_4 = new Map(alloc11_4.map((s) => [s.sessionId, s.limitW]));
    assert.equal(map11_4.get('C'), 2700);
    assert.equal(map11_4.get('D'), 2700);
    assert.equal(map11_4.get('B'), 2800);
    assert.equal(map11_4.get('A'), 2800);
    assert.equal(alloc11_4.reduce((acc, s) => acc + s.limitW, 0), 11000);

    // W08 20:00 trở lại 22 kW, vẫn 4 phiên: Mỗi phiên 5 500 (Σ 22 000)
    const alloc22_4 = allocate({ limitW: 22000, sessions: sessions4 });
    const map22_4 = new Map(alloc22_4.map((s) => [s.sessionId, s.limitW]));
    assert.equal(map22_4.get('C'), 5500);
    assert.equal(map22_4.get('D'), 5500);
    assert.equal(map22_4.get('B'), 5500);
    assert.equal(map22_4.get('A'), 5500);
    assert.equal(alloc22_4.reduce((acc, s) => acc + s.limitW, 0), 22000);
  });

  it('W09: Thêm khung 17:00–20:00, thêm chồng lấn 18:00–21:00 bị 409, thêm liền kề 20:00–22:00 được chấp nhận', async () => {
    // Thêm khung 17:00–20:00 = 11 kW
    const res1 = await request(app)
      .post(`/api/stations/${stationWithBaseId}/power-windows`)
      .set('Cookie', ownerA.cookie)
      .send({ startTime: '17:00', endTime: '20:00', limitKw: 11 });
    assert.equal(res1.status, 201);
    assert.equal(res1.body.limitW, 11000);
    assert.equal(res1.body.limitKw, 11);

    // Thêm khung chồng lấn 18:00–21:00 -> 409 Conflict
    const resOverlap = await request(app)
      .post(`/api/stations/${stationWithBaseId}/power-windows`)
      .set('Cookie', ownerA.cookie)
      .send({ startTime: '18:00', endTime: '21:00', limitKw: 12 });
    assert.equal(resOverlap.status, 409);

    // Thêm khung liền kề 20:00–22:00 -> 201 Created
    const resAdjacent = await request(app)
      .post(`/api/stations/${stationWithBaseId}/power-windows`)
      .set('Cookie', ownerA.cookie)
      .send({ startTime: '20:00', endTime: '22:00', limitKw: 15 });
    assert.equal(resAdjacent.status, 201);
  });

  it('W10: Khai khung cho trạm chưa có hạn mức nền (409 BASE_LIMIT_REQUIRED) / xoá hạn mức nền khi còn khung (409)', async () => {
    // Trạm B chưa có hạn mức nền (power_limit_w = null)
    const resNoBase = await request(app)
      .post(`/api/stations/${stationNoBaseId}/power-windows`)
      .set('Cookie', ownerB.cookie)
      .send({ startTime: '10:00', endTime: '12:00', limitKw: 10 });
    assert.equal(resNoBase.status, 409);
    assert.match(resNoBase.body.error?.message || resNoBase.body.message || '', /BASE_LIMIT_REQUIRED/);

    // Trạm A đang có khung giờ -> thử xoá hạn mức nền (patch power_limit_kw: null) -> 409
    const resDelBase = await request(app)
      .patch(`/api/stations/${stationWithBaseId}`)
      .set('Cookie', ownerA.cookie)
      .send({ power_limit_kw: null });
    assert.equal(resDelBase.status, 409);
    assert.match(resDelBase.body.error?.message || resDelBase.body.message || '', /Không thể xoá hạn mức nền/);
  });

  it('W11: Chủ trạm A khai khung cho trạm của B (403 + ACCESS_DENIED); end <= start (400); kW 0 hoặc âm (400)', async () => {
    // Chủ trạm A khai khung cho trạm của B -> 403
    const resCross = await request(app)
      .post(`/api/stations/${stationNoBaseId}/power-windows`)
      .set('Cookie', ownerA.cookie)
      .send({ startTime: '08:00', endTime: '10:00', limitKw: 10 });
    assert.equal(resCross.status, 403);

    // end <= start (20:00 đến 17:00) -> 400
    const resEndBeforeStart = await request(app)
      .post(`/api/stations/${stationWithBaseId}/power-windows`)
      .set('Cookie', ownerA.cookie)
      .send({ startTime: '20:00', endTime: '17:00', limitKw: 10 });
    assert.equal(resEndBeforeStart.status, 400);

    // end === start (17:00 đến 17:00) -> 400
    const resEqual = await request(app)
      .post(`/api/stations/${stationWithBaseId}/power-windows`)
      .set('Cookie', ownerA.cookie)
      .send({ startTime: '17:00', endTime: '17:00', limitKw: 10 });
    assert.equal(resEqual.status, 400);

    // kW = 0 -> 400
    const resZeroKw = await request(app)
      .post(`/api/stations/${stationWithBaseId}/power-windows`)
      .set('Cookie', ownerA.cookie)
      .send({ startTime: '06:00', endTime: '08:00', limitKw: 0 });
    assert.equal(resZeroKw.status, 400);

    // kW âm -> 400
    const resNegativeKw = await request(app)
      .post(`/api/stations/${stationWithBaseId}/power-windows`)
      .set('Cookie', ownerA.cookie)
      .send({ startTime: '06:00', endTime: '08:00', limitKw: -5 });
    assert.equal(resNegativeKw.status, 400);
  });

  it('W12: Trạm không có khung nào -> effectiveLimitW trả về hạn mức nền', () => {
    const res = effectiveLimitW({
      baseLimitW: 22000,
      windows: [],
      timezone: 'Asia/Ho_Chi_Minh',
      at: new Date(),
    });
    assert.deepEqual(res, { limitW: 22000, source: 'BASE' });
  });

  it('CRUD: Liệt kê danh sách và xoá khung giờ thành công', async () => {
    const listRes = await request(app)
      .get(`/api/stations/${stationWithBaseId}/power-windows`)
      .set('Cookie', ownerA.cookie);
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body));
    assert.ok(listRes.body.length >= 2);

    const windowToDelete = listRes.body[0];
    const delRes = await request(app)
      .delete(`/api/stations/${stationWithBaseId}/power-windows/${windowToDelete.id}`)
      .set('Cookie', ownerA.cookie)
      .set('Content-Type', 'application/json');
    assert.equal(delRes.status, 200);
    assert.deepEqual(delRes.body, { success: true });

    // Kiểm tra danh sách sau khi xoá
    const listAfter = await request(app)
      .get(`/api/stations/${stationWithBaseId}/power-windows`)
      .set('Cookie', ownerA.cookie);
    assert.equal(listAfter.body.length, listRes.body.length - 1);
  });
});
