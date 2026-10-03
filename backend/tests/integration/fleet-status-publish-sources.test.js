const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { pool } = require('../../src/db/pool');
const { subscribe } = require('../../src/modules/fleet-status/fleet-status.events');
const { markChargePointOffline, markAllChargePointsOffline } = require('../../src/modules/charge-points/presence');
const { createBootNotificationHandler } = require('../../src/modules/ocpp/handlers/boot-notification');

const CODE = 'SSE-SRC-CP-01';

describe('fleet-status: mọi thay đổi trạng thái trụ đều phát sự kiện SSE', () => {
  let ownerId;
  let stationId;
  let chargePointId;
  let events;
  let off;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('owner-sse-src@test.invalid', 'STATION_OWNER');
    ownerId = owner.id;
    stationId = (await postStation(owner, stationBody({ name: 'Station SSE' }))).body.id;
  });

  beforeEach(async () => {
    off?.();
    await query('DELETE FROM charge_points');
    chargePointId = (await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'ONLINE') RETURNING id", [stationId, CODE])).rows[0].id;
    await query("INSERT INTO connectors (charge_point_id, connector_no, status) VALUES ($1, 1, 'OCCUPIED')", [chargePointId]);
    events = [];
    off = subscribe((event) => events.push(event));
  });

  after(async () => {
    off?.();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  it('BootNotification được chấp nhận → phát sự kiện của trụ', async () => {
    const handler = createBootNotificationHandler({ pool, logInfo: () => {}, logError: () => {} });
    const result = await handler({ chargePointVendor: 'V', chargePointModel: 'M' }, { connection: { chargePointCode: CODE } });
    assert.strictEqual(result.status, 'Accepted');
    assert.deepEqual(events, [{ ownerId, stationId, chargePointId }]);
  });

  it('trụ mất kết nối (markChargePointOffline) → phát sự kiện của trụ', async () => {
    await markChargePointOffline(pool, CODE);
    assert.deepEqual(events, [{ ownerId, stationId, chargePointId }]);
  });

  it('trụ không tồn tại → không phát sự kiện', async () => {
    await markChargePointOffline(pool, 'KHONG-CO');
    assert.deepEqual(events, []);
  });

  it('dọn lúc khởi động/tắt máy (markAllChargePointsOffline) → phát sự kiện cho từng trụ đổi trạng thái', async () => {
    await markAllChargePointsOffline(pool);
    assert.deepEqual(events, [{ ownerId, stationId, chargePointId }]);
  });
});
