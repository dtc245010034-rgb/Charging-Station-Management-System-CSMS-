const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');

describe('S-29 (GYM-55): Biểu giá có nhiều khung giờ trong ngày, không chồng lấn và phủ kín 24 giờ', () => {
  let owner;
  let stationId;
  let seq = 0;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    owner = await createUser('owner-s29@example.com', 'STATION_OWNER');
    const stRes = await postStation(owner, stationBody({ name: 'Trạm S29' }));
    stationId = stRes.body.id;
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('AC1: Khai 3 khung 00:00–06:00, 06:00–22:00, 22:00–24:00 với 3 đơn giá → được chấp nhận', async () => {
    const res = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: `2099-02-${String(++seq).padStart(2, '0')}`,
        periods: [
          { from: '00:00', to: '06:00', pricePerKwh: 2500, label: 'Thấp điểm sáng' },
          { from: '06:00', to: '22:00', pricePerKwh: 4000, label: 'Bình thường' },
          { from: '22:00', to: '24:00', pricePerKwh: 3000, label: 'Đêm' },
        ],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.periods.length, 3);
    assert.equal(res.body.periods[0].start_minute, 0);
    assert.equal(res.body.periods[0].end_minute, 360);
    assert.equal(Number(res.body.periods[0].price_per_kwh_dong), 2500);

    assert.equal(res.body.periods[1].start_minute, 360);
    assert.equal(res.body.periods[1].end_minute, 1320);
    assert.equal(Number(res.body.periods[1].price_per_kwh_dong), 4000);

    assert.equal(res.body.periods[2].start_minute, 1320);
    assert.equal(res.body.periods[2].end_minute, 1440);
    assert.equal(Number(res.body.periods[2].price_per_kwh_dong), 3000);
  });

  it('AC2: Chồng lấn (05:00–07:00 chồng) hoặc hở (bỏ 21:00–22:00) → bị chặn kèm thông báo rõ khoảng bị chồng/hở', async () => {
    // Chồng lấn: 00:00-06:00, 05:00-07:00, 07:00-24:00 (chồng ở 05:00-06:00)
    const resOverlap = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: `2099-03-${String(++seq).padStart(2, '0')}`,
        periods: [
          { from: '00:00', to: '06:00', pricePerKwh: 2500 },
          { from: '05:00', to: '07:00', pricePerKwh: 3500 },
          { from: '07:00', to: '24:00', pricePerKwh: 4000 },
        ],
      });

    assert.equal(resOverlap.status, 400);
    const errorsOverlap = resOverlap.body.error?.details || resOverlap.body.error?.errors || [];
    assert.ok(errorsOverlap.some((e) => e.type === 'OVERLAP' && e.from === '05:00' && e.to === '06:00'));

    // Hở khoảng: 00:00-21:00, 22:00-24:00 (hở ở 21:00-22:00)
    const resGap = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: `2099-03-${String(++seq).padStart(2, '0')}`,
        periods: [
          { from: '00:00', to: '21:00', pricePerKwh: 3000 },
          { from: '22:00', to: '24:00', pricePerKwh: 4000 },
        ],
      });

    assert.equal(resGap.status, 400);
    const errorsGap = resGap.body.error?.details || resGap.body.error?.errors || [];
    assert.ok(errorsGap.some((e) => e.type === 'GAP' && e.from === '21:00' && e.to === '22:00'));
  });

  it('AC3: Khung vòng qua nửa đêm 22:00–02:00 → được chấp nhận, trong DB tách thành 2 đoạn [1320, 1440) và [0, 120), giữ nhãn gốc', async () => {
    // 22:00–02:00 (giá 3000) và 02:00–22:00 (giá 4000)
    const resWrap = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: `2099-04-${String(++seq).padStart(2, '0')}`,
        periods: [
          { from: '22:00', to: '02:00', pricePerKwh: 3000, label: 'Đêm 22:00-02:00' },
          { from: '02:00', to: '22:00', pricePerKwh: 4000, label: 'Ngày 02:00-22:00' },
        ],
      });

    assert.equal(resWrap.status, 201);
    // Trong kết quả trả về, khung 22:00-02:00 được tách thành 2 đoạn: [0, 120) và [1320, 1440)
    assert.equal(resWrap.body.periods.length, 3);

    const segEarly = resWrap.body.periods.find((p) => p.start_minute === 0 && p.end_minute === 120);
    const segLate = resWrap.body.periods.find((p) => p.start_minute === 1320 && p.end_minute === 1440);
    const segDay = resWrap.body.periods.find((p) => p.start_minute === 120 && p.end_minute === 1320);

    assert.ok(segEarly, 'Phải có đoạn 00:00-02:00 [0, 120)');
    assert.ok(segLate, 'Phải có đoạn 22:00-24:00 [1320, 1440)');
    assert.ok(segDay, 'Phải có đoạn 02:00-22:00 [120, 1320)');

    assert.equal(Number(segEarly.price_per_kwh_dong), 3000);
    assert.equal(Number(segLate.price_per_kwh_dong), 3000);
    assert.equal(segEarly.label, 'Đêm 22:00-02:00');
    assert.equal(segLate.label, 'Đêm 22:00-02:00');
  });
});
