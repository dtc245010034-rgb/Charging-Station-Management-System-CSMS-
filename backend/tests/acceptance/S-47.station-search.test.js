const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const connections = require('../../src/modules/charge-points/connection-registry');

describe('S-47 tìm trạm gần', () => {
  let owner;
  let driver;
  const stations = [];
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('search-owner@example.com', 'STATION_OWNER');
    driver = await createUser('search-driver@example.com', 'DRIVER');
    const fixtures = [
      ['S1 Bến Thành', 10.7769, 106.7009],
      ['S2 Tân Bình', 10.8231, 106.6297],
      ['S3 Quận 5', 10.7626, 106.6602],
      ['S4 Thủ Đức', 10.8497, 106.7717],
    ];
    for (const [name, latitude, longitude] of fixtures) {
      const created = await postStation(owner, stationBody({ name, address: name, latitude, longitude }));
      assert.strictEqual(created.status, 201);
      const activated = await request(app).patch(`/api/stations/${created.body.id}`)
        .set('Cookie', owner.cookie).send({ status: 'ACTIVE' });
      assert.strictEqual(activated.status, 200);
      stations.push({ stationId: created.body.id, name });
    }
  });

  after(async () => { await resetSchema(); await closePool(); });

  it('H01: sắp trạm theo Haversine và trả khoảng cách làm tròn 0,1 km', async () => {
    const response = await request(app).post('/api/stations/search')
      .set('Cookie', driver.cookie).send({ lat: 10.7800, lng: 106.7000 });

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body.map((station) => station.name), [
      'S1 Bến Thành', 'S3 Quận 5', 'S2 Tân Bình', 'S4 Thủ Đức',
    ]);
    const expected = [0.4, 4.8, 9.1, 11.0];
    response.body.forEach((station, index) => {
      assert.ok(Math.abs(station.distanceKm - expected[index]) <= 0.05, `${station.name}: ${station.distanceKm} km`);
    });
  });

  it('H02: tìm không có vị trí theo q chỉ trả trạm khớp và distanceKm null', async () => {
    const response = await request(app).post('/api/stations/search')
      .set('Cookie', driver.cookie).send({ q: 'bến' });

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body.map((station) => station.name), ['S1 Bến Thành']);
    assert.strictEqual(response.body[0].distanceKm, null);
    assert.strictEqual(response.body[0].price, null);
  });

  it('q và tọa độ: từ chối biên sai, escape wildcard và yêu cầu đủ cặp lat/lng', async () => {
    for (const body of [
      { q: 'b' },
      { q: 'x'.repeat(101) },
      { lat: 91, lng: 106.7 },
      { lat: 10.78 },
    ]) {
      assert.strictEqual((await request(app).post('/api/stations/search')
        .set('Cookie', driver.cookie).send(body)).status, 400);
    }
    for (const q of ['%%', '__']) {
      const response = await request(app).post('/api/stations/search')
        .set('Cookie', driver.cookie).send({ q });
      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.body, []);
    }
  });

  it('H03: đếm Available chỉ khi trụ trực tuyến và trả loại đầu nối cùng biểu giá hiện tại', async () => {
    const stationId = stations[0].stationId;
    const chargePoint = await request(app).post(`/api/stations/${stationId}/charge-points`)
      .set('Cookie', owner.cookie).send({ code: 'CP-H03', connector_count: 4 });
    assert.strictEqual(chargePoint.status, 201);
    await query(
      `UPDATE connectors
       SET ocpp_status = CASE connector_no
         WHEN 1 THEN 'Available'
         WHEN 2 THEN 'Available'
         WHEN 3 THEN 'Charging'
         ELSE 'Faulted'
       END
       WHERE charge_point_id = $1`,
      [chargePoint.body.id]
    );
    const tariff = await request(app).post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: todayStr,
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 4000, label: 'Cả ngày' }],
        idle: { graceMin: 15, perMinDong: 1000 },
      });
    assert.strictEqual(tariff.status, 201);

    connections.connect('CP-H03');
    try {
      const response = await request(app).post('/api/stations/search')
        .set('Cookie', driver.cookie).send({ lat: 10.78, lng: 106.7 });
      assert.strictEqual(response.status, 200);
      const result = response.body.find((station) => station.name === 'S1 Bến Thành');
      assert.ok(result, JSON.stringify(response.body));
      assert.deepStrictEqual(result.connectors, { free: 2, total: 4, types: ['TYPE_2'] });
      assert.deepStrictEqual(result.price, { pricePerKwh: '4000', periodLabel: 'Cả ngày' });
      assert.deepStrictEqual(result.idleFee, { graceMin: 15, perMinDong: '1000' });
      const filtered = await request(app).post('/api/stations/search')
        .set('Cookie', driver.cookie).send({ lat: 10.78, lng: 106.7, connectorType: 'type_2' });
      assert.ok(filtered.body.some((station) => station.name === 'S1 Bến Thành'));
      const unmatched = await request(app).post('/api/stations/search')
        .set('Cookie', driver.cookie).send({ lat: 10.78, lng: 106.7, connectorType: 'CCS' });
      assert.deepStrictEqual(unmatched.body, []);
    } finally {
      connections.disconnect('CP-H03');
    }
  });
});
