const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { pool } = require('../../src/db/pool');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { createPowerFixture } = require('../helpers/power-fixture');
const { createPowerRebalancer } = require('../../src/modules/power/rebalance');

function createFakeClock() {
  let currentTime = 0;
  let nextTimerId = 1;
  const timers = new Map();
  return {
    now: () => currentTime,
    setTimeout(callback, delayMs) {
      const id = nextTimerId++;
      timers.set(id, { callback, dueAt: currentTime + delayMs });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    tick(milliseconds) {
      currentTime += milliseconds;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.dueAt <= currentTime)
          .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
        if (!due) break;
        timers.delete(due[0]);
        due[1].callback();
      }
    },
  };
}

describe('S-44 AC: power rebalances as active charging sessions change', () => {
  let fixture;
  let clock;
  let rebalancer;
  const sent = [];

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    const owner = await createUser('power-rebalance-owner@test.invalid', 'STATION_OWNER');
    fixture = await createPowerFixture({
      owner,
      query,
      name: 'S-44 rebalance station',
      powerLimitKw: 22,
      sessions: [
        { code: 'S44-A', ratedW: 22000 },
        { code: 'S44-B', ratedW: 11000, status: 'COMPLETED' },
        { code: 'S44-C', ratedW: 7400, status: 'COMPLETED' },
      ],
    });
    clock = createFakeClock();
    rebalancer = createPowerRebalancer({
      pool,
      minIntervalMs: 2000,
      now: clock.now,
      setTimeoutFn: clock.setTimeout,
      clearTimeoutFn: clock.clearTimeout,
      onProfileRejected: async () => {},
      commandSender: {
        async send(_code, _action, payload) {
          sent.push([
            payload.csChargingProfiles.transactionId,
            payload.csChargingProfiles.chargingSchedule.chargingSchedulePeriod[0].limit,
          ]);
          return { status: 'Accepted' };
        },
      },
    });
  });

  after(async () => { await resetSchema(); await closePool(); });

  it('S-44 AC: follows the t0-t5 station allocation and sends only changed limits', async () => {
    const [sessionA, sessionB, sessionC] = fixture.sessions;
    const trigger = (reason) => rebalancer.rebalanceStation(fixture.stationId, { reason });

    await trigger('START_TRANSACTION');
    assert.deepStrictEqual(sent, []);

    await query(`UPDATE charging_sessions SET status = 'CHARGING' WHERE id = $1`, [sessionB.sessionId]);
    clock.tick(2000);
    await trigger('START_TRANSACTION');
    assert.deepStrictEqual(sent, [[sessionA.sessionId, 11000]]);

    await query(`UPDATE charging_sessions SET status = 'CHARGING' WHERE id = $1`, [sessionC.sessionId]);
    clock.tick(2000);
    await trigger('START_TRANSACTION');
    assert.deepStrictEqual(sent.slice(1), [
      [sessionA.sessionId, 7400],
      [sessionB.sessionId, 7300],
      [sessionC.sessionId, 7300],
    ]);

    await query(`UPDATE charging_sessions SET status = 'COMPLETED' WHERE id = $1`, [sessionC.sessionId]);
    clock.tick(2000);
    await trigger('STOP_TRANSACTION');
    assert.deepStrictEqual(sent.slice(4), [
      [sessionA.sessionId, 11000],
      [sessionB.sessionId, 11000],
    ]);

    await query(`UPDATE connectors SET ocpp_status = 'SuspendedEV' WHERE id = $1`, [sessionB.connectorId]);
    clock.tick(2000);
    await trigger('STATUS_NOTIFICATION');
    assert.deepStrictEqual(sent.slice(6), [[sessionA.sessionId, 22000]]);

    await query(`UPDATE connectors SET ocpp_status = 'Charging' WHERE id = $1`, [sessionB.connectorId]);
    clock.tick(2000);
    await trigger('STATUS_NOTIFICATION');
    assert.deepStrictEqual(sent.slice(7), [[sessionA.sessionId, 11000]]);

    const sum = await query(
      `SELECT SUM(latest.limit_w)::integer AS limit_w
       FROM charging_sessions cs
       JOIN connectors c ON c.id = cs.connector_id
       JOIN charge_points cp ON cp.id = c.charge_point_id
       JOIN LATERAL (
         SELECT l.limit_w
         FROM charging_profile_log l
         WHERE l.session_id = cs.id AND l.status = 'ACCEPTED'
         ORDER BY l.id DESC
         LIMIT 1
       ) latest ON TRUE
       WHERE cp.station_id = $1
         AND cs.status = 'CHARGING'
         AND (c.ocpp_status IS NULL OR c.ocpp_status NOT IN ('SuspendedEV', 'Finishing', 'Unavailable', 'Faulted'))`,
      [fixture.stationId]
    );
    assert.ok(sum.rows[0].limit_w <= 22000);
  });
});
