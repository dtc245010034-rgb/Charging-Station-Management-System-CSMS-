const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { seedStation, seedSession } = require('../helpers/s22-seed');
const { ocppPool } = require('../../src/db/pool');
const { subscribe, publishSessionUpdateFromDb } = require('../../src/modules/sessions/sessions.events');

describe('S-22 G1: trụ gửi Wh thập phân hoặc đơn vị kWh/kW', () => {
  let server;
  let baseUrl;
  let driver;
  let station;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    driver = await createUser('so-thap-phan-driver@test.invalid', 'DRIVER');
    const owner = await createUser('so-thap-phan-owner@test.invalid', 'STATION_OWNER');
    station = await seedStation(owner.id, { code: 'CP-STP-01' });
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await ocppPool.end();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  beforeEach(async () => {
    await query('DELETE FROM charging_sessions');
  });

  const get = (path) => fetch(`${baseUrl}${path}`, { headers: { Cookie: driver.cookie } });
  const seed = (readings, extra = {}) => seedSession({
    chargePointId: station.chargePointId, connectorId: station.connectorId, driverId: driver.id, readings, ...extra,
  });

  for (const [label, value, unit, expectedKwh] of [
    ['Wh thập phân', '15500.5', 'Wh', 5.5005],
    ['kWh thập phân', '15.5', 'kWh', 5.5],
    ['kWh nguyên', '16', 'kWh', 6],
  ]) {
    it(`GET /me/sessions/current trả 200 và current_kwh đúng khi trụ gửi ${label}`, async () => {
      await seed([['Energy.Active.Import.Register', value, unit]]);
      const res = await get('/api/me/sessions/current');
      assert.equal(res.status, 200);
      assert.equal((await res.json()).current_kwh, expectedKwh);
    });

    it(`GET /sessions/:id trả 200 và current_kwh đúng khi trụ gửi ${label}`, async () => {
      const id = await seed([['Energy.Active.Import.Register', value, unit]]);
      const res = await get(`/api/sessions/${id}`);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).current_kwh, expectedKwh);
    });

    it(`SSE phát sự kiện (không im lặng) khi trụ gửi ${label}`, async () => {
      const id = await seed([['Energy.Active.Import.Register', value, unit]]);
      const events = [];
      const off = subscribe((event) => events.push(event));
      await publishSessionUpdateFromDb(id, { pool: ocppPool });
      off();
      assert.equal(events.length, 1);
      assert.equal(events[0].currentKwh, expectedKwh);
    });
  }

  it('N1: công suất 7.2 kW trả latest_power_w = 7200', async () => {
    await seed([['Power.Active.Import', '7.2', 'kW']]);
    const body = await (await get('/api/me/sessions/current')).json();
    assert.equal(body.latest_power_w, 7200);
  });

  it('công suất W thập phân giữ phần lẻ', async () => {
    await seed([['Power.Active.Import', '3680.5', 'W']]);
    const body = await (await get('/api/me/sessions/current')).json();
    assert.equal(body.latest_power_w, 3680.5);
  });
});
