const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { pool } = require('../../src/db/pool');
const { subscribe } = require('../../src/modules/fleet-status/fleet-status.events');
const { createStatusNotificationHandler } = require('../../src/modules/ocpp/handlers/status-notification');

const CODE = 'F5-STATION-CP-01';
const connection = { chargePointCode: CODE };

describe('F5/#17: StatusNotification connectorId = 0 lưu trạng thái cả trụ', () => {
  let owner;
  let chargePointId;
  let connectorId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('owner-f5@test.invalid', 'STATION_OWNER');
    const stationId = (await postStation(owner, stationBody({ name: 'Station F5' }))).body.id;
    const cp = await query('INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, $3) RETURNING id', [stationId, CODE, 'ONLINE']);
    chargePointId = cp.rows[0].id;
    connectorId = (await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id', [chargePointId])).rows[0].id;
  });

  after(async () => {
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  beforeEach(async () => {
    await query('DELETE FROM connector_errors');
    await query('UPDATE charge_points SET ocpp_status = NULL, last_error_code = NULL, status_updated_at = NULL WHERE id = $1', [chargePointId]);
    await query("UPDATE connectors SET status = 'UNKNOWN', ocpp_status = NULL WHERE id = $1", [connectorId]);
  });

  // Một handler dùng chung như ở server thật: hàng đợi tuần tự theo trụ nằm trong instance.
  const handler = createStatusNotificationHandler({ pool, errorDedupSeconds: 60, logWarning: () => {}, logError: () => {} });
  const send = (payload) => handler({ connectorId: 0, ...payload }, { connection });
  const cpRow = async () => (await query('SELECT status, ocpp_status, last_error_code, status_updated_at FROM charge_points WHERE id = $1', [chargePointId])).rows[0];
  const stationErrors = async () => (await query('SELECT connector_id, charge_point_id, error_code, vendor_error_code FROM connector_errors WHERE charge_point_id = $1 ORDER BY id', [chargePointId])).rows;

  it('Available mức trụ: lưu ocpp_status + status_updated_at, không đụng đầu nối, không tạo dòng lỗi, trạng thái trụ vẫn ONLINE', async () => {
    assert.deepEqual(await send({ status: 'Available', errorCode: 'NoError' }), {});
    const row = await cpRow();
    assert.equal(row.ocpp_status, 'Available');
    assert.equal(row.last_error_code, null);
    assert.ok(row.status_updated_at instanceof Date);
    assert.equal(row.status, 'ONLINE');
    assert.equal((await query('SELECT status, ocpp_status FROM connectors WHERE id = $1', [connectorId])).rows[0].ocpp_status, null);
    assert.equal((await stationErrors()).length, 0);
  });

  it('Faulted + GroundFailure: lưu last_error_code và đúng 1 dòng connector_errors gắn charge_point_id (connector_id NULL)', async () => {
    await send({ status: 'Faulted', errorCode: 'GroundFailure', vendorErrorCode: 'V-77' });
    const row = await cpRow();
    assert.equal(row.ocpp_status, 'Faulted');
    assert.equal(row.last_error_code, 'GroundFailure');
    assert.deepEqual(await stationErrors(), [{ connector_id: null, charge_point_id: chargePointId, error_code: 'GroundFailure', vendor_error_code: 'V-77' }]);
  });

  it('30 tin Faulted y hệt chỉ ra 1 dòng; NoError sau đó xoá last_error_code; lỗi lại sau Available ra dòng mới', async () => {
    await Promise.all(Array.from({ length: 30 }, () => send({ status: 'Faulted', errorCode: 'GroundFailure' })));
    assert.equal((await stationErrors()).length, 1);
    await send({ status: 'Available', errorCode: 'NoError' });
    assert.equal((await cpRow()).last_error_code, null);
    await send({ status: 'Faulted', errorCode: 'GroundFailure' });
    assert.equal((await stationErrors()).length, 2);
  });

  it('errorCode ngoài danh sách OCPP: lưu OtherError, giữ nguyên văn ở vendor_error_code', async () => {
    await send({ status: 'Faulted', errorCode: 'MyCustomFault' });
    assert.equal((await cpRow()).last_error_code, 'OtherError');
    assert.deepEqual((await stationErrors()).map((r) => [r.error_code, r.vendor_error_code]), [['OtherError', 'MyCustomFault']]);
  });

  it('thay đổi trạng thái mức trụ phát sự kiện SSE mức trụ (không có connectorId); tin lặp không phát lại', async () => {
    const events = [];
    const unsubscribe = subscribe((event) => events.push(event));
    await send({ status: 'Faulted', errorCode: 'GroundFailure' });
    await send({ status: 'Faulted', errorCode: 'GroundFailure' });
    unsubscribe();
    assert.equal(events.length, 1);
    assert.equal(events[0].chargePointId, chargePointId);
    assert.equal(events[0].connectorId, undefined);
  });

  it('GET /api/fleet-status trả ocpp_status, last_error_code của trụ', async () => {
    await send({ status: 'Faulted', errorCode: 'GroundFailure' });
    const response = await request(app).get('/api/fleet-status').set('Cookie', owner.cookie);
    assert.equal(response.status, 200);
    const point = response.body.stations.flatMap((station) => station.charge_points).find((cp) => cp.id === chargePointId);
    assert.equal(point.ocpp_status, 'Faulted');
    assert.equal(point.last_error_code, 'GroundFailure');
  });
});
