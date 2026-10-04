const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, bootChargePoint } = require('../helpers/server-process');

const CODE = 'F9-SRV-CP-01';

describe('F9 trên server thật: Heartbeat sau khi quá hạn phục hồi đầu nối', () => {
  let server;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('owner-f9s@test.invalid', 'STATION_OWNER');
    const stationId = (await postStation(owner, stationBody({ name: 'Station F9' }))).body.id;
    const cp = await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id", [stationId, CODE]);
    await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1)', [cp.rows[0].id]);
    server = await startServerProcess();
  });

  after(async () => {
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  it('Charging → job đánh dấu OFFLINE/UNKNOWN → Heartbeat → ONLINE và OCCUPIED', async () => {
    const client = await bootChargePoint(server.wsUrl, CODE);
    await sendCall(client, 's1', 'StatusNotification', { connectorId: 1, status: 'Charging', errorCode: 'NoError' });
    await query("UPDATE charge_points SET status = 'OFFLINE' WHERE code = $1", [CODE]);
    await query("UPDATE connectors SET status = 'UNKNOWN'");
    const beat = await sendCall(client, 'hb1', 'Heartbeat', {});
    assert.equal(beat[0], 3);
    const row = (await query(
      'SELECT cp.status AS cp_status, c.status, c.ocpp_status FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = $1',
      [CODE]
    )).rows[0];
    assert.deepEqual(row, { cp_status: 'ONLINE', status: 'OCCUPIED', ocpp_status: 'Charging' });
    client.terminate();
  });
});
