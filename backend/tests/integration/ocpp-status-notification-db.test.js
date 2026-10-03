const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { pool } = require('../../src/db/pool');
const { createStatusNotificationHandler } = require('../../src/modules/ocpp/handlers/status-notification');

const CODE = 'F1-DEDUP-CP-01';
const connection = { chargePointCode: CODE };

describe('F1: khử trùng connector_errors trên Postgres thật', () => {
  let connectorId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('owner-f1@test.invalid', 'STATION_OWNER');
    const stationId = (await postStation(owner, stationBody({ name: 'Station F1' }))).body.id;
    const cp = await query('INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, $3) RETURNING id', [stationId, CODE, 'ONLINE']);
    connectorId = (await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id', [cp.rows[0].id])).rows[0].id;
  });

  after(async () => {
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  beforeEach(async () => {
    await query('DELETE FROM connector_errors');
    await query("UPDATE connectors SET status = 'UNKNOWN', ocpp_status = NULL WHERE id = $1", [connectorId]);
  });

  const errorRows = async () => (await query('SELECT error_code, vendor_error_code FROM connector_errors WHERE connector_id = $1 ORDER BY id', [connectorId])).rows;
  const faulted = (extra = {}) => ({ connectorId: 1, status: 'Faulted', errorCode: 'GroundFailure', ...extra });

  it('30 tin Faulted y hệt gửi đồng thời chỉ tạo 1 dòng', async () => {
    const handler = createStatusNotificationHandler({ pool, errorDedupSeconds: 60 });
    await Promise.all(Array.from({ length: 30 }, () => handler(faulted(), { connection })));
    assert.equal((await errorRows()).length, 1);
  });

  it('30 tin Faulted y hệt gửi tuần tự chỉ tạo 1 dòng', async () => {
    const handler = createStatusNotificationHandler({ pool, errorDedupSeconds: 60 });
    for (let index = 0; index < 30; index += 1) await handler(faulted(), { connection });
    assert.equal((await errorRows()).length, 1);
  });

  it('Faulted → Available → Faulted vẫn ghi dòng mới', async () => {
    const handler = createStatusNotificationHandler({ pool, errorDedupSeconds: 60 });
    await handler(faulted(), { connection });
    await handler({ connectorId: 1, status: 'Available', errorCode: 'NoError' }, { connection });
    await handler(faulted(), { connection });
    assert.equal((await errorRows()).length, 2);
  });

  it('vendorErrorCode khác nhau là hai lỗi khác nhau', async () => {
    const handler = createStatusNotificationHandler({ pool, errorDedupSeconds: 60 });
    await handler(faulted({ vendorErrorCode: 'A' }), { connection });
    await handler(faulted({ vendorErrorCode: 'B' }), { connection });
    await handler(faulted({ vendorErrorCode: 'B' }), { connection });
    assert.deepEqual((await errorRows()).map((row) => row.vendor_error_code), ['A', 'B']);
  });

  it('hết cửa sổ khử trùng thì ghi lại; cửa sổ 0 giây tắt khử trùng', async () => {
    const handler = createStatusNotificationHandler({ pool, errorDedupSeconds: 1 });
    await handler(faulted(), { connection });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await handler(faulted(), { connection });
    assert.equal((await errorRows()).length, 2);

    await query('DELETE FROM connector_errors');
    const noDedup = createStatusNotificationHandler({ pool, errorDedupSeconds: 0 });
    await noDedup(faulted(), { connection });
    await noDedup(faulted(), { connection });
    assert.equal((await errorRows()).length, 2);
  });

  it('status lạ chứa ký tự NUL không làm sập luồng và được lưu đã làm sạch', async () => {
    const handler = createStatusNotificationHandler({ pool, logWarning: () => {} });
    await handler({ connectorId: 1, status: 'Vendor\u0000State' }, { connection });
    const row = (await query('SELECT status, ocpp_status FROM connectors WHERE id = $1', [connectorId])).rows[0];
    assert.deepEqual(row, { status: 'ERROR', ocpp_status: 'VendorState' });
  });

  it('Unavailable lưu UNAVAILABLE', async () => {
    const handler = createStatusNotificationHandler({ pool });
    await handler({ connectorId: 1, status: 'Unavailable' }, { connection });
    const row = (await query('SELECT status, ocpp_status FROM connectors WHERE id = $1', [connectorId])).rows[0];
    assert.deepEqual(row, { status: 'UNAVAILABLE', ocpp_status: 'Unavailable' });
  });
});
