const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, bootChargePoint } = require('../helpers/server-process');

const CODE = 'K01-SRV-CP-01';

describe('S-14 trên server thật: dedupe bền vững và job dọn tin cũ', () => {
  let server;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('owner-k01@test.invalid', 'STATION_OWNER');
    const stationId = (await postStation(owner, stationBody({ name: 'Station K01' }))).body.id;
    await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN')", [stationId, CODE]);
  });

  after(async () => {
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  it('gửi lại Heartbeat nhận đúng response cũ mà không chạy handler lần hai', async () => {
    server = await startServerProcess();
    const client = await bootChargePoint(server.wsUrl, CODE);
    const first = await sendCall(client, 'hb-fixed-1', 'Heartbeat', {});
    const second = await sendCall(client, 'hb-fixed-1', 'Heartbeat', {});
    assert.equal(first[0], 3);
    assert.equal(second[0], 3);
    assert.deepEqual(second, first);
    const stored = (await query("SELECT count(*)::int AS n FROM ocpp_messages WHERE message_id = 'hb-fixed-1'")).rows[0].n;
    assert.equal(stored, 1);
    client.terminate();
  });

  it('khi khởi động, tin cũ hơn thời hạn lưu bị dọn', async () => {
    await stopServerProcess(server);
    await query("INSERT INTO ocpp_messages (charge_point_id, message_id, action, payload_hash, response, created_at) SELECT id, 'ancient', 'Heartbeat', 'h', '{}', CURRENT_TIMESTAMP - interval '30 days' FROM charge_points WHERE code = $1", [CODE]);
    server = await startServerProcess({ OCPP_MESSAGE_RETENTION_DAYS: '7' });
    const left = (await query("SELECT count(*)::int AS n FROM ocpp_messages WHERE message_id = 'ancient'")).rows[0].n;
    assert.equal(left, 0);
  });
});
