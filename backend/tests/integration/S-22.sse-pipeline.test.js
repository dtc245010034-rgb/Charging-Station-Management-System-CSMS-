const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { seedStation, seedSession, waitFor } = require('../helpers/s22-seed');
const { ocppPool } = require('../../src/db/pool');
const { subscribe } = require('../../src/modules/sessions/sessions.events');
const { createStartTransactionHandler } = require('../../src/modules/ocpp/handlers/start-transaction');
const { createMeterValuesHandler } = require('../../src/modules/ocpp/handlers/meter-values');
const { createStopTransactionHandler } = require('../../src/modules/ocpp/handlers/stop-transaction');

const quiet = { logInfo() {}, logWarning() {}, logError() {} };

describe('S-22: luồng OCPP → SSE/API bằng handler thật', () => {
  let server;
  let baseUrl;
  let driver1;
  let driver2;
  let station;
  let connection;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    driver1 = await createUser('pipeline-d1@test.invalid', 'DRIVER');
    driver2 = await createUser('pipeline-d2@test.invalid', 'DRIVER');
    const owner = await createUser('pipeline-owner@test.invalid', 'STATION_OWNER');
    station = await seedStation(owner.id, { code: 'CP-PL-01', idTag: 'PLTAG2', idTagUserId: driver2.id });
    connection = { connection: { chargePoint: { id: station.chargePointId, code: station.code } } };
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

  const startTransaction = (meterStart) => createStartTransactionHandler({ pool: ocppPool, ...quiet })(
    { connectorId: 1, idTag: 'PLTAG2', meterStart, timestamp: new Date().toISOString() },
    connection
  );

  const listen = (driver, bucket) => subscribe((event) => bucket.push(event), { driverId: driver.id });

  it('G5: phiên cũ bị đóng ABNORMAL → tài xế cũ nhận ABNORMAL, tài xế mới nhận CHARGING, không lẫn', async () => {
    const oldId = await seedSession({
      chargePointId: station.chargePointId, connectorId: station.connectorId, driverId: driver1.id,
    });
    const seen1 = [];
    const seen2 = [];
    const offs = [listen(driver1, seen1), listen(driver2, seen2)];
    try {
      const response = await startTransaction(20000);
      assert.equal(response.idTagInfo.status, 'Accepted');

      const old = await query('SELECT status FROM charging_sessions WHERE id = $1', [oldId]);
      assert.equal(old.rows[0].status, 'ABNORMAL');

      assert.ok(await waitFor(() => seen1.length >= 1 && seen2.length >= 1), 'cả hai tài xế phải nhận sự kiện');
    } finally {
      offs.forEach((off) => off());
    }
    assert.ok(seen1.some((e) => e.sessionId === oldId && e.status === 'ABNORMAL'));
    assert.ok(seen1.every((e) => String(e.driverId) === String(driver1.id)));
    assert.ok(seen2.some((e) => e.sessionId !== oldId && e.status === 'CHARGING'));
    assert.ok(seen2.every((e) => String(e.driverId) === String(driver2.id)));
  });

  it('MeterValues Wh thập phân + kW + SoC → API và SSE cùng cho 5.5005 kWh, 3680 W, 55 %', async () => {
    const { transactionId } = await startTransaction(10000);
    const seen = [];
    const off = listen(driver2, seen);
    try {
      await createMeterValuesHandler({ pool: ocppPool, ...quiet })({
        connectorId: 1,
        transactionId,
        meterValue: [{
          timestamp: new Date().toISOString(),
          sampledValue: [
            { measurand: 'Energy.Active.Import.Register', value: '15500.5', unit: 'Wh' },
            { measurand: 'Power.Active.Import', value: '3.68', unit: 'kW' },
            { measurand: 'SoC', value: '55', unit: 'Percent' },
          ],
        }],
      }, connection);
      assert.ok(await waitFor(() => seen.some((e) => e.latestSoc === 55)), 'SSE phải có số liệu mới');
    } finally {
      off();
    }
    const event = seen.find((e) => e.latestSoc === 55);
    assert.equal(event.currentKwh, 5.5005);
    assert.equal(event.latestPowerW, 3680);

    const res = await fetch(`${baseUrl}/api/me/sessions/current`, { headers: { Cookie: driver2.cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.current_kwh, 5.5005);
    assert.equal(body.latest_power_w, 3680);
    assert.equal(body.latest_soc, 55);
  });

  it('StopTransaction → tài xế nhận sự kiện COMPLETED mang sẵn kWh cuối', async () => {
    const { transactionId } = await startTransaction(5000);
    const seen = [];
    const off = listen(driver2, seen);
    try {
      await createStopTransactionHandler({ pool: ocppPool, ...quiet })({
        transactionId, meterStop: 25000, timestamp: new Date().toISOString(), reason: 'Local',
      }, connection);
      assert.ok(await waitFor(() => seen.some((e) => e.status === 'COMPLETED')));
    } finally {
      off();
    }
    const done = seen.find((e) => e.status === 'COMPLETED');
    assert.equal(done.type, 'session_stopped');
    assert.equal(done.session.current_kwh, 20);
  });
});
