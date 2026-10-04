const http = require('node:http');
const { once } = require('node:events');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { WebSocket, WebSocketServer } = require('ws');

const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { pool } = require('../../src/db/pool');
const connections = require('../../src/modules/charge-points/connection-registry');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');
const { createBootNotificationHandler } = require('../../src/modules/ocpp/handlers/boot-notification');
const { registerOcppConnection } = require('../../src/modules/ocpp/ws-connection');

describe('F6: khoá trạm khi trụ treo (không trả close frame)', () => {
  let server;
  let wss;
  let wsUrl;
  let adminCookie;
  let stationId;
  const cpCode = 'F6-HUNG-CP-01';

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();

    const admin = await createUser('admin-f6@test.invalid', 'ADMIN');
    const owner = await createUser('owner-f6@test.invalid', 'STATION_OWNER');
    adminCookie = admin.cookie;
    stationId = (await postStation(owner, stationBody({ name: 'Station F6 Test' }))).body.id;
    await query('INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, $3)', [stationId, cpCode, 'UNKNOWN']);

    server = http.createServer();
    wss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => (protocols.has('ocpp1.6') ? 'ocpp1.6' : false),
    });
    const ocppMessages = createOcppMessageHandler({
      handlers: {
        BootNotification: createBootNotificationHandler({ pool, getHeartbeatInterval: () => 60 }),
      },
      updateLastSeen: async () => {},
    });
    server.on('upgrade', createOcppUpgradeHandler({
      wss,
      lookupChargePoint: async (code) => (await pool.query(
        'SELECT cp.id, cp.code, cp.station_id, s.status AS station_status FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.code = $1 LIMIT 1',
        [code]
      )).rows[0] || null,
    }));
    wss.on('connection', (ws, code) => {
      registerOcppConnection(ws, code, { connections, ocppMessages, pool, rateLimitMax: 50 });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    wsUrl = `ws://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    for (const client of wss?.clients ?? []) client.terminate();
    if (wss) await new Promise((r) => wss.close(r));
    if (server?.listening) await new Promise((r) => server.close(r));
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  it('trụ dừng đọc socket: DB về UNKNOWN trong tối đa 3 giây sau khi khoá trạm', async () => {
    const client = new WebSocket(`${wsUrl}/ocpp/${cpCode}`, ['ocpp1.6']);
    await once(client, 'open');
    const boot = new Promise((resolve) => client.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
    client.send(JSON.stringify([2, 'boot-f6', 'BootNotification', { chargePointVendor: 'VendorX', chargePointModel: 'ModelY' }]));
    assert.equal((await boot)[2].status, 'Accepted');
    assert.equal((await query('SELECT status FROM charge_points WHERE code = $1', [cpCode])).rows[0].status, 'ONLINE');

    client._socket.pause();

    const startedAt = Date.now();
    const lock = await request(app)
      .patch(`/api/admin/stations/${stationId}/lock`)
      .set('Cookie', adminCookie)
      .send({ locked: true });
    assert.equal(lock.status, 200);

    let status = 'ONLINE';
    while (Date.now() - startedAt < 3000 && status !== 'UNKNOWN') {
      await new Promise((r) => setTimeout(r, 100));
      status = (await query('SELECT status FROM charge_points WHERE code = $1', [cpCode])).rows[0].status;
    }
    const elapsed = Date.now() - startedAt;
    assert.equal(status, 'UNKNOWN', `DB vẫn ${status} sau ${elapsed} ms`);
    assert.equal(connections.isConnected(cpCode), false);
    client.terminate();
  });
});
