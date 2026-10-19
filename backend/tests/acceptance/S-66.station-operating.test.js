const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, bootChargePoint, sendCall } = require('../helpers/server-process');

const CHARGE_POINT_CODE = 'S66-OPERATING-CP';
const ID_TAG = 'S66-TAG-01';

describe('S-66: trạng thái trạm chặn phiên mới nhưng không cắt phiên đang chạy', { concurrency: false }, () => {
  let owner;
  let driver;
  let stationId;
  let connectorIds;
  let server;
  let client;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

  async function startTransaction(messageId, connectorId) {
    return sendCall(client, messageId, 'StartTransaction', {
      connectorId,
      idTag: ID_TAG,
      meterStart: 12000,
      timestamp: new Date().toISOString(),
    });
  }

  async function waitForInvoice(sessionId) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await query('SELECT total_dong::text FROM session_invoices WHERE session_id = $1', [sessionId]);
      if (result.rowCount) return result.rows[0].total_dong;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Invoice not finalized for session ${sessionId}`);
  }

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('s66-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('s66-driver@test.invalid', 'DRIVER');
    const station = await postStation(owner, stationBody({ name: 'S-66 operating station' }));
    stationId = station.body.id;
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [stationId]);
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
       VALUES ($1, 1, $2::date, 0, 0) RETURNING id`,
      [stationId, today]
    );
    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong)
       VALUES ($1, 0, 1440, 4000)`,
      [tariff.rows[0].id]
    );
    const chargePoint = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id",
      [stationId, CHARGE_POINT_CODE]
    );
    const connectors = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
       VALUES ($1, 1, 'AVAILABLE', 'Available'), ($1, 2, 'AVAILABLE', 'Available') RETURNING id, connector_no`,
      [chargePoint.rows[0].id]
    );
    connectorIds = connectors.rows.sort((left, right) => left.connector_no - right.connector_no).map((row) => row.id);
    await query("INSERT INTO id_tags (tag, user_id, status) VALUES ($1, $2, 'ACTIVE')", [ID_TAG, driver.id]);
    await withTransaction((clientDb) => postEntry(clientDb, {
      driverId: driver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 100000,
      receiptCode: `S66-TOPUP-${Date.now()}`,
    }));
    server = await startServerProcess();
    client = await bootChargePoint(server.wsUrl, CHARGE_POINT_CODE);
  });

  after(async () => {
    client?.terminate();
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('H04: MAINTENANCE ẩn tìm kiếm, chặn Authorize/StartTransaction/RemoteStart, StopTransaction vẫn lập hóa đơn', async () => {
    const activeStart = await startTransaction('s66-active-start', 1);
    assert.equal(activeStart[0], 3);
    assert.equal(activeStart[2].idTagInfo.status, 'Accepted');
    const activeSessionId = activeStart[2].transactionId;

    await query("UPDATE stations SET status = 'MAINTENANCE' WHERE id = $1", [stationId]);
    const search = await fetch(`http://127.0.0.1:${server.port}/api/stations/search`, {
      method: 'POST',
      headers: { Cookie: driver.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 10.78, lng: 106.7 }),
    });
    assert.equal(search.status, 200);
    assert.deepEqual((await search.json()).map((station) => station.stationId), []);

    const authorize = await sendCall(client, 's66-maintenance-authorize', 'Authorize', { idTag: ID_TAG });
    assert.equal(authorize[0], 3);
    assert.equal(authorize[2].idTagInfo.status, 'Blocked');

    const blockedStart = await startTransaction('s66-maintenance-start', 2);
    assert.equal(blockedStart[0], 3);
    assert.equal(blockedStart[2].idTagInfo.status, 'Blocked');

    const remoteStart = await fetch(`http://127.0.0.1:${server.port}/api/connectors/${connectorIds[1]}/start`, {
      method: 'POST',
      headers: { Cookie: driver.cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(remoteStart.status, 409);
    assert.equal((await remoteStart.json()).error.code, 'STATION_NOT_ACTIVE');

    const stop = await sendCall(client, 's66-maintenance-stop', 'StopTransaction', {
      transactionId: activeSessionId,
      meterStop: 22000,
      timestamp: new Date().toISOString(),
      reason: 'Local',
    });
    assert.equal(stop[0], 3);
    assert.equal(await waitForInvoice(activeSessionId), '40000');
    const session = await query('SELECT status FROM charging_sessions WHERE id = $1', [activeSessionId]);
    assert.equal(session.rows[0].status, 'COMPLETED');
  });
});
