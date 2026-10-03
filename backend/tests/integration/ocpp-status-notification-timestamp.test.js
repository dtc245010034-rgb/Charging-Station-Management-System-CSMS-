const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { pool } = require('../../src/db/pool');
const { createStatusNotificationHandler } = require('../../src/modules/ocpp/handlers/status-notification');

const CODE = 'TS-CLAMP-CP-01';
const connection = { chargePointCode: CODE };
const HOUR = 3600 * 1000;

describe('StatusNotification: timestamp của trụ chỉ được tin trong khoảng hợp lý', () => {
  let connectorId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('owner-ts@test.invalid', 'STATION_OWNER');
    const stationId = (await postStation(owner, stationBody({ name: 'Station TS' }))).body.id;
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
  });

  const handler = () => createStatusNotificationHandler({ pool, errorDedupSeconds: 0, logWarning: () => {}, logError: () => {} });
  const send = (timestamp) => handler()({ connectorId: 1, status: 'Faulted', errorCode: 'GroundFailure', timestamp }, { connection });
  const row = async () => (await query(
    'SELECT occurred_at, abs(extract(epoch FROM (occurred_at - CURRENT_TIMESTAMP))) AS skew FROM connector_errors WHERE connector_id = $1', [connectorId]
  )).rows;

  it('timestamp trong ±24 giờ được giữ nguyên', async () => {
    const at = new Date(Date.now() - 2 * HOUR);
    assert.deepEqual(await send(at.toISOString()), {});
    const rows = await row();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].occurred_at.getTime(), at.getTime());
  });

  for (const [name, timestamp] of [
    ['năm 1970', '1970-01-01T00:00:00Z'],
    ['năm 2099', '2099-01-01T00:00:00Z'],
    ['cực đại của Date (năm 275760)', '+275760-09-13T00:00:00.000Z'],
    ['cực tiểu của Date (năm -271821)', '-271821-04-20T00:00:00.000Z'],
    ['lệch 3 ngày về sau', new Date(Date.now() + 72 * HOUR).toISOString()],
  ]) {
    it(`timestamp ${name}: vẫn Accepted, dòng lỗi dùng giờ máy chủ`, async () => {
      assert.deepEqual(await send(timestamp), {});
      const rows = await row();
      assert.equal(rows.length, 1);
      assert.ok(Number(rows[0].skew) < 5, `occurred_at phải là giờ máy chủ, lệch ${rows[0].skew}s`);
    });
  }
});
