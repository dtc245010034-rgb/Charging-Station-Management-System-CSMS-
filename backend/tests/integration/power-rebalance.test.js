const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { createPowerRebalancer } = require('../../src/modules/power/rebalance');

describe('rebalanceStation with persisted sessions and a simulated charge point', () => {
  let stationId;
  let sessionIds;
  let rebalancer;
  const sentProfiles = [];

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('rebalance-owner@test.invalid', 'STATION_OWNER');
    stationId = (await postStation(owner, stationBody({
      name: 'Power Rebalance Station',
      power_limit_kw: 22,
    }))).body.id;

    const sessionData = [
      { code: 'REBALANCE-001', ratedW: 7400 },
      { code: 'REBALANCE-002', ratedW: 11000 },
      { code: 'REBALANCE-003', ratedW: 22000 },
    ];
    sessionIds = [];
    for (const [index, item] of sessionData.entries()) {
      const point = await query(
        'INSERT INTO charge_points (station_id, code, power_kw) VALUES ($1, $2, $3) RETURNING id',
        [stationId, item.code, item.ratedW / 1000]
      );
      const connector = await query(
        `INSERT INTO connectors (charge_point_id, connector_no, rated_power_w, status, ocpp_status)
         VALUES ($1, 1, $2, 'OCCUPIED', 'Charging') RETURNING id`,
        [point.rows[0].id, item.ratedW]
      );
      const session = await query(
        `INSERT INTO charging_sessions (
           charge_point_id, connector_id, connector_no, id_tag_masked, meter_start, started_at, status
         ) VALUES ($1, $2, 1, $3, 1000, CURRENT_TIMESTAMP, 'CHARGING') RETURNING id`,
        [point.rows[0].id, connector.rows[0].id, `MASKED-${index + 1}`]
      );
      sessionIds.push(session.rows[0].id);
    }

    rebalancer = createPowerRebalancer({
      pool,
      commandSender: {
        async send(code, action, payload) {
          sentProfiles.push({ code, action, payload });
          return { status: 'Accepted' };
        },
      },
    });
  });

  after(async () => {
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('allocates three real active sessions under the station cap and persists accepted profiles', async () => {
    const result = await rebalancer.rebalanceStation(stationId, { reason: 'START_TRANSACTION' });

    assert.deepStrictEqual(result.sessions.map(({ sessionId, limitW, status }) => [sessionId, limitW, status]), [
      [String(sessionIds[0]), 7300, 'ACCEPTED'],
      [String(sessionIds[1]), 7300, 'ACCEPTED'],
      [String(sessionIds[2]), 7400, 'ACCEPTED'],
    ]);
    assert.ok(result.sessions.reduce((sum, session) => sum + session.limitW, 0) <= 22000);
    assert.strictEqual(sentProfiles.length, 3);
    assert.deepStrictEqual(sentProfiles.map(({ code, action }) => [code, action]), [
      ['REBALANCE-001', 'SetChargingProfile'],
      ['REBALANCE-002', 'SetChargingProfile'],
      ['REBALANCE-003', 'SetChargingProfile'],
    ]);

    const logs = await query(
      `SELECT session_id::text, limit_w, status, trigger
       FROM charging_profile_log WHERE station_id = $1 ORDER BY session_id`,
      [stationId]
    );
    assert.deepStrictEqual(logs.rows, [
      { session_id: String(sessionIds[0]), limit_w: 7300, status: 'ACCEPTED', trigger: 'START_TRANSACTION' },
      { session_id: String(sessionIds[1]), limit_w: 7300, status: 'ACCEPTED', trigger: 'START_TRANSACTION' },
      { session_id: String(sessionIds[2]), limit_w: 7400, status: 'ACCEPTED', trigger: 'START_TRANSACTION' },
    ]);
  });
});
