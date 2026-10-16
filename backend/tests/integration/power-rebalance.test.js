const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { pool } = require('../../src/db/pool');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { createPowerRebalancer } = require('../../src/modules/power/rebalance');
const { processDuePowerProfiles } = require('../../src/modules/power/profile-retry-job');
const { createPowerProfileOutcomeHandler } = require('../../src/modules/power/profile-outcomes');

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

  it('atomically retries due profiles once and creates one critical alert after the final retry', async () => {
    for (const sessionId of sessionIds) {
      await query('DELETE FROM charging_profile_log WHERE session_id = $1', [sessionId]);
    }

    const addFailedProfile = async (sessionId, attempt, ageSeconds) => query(
      `INSERT INTO charging_profile_log (
         station_id, charge_point_id, connector_id, session_id, transaction_id, limit_w,
         status, attempt, trigger, requested_at
       )
       SELECT $1, cs.charge_point_id, cs.connector_id, cs.id, cs.id::integer, 6000,
              'OFFLINE', $3, 'TEST', CURRENT_TIMESTAMP - make_interval(secs => $4::int)
       FROM charging_sessions cs WHERE cs.id = $2`,
      [stationId, sessionId, attempt, ageSeconds]
    );

    await addFailedProfile(sessionIds[0], 1, 31);
    let sendCount = 0;
    const retrySender = {
      async send() {
        sendCount += 1;
        return { status: 'Accepted' };
      },
    };
    const firstRuns = await Promise.all([
      processDuePowerProfiles({ db: pool, commandSender: retrySender, logInfo: () => {} }),
      processDuePowerProfiles({ db: pool, commandSender: retrySender, logInfo: () => {} }),
    ]);
    assert.equal(firstRuns.reduce((sum, result) => sum + result.retried, 0), 1);
    assert.equal(sendCount, 1);
    const attempts = await query(
      `SELECT attempt, status FROM charging_profile_log
       WHERE session_id = $1 ORDER BY attempt`,
      [sessionIds[0]]
    );
    assert.deepStrictEqual(attempts.rows, [
      { attempt: 1, status: 'OFFLINE' },
      { attempt: 2, status: 'ACCEPTED' },
    ]);

    await addFailedProfile(sessionIds[1], 3, 121);
    const timeoutSender = {
      async send() { throw new Error('OCPP call timed out: SetChargingProfile'); },
    };
    await processDuePowerProfiles({ db: pool, commandSender: timeoutSender, logInfo: () => {} });
    await processDuePowerProfiles({ db: pool, commandSender: timeoutSender, logInfo: () => {} });

    const finalAttempts = await query(
      `SELECT attempt, status FROM charging_profile_log
       WHERE session_id = $1 ORDER BY attempt`,
      [sessionIds[1]]
    );
    assert.deepStrictEqual(finalAttempts.rows, [
      { attempt: 3, status: 'OFFLINE' },
      { attempt: 4, status: 'TIMEOUT' },
    ]);
    const alerts = await query(
      `SELECT kind, severity FROM alerts WHERE session_id = $1 AND closed_at IS NULL`,
      [sessionIds[1]]
    );
    assert.deepStrictEqual(alerts.rows, [{ kind: 'POWER_UNCONFIRMED', severity: 'CRITICAL' }]);
    const session = await query('SELECT status FROM charging_sessions WHERE id = $1', [sessionIds[1]]);
    assert.equal(session.rows[0].status, 'CHARGING');
  });

  it('deduplicates profile rejection alerts and requests a remote stop once', async () => {
    const session = await query(
      `SELECT cp.station_id::text, cs.charge_point_id::text, cs.connector_id::text, cs.id::text AS session_id
       FROM charging_sessions cs
       JOIN charge_points cp ON cp.id = cs.charge_point_id
       WHERE cs.id = $1`,
      [sessionIds[2]]
    );
    const profile = { ...session.rows[0], limit_w: 7000 };
    let stopRequests = 0;
    const outcomes = createPowerProfileOutcomeHandler({
      db: pool,
      commandSender: {},
      requestRemoteStop: async () => { stopRequests += 1; },
    });

    await outcomes.onProfileRejected(profile, 'NOT_SUPPORTED', 'NotSupported');
    await outcomes.onProfileRejected(profile, 'NOT_SUPPORTED', 'NotSupported');

    assert.equal(stopRequests, 1);
    const alerts = await query(
      `SELECT kind, severity, dedup_key FROM alerts
       WHERE session_id = $1 AND closed_at IS NULL`,
      [sessionIds[2]]
    );
    assert.deepStrictEqual(alerts.rows, [{
      kind: 'POWER_PROFILE_REJECTED',
      severity: 'WARNING',
      dedup_key: `session:${sessionIds[2]}`,
    }]);
  });
});
