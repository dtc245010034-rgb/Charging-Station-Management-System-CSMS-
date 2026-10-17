const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, bootChargePoint } = require('../helpers/server-process');

const CHARGE_POINT_CODE = 'S49-CONCURRENCY-CP';
const DRIVER_COUNT = 10;

describe('S-49: PostgreSQL ngăn đặt trùng đồng thời', { concurrency: false }, () => {
  let drivers;
  let competingConnectorId;
  let chargePoints;
  let server;

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('s49-owner@test.invalid', 'STATION_OWNER');
    drivers = await Promise.all(Array.from({ length: DRIVER_COUNT }, (_, index) => (
      createUser(`s49-driver-${index}@test.invalid`, 'DRIVER')
    )));
    const station = await postStation(owner, stationBody({ name: 'S-49 concurrency station' }));
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [station.body.id]);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
       VALUES ($1, 1, $2::date, 0, 0) RETURNING id`,
      [station.body.id, today]
    );
    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong)
       VALUES ($1, 0, 1440, 4000)`,
      [tariff.rows[0].id]
    );
    const connectorRows = [];
    for (const [pointIndex, pointCode] of [CHARGE_POINT_CODE, `${CHARGE_POINT_CODE}-2`].entries()) {
      const point = await query(
        "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id",
        [station.body.id, pointCode]
      );
      for (let connectorNo = 1; connectorNo <= 4; connectorNo += 1) {
        const connector = await query(
          `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
           VALUES ($1, $2, 'AVAILABLE', 'Available') RETURNING id`,
          [point.rows[0].id, connectorNo]
        );
        connectorRows.push({ id: connector.rows[0].id, pointIndex, connectorNo });
      }
    }
    competingConnectorId = connectorRows.find((row) => row.pointIndex === 0 && row.connectorNo === 1).id;
    for (const [index, driver] of drivers.entries()) {
      await query(
        "INSERT INTO id_tags (tag, user_id, status) VALUES ($1, $2, 'ACTIVE')",
        [`S49-TAG-${String(index).padStart(2, '0')}`, driver.id]
      );
      await withTransaction((client) => postEntry(client, {
        driverId: driver.id,
        entryType: 'TOPUP_MANUAL',
        amountDong: 100000,
        receiptCode: `S49-TOPUP-${index}-${Date.now()}`,
      }));
    }

    server = await startServerProcess();
    chargePoints = await Promise.all([
      bootChargePoint(server.wsUrl, CHARGE_POINT_CODE),
      bootChargePoint(server.wsUrl, `${CHARGE_POINT_CODE}-2`),
    ]);
    for (const point of chargePoints) point.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame[0] !== 2 || frame[2] !== 'ReserveNow') return;
      point.send(JSON.stringify([3, frame[1], { status: 'Accepted' }]));
    });
  });

  after(async () => {
    chargePoints?.forEach((point) => point.terminate());
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('H06: 10 yêu cầu đồng thời cho một connector có đúng một thành công và 9 CONNECTOR_RESERVED', async () => {
    const responses = await Promise.all(drivers.map((driver, index) => fetch(
      `http://127.0.0.1:${server.port}/api/reservations`,
      {
        method: 'POST',
        headers: {
          Cookie: driver.cookie,
          'Content-Type': 'application/json',
          'Idempotency-Key': `s49-concurrent-${index}-${Date.now()}`,
        },
        body: JSON.stringify({ connectorId: String(competingConnectorId), arriveInMinutes: 30 }),
      }
    ).then(async (response) => ({ status: response.status, body: await response.json() }))));

    const created = responses.filter((response) => response.status === 201);
    const conflicts = responses.filter((response) => response.status === 409);
    assert.equal(created.length, 1);
    assert.equal(conflicts.length, 9);
    for (const conflict of conflicts) {
      assert.equal(conflict.body.error.code, 'CONNECTOR_RESERVED');
      assert.equal(conflict.body.error.details.suggestions.length, 5);
      assert.ok(conflict.body.error.details.suggestions.every((item) => item.connectorId !== String(competingConnectorId)));
    }

    const held = await query("SELECT count(*)::int AS count FROM reservations WHERE status IN ('PENDING', 'ACCEPTED')");
    assert.equal(held.rows[0].count, 1);
  });
});
