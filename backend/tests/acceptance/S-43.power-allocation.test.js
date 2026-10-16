const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { pool } = require('../../src/db/pool');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { createPowerFixture } = require('../helpers/power-fixture');
const { createPowerRebalancer } = require('../../src/modules/power/rebalance');
const { createPowerProfileOutcomeHandler } = require('../../src/modules/power/profile-outcomes');

describe('S-43 AC: station power allocation', () => {
  let fixture;
  let rejectedFixture;
  let concurrentFixture;
  let rebalancer;
  const sent = [];
  let remoteStops;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('power-allocation-owner@test.invalid', 'STATION_OWNER');
    fixture = await createPowerFixture({
      owner,
      query,
      name: 'S-43 allocation station',
      powerLimitKw: 22,
      sessions: [
        { code: 'S43-7400', ratedW: 7400 },
        { code: 'S43-11000', ratedW: 11000 },
        { code: 'S43-22000', ratedW: 22000 },
      ],
    });
    rejectedFixture = await createPowerFixture({
      owner,
      query,
      name: 'S-43 rejected station',
      powerLimitKw: 6,
      sessions: [{ code: 'S43-REJECT', ratedW: 7400 }],
    });
    concurrentFixture = await createPowerFixture({
      owner,
      query,
      name: 'S-43 concurrent station',
      powerLimitKw: 22,
      sessions: [
        { code: 'S43-CONCURRENT-A', ratedW: 22000, status: 'COMPLETED' },
        { code: 'S43-CONCURRENT-B', ratedW: 22000, status: 'COMPLETED' },
      ],
    });

    const outcomes = createPowerProfileOutcomeHandler({
      db: pool,
      commandSender: {},
      requestRemoteStop: async (actor, sessionId) => { remoteStops.push({ actor, sessionId }); },
    });
    rebalancer = createPowerRebalancer({
      pool,
      minIntervalMs: 0,
      onProfileRejected: outcomes.onProfileRejected,
      commandSender: {
        async send(code, action, payload) {
          sent.push({ code, action, limitW: payload.csChargingProfiles.chargingSchedule.chargingSchedulePeriod[0].limit });
          return { status: code === 'S43-REJECT' ? 'Rejected' : 'Accepted' };
        },
      },
    });
    remoteStops = [];
  });

  after(async () => { await resetSchema(); await closePool(); });

  it('S-43 AC: sends accepted profiles whose combined P01 limits stay within the station cap', async () => {
    const result = await rebalancer.rebalanceStation(fixture.stationId, { reason: 'START_TRANSACTION' });
    const logs = await query(
      `SELECT cp.code, l.limit_w, l.status
       FROM charging_profile_log l
       JOIN charge_points cp ON cp.id = l.charge_point_id
       WHERE l.station_id = $1 ORDER BY l.limit_w, cp.code`,
      [fixture.stationId]
    );

    assert.deepStrictEqual(logs.rows, [
      { code: 'S43-11000', limit_w: 7300, status: 'ACCEPTED' },
      { code: 'S43-7400', limit_w: 7300, status: 'ACCEPTED' },
      { code: 'S43-22000', limit_w: 7400, status: 'ACCEPTED' },
    ]);
    assert.equal(logs.rows.reduce((sum, row) => sum + row.limit_w, 0), 22000);
    assert.equal(result.sessions.reduce((sum, session) => sum + session.limitW, 0), 22000);
    assert.equal(sent.length, 3);
  });

  it('S-43 AC: requests remote stop and opens a warning when the charge point rejects its profile', async () => {
    await rebalancer.rebalanceStation(rejectedFixture.stationId, { reason: 'START_TRANSACTION' });
    const alerts = await query(
      `SELECT kind, severity, session_id::text
       FROM alerts WHERE station_id = $1 AND closed_at IS NULL`,
      [rejectedFixture.stationId]
    );

    assert.deepStrictEqual(remoteStops, [{
      actor: { id: null },
      sessionId: String(rejectedFixture.sessions[0].sessionId),
    }]);
    assert.deepStrictEqual(alerts.rows, [{
      kind: 'POWER_PROFILE_REJECTED',
      severity: 'WARNING',
      session_id: String(rejectedFixture.sessions[0].sessionId),
    }]);
  });

  it('S-43 AC: concurrent session starts leave the accepted power total within the cap', async () => {
    await Promise.all(concurrentFixture.sessions.map(({ sessionId }) => query(
      `UPDATE charging_sessions SET status = 'CHARGING' WHERE id = $1`,
      [sessionId]
    )));
    const concurrentRebalancer = createPowerRebalancer({
      pool,
      minIntervalMs: 0,
      onProfileRejected: async () => {},
      commandSender: { async send() { return { status: 'Accepted' }; } },
    });

    await Promise.all([
      concurrentRebalancer.rebalanceStation(concurrentFixture.stationId, { reason: 'START_TRANSACTION' }),
      concurrentRebalancer.rebalanceStation(concurrentFixture.stationId, { reason: 'START_TRANSACTION' }),
    ]);
    const latest = await query(
      `SELECT DISTINCT ON (session_id) session_id, limit_w
       FROM charging_profile_log
       WHERE station_id = $1 AND status = 'ACCEPTED'
       ORDER BY session_id, id DESC`,
      [concurrentFixture.stationId]
    );

    assert.equal(latest.rowCount, 2);
    assert.equal(latest.rows.reduce((sum, row) => sum + row.limit_w, 0), 22000);
  });
});
