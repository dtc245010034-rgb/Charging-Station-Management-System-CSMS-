const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');

describe('S-47 tìm trạm gần', () => {
  let driver;
  const stations = [];

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('search-owner@example.com', 'STATION_OWNER');
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
});
