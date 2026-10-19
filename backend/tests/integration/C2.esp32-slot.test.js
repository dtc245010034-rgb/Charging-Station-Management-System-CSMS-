const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { once } = require('node:events');
const { run, query, resetSchema } = require('../helpers/db');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, bootChargePoint } = require('../helpers/server-process');

const CODE = 'ESP32-DEMO-01';
const TAG = 'TAG-ESP32-01';

// Mục D: seed chuẩn bị sẵn chỗ cắm cho trụ vật lý; kiểm bằng cách đóng vai thiết bị qua WebSocket với server thật.
describe('C2/D: chỗ cắm trụ vật lý ESP32 từ seed demo', () => {
  let server;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    const seeded = run('scripts/seed-demo.js', [], { ALLOW_DEMO_SEED: '1', DEMO_PASSWORD: 'DemoPass-2026-Ok' });
    assert.strictEqual(seeded.status, 0, seeded.stderr);
    server = await startServerProcess();
  });
  after(async () => {
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await resetSchema();
  });

  it('trụ ESP32-DEMO-01 có đúng 1 đầu nối số 1 và thẻ TAG-ESP32-01 hợp lệ trong DB', async () => {
    const connectors = (await query('SELECT c.connector_no FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = $1', [CODE])).rows;
    assert.deepEqual(connectors, [{ connector_no: 1 }]);
    const tag = (await query('SELECT status, expires_at FROM id_tags WHERE tag = $1', [TAG])).rows[0];
    assert.deepEqual({ status: tag.status, expires: tag.expires_at }, { status: 'ACTIVE', expires: null });
    assert.match(TAG, /^[A-Z0-9-]{1,20}$/);
  });

  it('thiết bị nối /ocpp/esp32-demo-01 (chữ thường) với ocpp1.6: Boot Accepted, Authorize Accepted, StartTransaction đầu nối 1 được nhận', async () => {
    const client = await bootChargePoint(server.wsUrl, CODE.toLowerCase());
    const auth = await sendCall(client, 'a1', 'Authorize', { idTag: TAG });
    assert.equal(auth[0], 3);
    assert.equal(auth[2].idTagInfo.status, 'Accepted');
    const start = await sendCall(client, 's1', 'StartTransaction', { connectorId: 1, idTag: TAG, meterStart: 0, timestamp: new Date().toISOString() });
    assert.equal(start[0], 3, JSON.stringify(start));
    assert.equal(start[2].idTagInfo.status, 'Accepted');
    assert.equal((await query("SELECT status FROM charge_points WHERE code = $1", [CODE])).rows[0].status, 'ONLINE');
    client.close();
  });

  it('StartTransaction với connectorId chưa khai báo (2) bị từ chối PropertyConstraintViolation', async () => {
    const client = await bootChargePoint(server.wsUrl, CODE);
    const start = await sendCall(client, 's2', 'StartTransaction', { connectorId: 2, idTag: TAG, meterStart: 0, timestamp: new Date().toISOString() });
    assert.equal(start[0], 4);
    assert.equal(start[2], 'PropertyConstraintViolation');
    client.close();
  });

  it('thiếu subprotocol ocpp1.6 bị từ chối bắt tay; mã trụ chưa đăng ký bị 403', async () => {
    const noProtocol = new WebSocket(`${server.wsUrl}/ocpp/${CODE}`);
    noProtocol.on('error', () => {});
    const [, response] = await Promise.race([once(noProtocol, 'unexpected-response'), once(noProtocol, 'open').then(() => { throw new Error('không được mở'); })]);
    assert.equal(response.statusCode, 400);
    const unknown = new WebSocket(`${server.wsUrl}/ocpp/KHONG-DANG-KY`, ['ocpp1.6']);
    unknown.on('error', () => {});
    const [, forbidden] = await once(unknown, 'unexpected-response');
    assert.equal(forbidden.statusCode, 403);
  });
});
