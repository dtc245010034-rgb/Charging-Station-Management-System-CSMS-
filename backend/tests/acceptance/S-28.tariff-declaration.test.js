const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');

describe('S-28 (GYM-54): Khai báo biểu giá trạm sạc và phí chiếm trụ', () => {
  let owner;
  let otherOwner;
  let stationId;

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    owner = await createUser('owner-s28@example.com', 'STATION_OWNER');
    otherOwner = await createUser('other-owner-s28@example.com', 'STATION_OWNER');

    const stRes = await postStation(owner, stationBody({ name: 'Trạm S28' }));
    stationId = stRes.body.id;

    await postStation(otherOwner, stationBody({ name: 'Trạm khác' }));
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('AC1: Chủ trạm khai báo đơn giá theo kWh và phí chiếm trụ theo phút kèm ân hạn → biểu giá được lưu và gắn với trạm', async () => {
    const payload = {
      effectiveFrom: todayStr,
      periods: [
        { from: '00:00', to: '24:00', pricePerKwh: 4000, label: 'Cả ngày' },
      ],
      idle: {
        graceMin: 15,
        perMinDong: 1000,
      },
    };

    const res = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send(payload);

    assert.equal(res.status, 201);
    assert.equal(res.body.version, 1);
    assert.equal(res.body.effective_from, todayStr);
    assert.equal(res.body.idle_grace_min, 15);
    assert.equal(Number(res.body.idle_per_min_dong), 1000);
    assert.equal(res.body.periods.length, 1);
    assert.equal(res.body.periods[0].start_minute, 0);
    assert.equal(res.body.periods[0].end_minute, 1440);
    assert.equal(Number(res.body.periods[0].price_per_kwh_dong), 4000);

    // Kiểm tra xem lại danh sách: phiên bản hôm nay đang ACTIVE
    const listRes = await request(app)
      .get(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.length, 1);
    assert.equal(listRes.body[0].state, 'ACTIVE');

    // Kiểm tra có audit log TARIFF_CREATED
    const auditRows = (await query('SELECT action, entity, entity_id FROM audit_logs WHERE user_id = $1 AND action = $2', [owner.id, 'TARIFF_CREATED'])).rows;
    assert.ok(auditRows.length >= 1);
    assert.equal(String(auditRows[0].entity_id), String(stationId));
  });

  it('AC3: Đơn giá âm, thời gian ân hạn âm hoặc phí chiếm trụ âm → bị chặn (400)', async () => {
    // Đơn giá âm
    const resNegativePrice = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: '2026-11-01',
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: -1000 }],
        idle: { graceMin: 10, perMinDong: 1000 },
      });
    assert.equal(resNegativePrice.status, 400);

    // Thời gian ân hạn âm
    const resNegativeGrace = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: '2026-11-01',
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3000 }],
        idle: { graceMin: -5, perMinDong: 1000 },
      });
    assert.equal(resNegativeGrace.status, 400);

    // Phí chiếm trụ âm
    const resNegativePerMin = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: '2026-11-01',
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3000 }],
        idle: { graceMin: 10, perMinDong: -500 },
      });
    assert.equal(resNegativePerMin.status, 400);

    // Số thực không nguyên
    const resFloat = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: '2026-11-01',
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3500.5 }],
        idle: { graceMin: 10, perMinDong: 1000 },
      });
    assert.equal(resFloat.status, 400);
  });

  it('Quy tắc ngày hiệu lực Q6: Ngày quá khứ → 400; Bản sau có hiệu lực hôm nay → 400; Trùng ngày → 409', async () => {
    // Ngày quá khứ (hôm qua)
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(yesterday);
    const resPast = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: yesterdayStr,
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3000 }],
      });
    assert.equal(resPast.status, 400);

    // Trùng ngày với bản 1 đã tạo ở trên (hôm nay) → 400 (bản sau không được áp dụng hôm nay) hoặc 409
    const resTodayAgain = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: todayStr,
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3500 }],
      });
    assert.equal(resTodayAgain.status, 400); // Đã có biểu giá rồi thì bản sau phải từ ngày mai

    // Tạo bản 2 vào ngày 2099-01-01 → 201
    const resTomorrow = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: '2099-01-01',
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3200 }],
      });
    assert.equal(resTomorrow.status, 201);
    assert.equal(resTomorrow.body.version, 2);

    // Trùng ngày với bản 2 vừa tạo → 409 Conflict
    const resDuplicate = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: '2099-01-01',
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3800 }],
      });
    assert.equal(resDuplicate.status, 409);
  });

  it('Quyền sở hữu (scopeByOwner): Chủ trạm B gọi biểu giá của trạm A → 403 Forbidden và có dòng ACCESS_DENIED trong audit log', async () => {
    // Chủ B cố xem biểu giá trạm A
    const resGet = await request(app)
      .get(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', otherOwner.cookie);
    assert.equal(resGet.status, 403);

    // Chủ B cố thêm biểu giá vào trạm A
    const resPost = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', otherOwner.cookie)
      .send({
        effectiveFrom: '2099-05-01',
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 5000 }],
      });
    assert.equal(resPost.status, 403);

    // Kiểm tra có audit log ACCESS_DENIED của otherOwner
    const deniedRows = (await query('SELECT action, entity, entity_id FROM audit_logs WHERE user_id = $1 AND action = $2', [otherOwner.id, 'ACCESS_DENIED'])).rows;
    assert.ok(deniedRows.length >= 1);
  });
});
