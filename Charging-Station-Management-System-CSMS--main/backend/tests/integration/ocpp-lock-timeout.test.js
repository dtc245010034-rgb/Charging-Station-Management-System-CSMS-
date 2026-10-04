const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { closePool } = require('../helpers/app');
const { BASE, query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, bootChargePoint } = require('../helpers/server-process');

const CODE = 'F10-SRV-CP-01';
const LOCK_TIMEOUT_SECONDS = 5;

describe('F10: khoá hàng connectors giữ lâu không làm StatusNotification treo vô hạn', () => {
  let server;
  let locker;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('owner-f10@test.invalid', 'STATION_OWNER');
    const stationId = (await postStation(owner, stationBody({ name: 'Station F10' }))).body.id;
    const cp = await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id", [stationId, CODE]);
    await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1)', [cp.rows[0].id]);
    server = await startServerProcess({ OCPP_LOCK_TIMEOUT_SECONDS: String(LOCK_TIMEOUT_SECONDS) });
  });

  after(async () => {
    await locker?.end().catch(() => {});
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  it('khoá 8 giây: StatusNotification trả InternalError trong timeout + 1 giây, Heartbeat < 100 ms, hết khoá thì xử lý bình thường', { timeout: 30000 }, async () => {
    const client = await bootChargePoint(server.wsUrl, CODE);
    locker = new Client({ connectionString: BASE });
    await locker.connect();
    await locker.query('BEGIN');
    await locker.query('SELECT 1 FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = $1 FOR UPDATE OF c', [CODE]);
    const lockedAt = Date.now();

    const pending = sendCall(client, 'busy-1', 'StatusNotification', { connectorId: 1, status: 'Charging', errorCode: 'NoError' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const beatStart = Date.now();
    const beat = await sendCall(client, 'hb-busy', 'Heartbeat', {});
    const beatMs = Date.now() - beatStart;
    assert.equal(beat[0], 3);
    assert.ok(beatMs < 100, `Heartbeat mất ${beatMs} ms`);

    const reply = await pending;
    const waitedMs = Date.now() - lockedAt;
    assert.equal(reply[0], 4);
    assert.equal(reply[2], 'InternalError');
    assert.ok(waitedMs >= LOCK_TIMEOUT_SECONDS * 1000 - 300, `trả quá sớm: ${waitedMs} ms`);
    assert.ok(waitedMs <= (LOCK_TIMEOUT_SECONDS + 1) * 1000, `trả quá muộn: ${waitedMs} ms`);
    assert.ok(!JSON.stringify(reply).toLowerCase().includes('lock'), JSON.stringify(reply));

    const waitLeft = 8000 - (Date.now() - lockedAt);
    if (waitLeft > 0) await new Promise((resolve) => setTimeout(resolve, waitLeft));
    await locker.query('ROLLBACK');
    const ok = await sendCall(client, 'after-release', 'StatusNotification', { connectorId: 1, status: 'Charging', errorCode: 'NoError' });
    assert.equal(ok[0], 3);
    assert.equal((await query("SELECT c.ocpp_status FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = $1", [CODE])).rows[0].ocpp_status, 'Charging');
    client.terminate();
  });
});
