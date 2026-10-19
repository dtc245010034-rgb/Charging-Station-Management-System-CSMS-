const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createPowerRebalancer, getEffectiveLimitW } = require('../../src/modules/power/rebalance');
const { OcppCommandError } = require('../../src/modules/ocpp/commands');

function createPool({ powerLimitW = 22000, sessions = [], initialLogs = [] } = {}) {
  const logs = [...initialLogs];
  const queries = [];
  let nextLogId = logs.length + 1;
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: null, rows: [] };
      if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [] };
      if (sql.includes('SELECT power_limit_w FROM stations')) {
        return { rowCount: 1, rows: [{ power_limit_w: powerLimitW }] };
      }
      if (sql.includes("status = 'ACCEPTED'") && sql.includes('charging_profile_log')) {
        return {
          rowCount: logs.filter((log) => log.status === 'ACCEPTED').length,
          rows: logs.filter((log) => log.status === 'ACCEPTED').map((log) => ({
            session_id: log.session_id,
            limit_w: log.limit_w,
          })),
        };
      }
      if (sql.includes('FROM charging_sessions cs')) {
        const activeSessions = sessions.filter((session) => ![
          'SuspendedEV', 'Finishing', 'Unavailable', 'Faulted',
        ].includes(session.ocpp_status));
        return { rowCount: activeSessions.length, rows: activeSessions };
      }
      if (sql.includes('INSERT INTO charging_profile_log')) {
        const row = { id: nextLogId++, status: 'SENT', session_id: params[3], limit_w: params[5] };
        logs.push(row);
        return { rowCount: 1, rows: [row] };
      }
      if (sql.includes('UPDATE charging_profile_log')) {
        const row = logs.find((item) => item.id === params[2]);
        Object.assign(row, { status: params[0], reason: params[1] });
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  return {
    logs,
    queries,
    pool: { connect: async () => client, query: (...args) => client.query(...args) },
  };
}

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

const threeSessions = [
  { session_id: '1', connector_id: '11', connector_no: 1, charge_point_id: '21', charge_point_code: 'SIM-001', rated_w: 7400 },
  { session_id: '2', connector_id: '12', connector_no: 1, charge_point_id: '22', charge_point_code: 'SIM-002', rated_w: 11000 },
  { session_id: '3', connector_id: '13', connector_no: 1, charge_point_id: '23', charge_point_code: 'SIM-003', rated_w: 22000 },
];

describe('rebalanceStation', () => {
  it('sends capped SetChargingProfile limits and records accepted responses', async () => {
    const { pool, logs, queries } = createPool({ sessions: threeSessions });
    const sent = [];
    const rebalancer = createPowerRebalancer({
      pool,
      onProfileRejected: async () => {},
      commandSender: {
        async send(code, action, payload) {
          sent.push({ code, action, payload });
          return { status: 'Accepted' };
        },
      },
    });

    const result = await rebalancer.rebalanceStation(7, { reason: 'START_TRANSACTION' });

    assert.deepStrictEqual(result.sessions.map(({ limitW, status }) => ({ limitW, status })), [
      { limitW: 7300, status: 'ACCEPTED' },
      { limitW: 7300, status: 'ACCEPTED' },
      { limitW: 7400, status: 'ACCEPTED' },
    ]);
    assert.ok(result.sessions.reduce((sum, session) => sum + session.limitW, 0) <= 22000);
    assert.deepStrictEqual(sent.map(({ action, payload }) => [action, payload.connectorId, payload.csChargingProfiles]), [
      ['SetChargingProfile', 1, {
        chargingProfileId: 1,
        transactionId: 1,
        stackLevel: 1,
        chargingProfilePurpose: 'TxProfile',
        chargingProfileKind: 'Relative',
        chargingSchedule: { chargingRateUnit: 'W', chargingSchedulePeriod: [{ startPeriod: 0, limit: 7300 }] },
      }],
      ['SetChargingProfile', 1, {
        chargingProfileId: 1,
        transactionId: 2,
        stackLevel: 1,
        chargingProfilePurpose: 'TxProfile',
        chargingProfileKind: 'Relative',
        chargingSchedule: { chargingRateUnit: 'W', chargingSchedulePeriod: [{ startPeriod: 0, limit: 7300 }] },
      }],
      ['SetChargingProfile', 1, {
        chargingProfileId: 1,
        transactionId: 3,
        stackLevel: 1,
        chargingProfilePurpose: 'TxProfile',
        chargingProfileKind: 'Relative',
        chargingSchedule: { chargingRateUnit: 'W', chargingSchedulePeriod: [{ startPeriod: 0, limit: 7400 }] },
      }],
    ]);
    assert.deepStrictEqual(logs.map(({ status, limit_w }) => [status, limit_w]), [
      ['ACCEPTED', 7300],
      ['ACCEPTED', 7300],
      ['ACCEPTED', 7400],
    ]);
    assert.ok(queries.some(({ sql, params }) => sql.includes('pg_advisory_xact_lock') && params[0] === 'power-rebalance:7'));
  });

  it('does not send profiles when the station has no power limit', async () => {
    const { pool } = createPool({ powerLimitW: null, sessions: threeSessions });
    let sends = 0;
    const rebalancer = createPowerRebalancer({
      pool,
      commandSender: { async send() { sends += 1; return { status: 'Accepted' }; } },
    });

    const result = await rebalancer.rebalanceStation(7);

    assert.strictEqual(result.skipped, 'NO_POWER_LIMIT');
    assert.strictEqual(sends, 0);
  });

  it('serializes concurrent work for the same station and records rejected responses', async () => {
    const { pool, logs } = createPool({ powerLimitW: 6000, sessions: threeSessions.slice(0, 1) });
    let inFlight = 0;
    let maxInFlight = 0;
    const rebalancer = createPowerRebalancer({
      pool,
      minIntervalMs: 0,
      onProfileRejected: async () => {},
      commandSender: {
        async send() {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 10));
          inFlight -= 1;
          return { status: 'Rejected' };
        },
      },
    });

    const results = await Promise.all([
      rebalancer.rebalanceStation(7),
      rebalancer.rebalanceStation(7),
    ]);

    assert.strictEqual(maxInFlight, 1);
    assert.deepStrictEqual(results.map((result) => result.sessions[0].status), ['REJECTED', 'REJECTED']);
    assert.deepStrictEqual(logs.map((log) => log.status), ['REJECTED', 'REJECTED']);
  });

  it('records unsupported, offline, and timed-out command outcomes', async () => {
    const outcomes = [
      { response: { status: 'NotSupported' }, expected: 'NOT_SUPPORTED' },
      { error: new OcppCommandError('OFFLINE', 'Charge point offline'), expected: 'OFFLINE' },
      { error: new Error('OCPP connection closed'), expected: 'OFFLINE' },
      { error: new Error('OCPP call timed out: SetChargingProfile'), expected: 'TIMEOUT' },
    ];
    for (const outcome of outcomes) {
      const { pool, logs } = createPool({ powerLimitW: 6000, sessions: threeSessions.slice(0, 1) });
      const rebalancer = createPowerRebalancer({
        pool,
        onProfileRejected: async () => {},
        commandSender: {
          async send() {
            if (outcome.error) throw outcome.error;
            return outcome.response;
          },
        },
      });

      const result = await rebalancer.rebalanceStation(7);

      assert.strictEqual(result.sessions[0].status, outcome.expected);
      assert.strictEqual(logs[0].status, outcome.expected);
    }
  });

  it('handles rejected and unsupported profiles for remote stop and alerting', async () => {
    const handled = [];
    for (const response of [{ status: 'Rejected' }, { status: 'NotSupported' }]) {
      const { pool } = createPool({ powerLimitW: 6000, sessions: threeSessions.slice(0, 1) });
      const rebalancer = createPowerRebalancer({
        pool,
        commandSender: { async send() { return response; } },
        onProfileRejected: async (...args) => handled.push(args),
      });

      await rebalancer.rebalanceStation(7);
    }

    assert.deepStrictEqual(handled.map(([session, status]) => [session.session_id, status]), [
      ['1', 'REJECTED'],
      ['1', 'NOT_SUPPORTED'],
    ]);
  });

  it('timeline t0-t5 sends only changed accepted limits and skips the unconstrained first profile', async () => {
    const sessions = [threeSessions[2]];
    const { pool } = createPool({ sessions });
    const clock = createFakeClock();
    const sent = [];
    const rebalancer = createPowerRebalancer({
      pool,
      commandSender: {
        async send(_code, _action, payload) {
          sent.push([
            payload.csChargingProfiles.transactionId,
            payload.csChargingProfiles.chargingSchedule.chargingSchedulePeriod[0].limit,
          ]);
          return { status: 'Accepted' };
        },
      },
      minIntervalMs: 2000,
      now: clock.now,
      setTimeoutFn: clock.setTimeout,
      clearTimeoutFn: clock.clearTimeout,
    });
    const rebalance = async () => rebalancer.rebalanceStation(7);

    await rebalance();
    assert.deepStrictEqual(sent, []);

    sessions.push(threeSessions[1]);
    clock.tick(2000);
    await rebalance();
    assert.deepStrictEqual(sent, [[3, 11000]]);

    sessions.push(threeSessions[0]);
    clock.tick(2000);
    await rebalance();
    assert.deepStrictEqual(sent.slice(1), [[3, 7400], [2, 7300], [1, 7300]]);

    sessions.splice(sessions.indexOf(threeSessions[0]), 1);
    clock.tick(2000);
    await rebalance();
    assert.deepStrictEqual(sent.slice(4), [[3, 11000], [2, 11000]]);

    sessions.splice(sessions.indexOf(threeSessions[1]), 1);
    clock.tick(2000);
    await rebalance();
    assert.deepStrictEqual(sent.slice(6), [[3, 22000]]);

    sessions.push({ ...threeSessions[1], ocpp_status: 'Charging' });
    clock.tick(2000);
    await rebalance();
    assert.deepStrictEqual(sent.slice(7), [[3, 11000]]);
  });

  it('coalesces bursts and schedules a trailing pass after the final event', async () => {
    const clock = createFakeClock();
    const { pool, queries } = createPool({ sessions: threeSessions.slice(1) });
    let releaseSend;
    let sendStarted;
    const started = new Promise((resolve) => { sendStarted = resolve; });
    const blockedSend = new Promise((resolve) => { releaseSend = resolve; });
    let sends = 0;
    const rebalancer = createPowerRebalancer({
      pool,
      commandSender: {
        async send() {
          sends += 1;
          if (sends === 1) {
            sendStarted();
            await blockedSend;
          }
          return { status: 'Accepted' };
        },
      },
      minIntervalMs: 2000,
      now: clock.now,
      setTimeoutFn: clock.setTimeout,
      clearTimeoutFn: clock.clearTimeout,
    });

    const first = rebalancer.rebalanceStation(7, { reason: 'START_TRANSACTION' });
    await started;
    const second = rebalancer.rebalanceStation(7, { reason: 'STATUS_NOTIFICATION' });
    clock.tick(1000);
    const third = rebalancer.rebalanceStation(7, { reason: 'STOP_TRANSACTION' });
    clock.tick(1999);
    assert.equal(queries.filter(({ sql }) => sql.includes('pg_advisory_xact_lock')).length, 1);
    clock.tick(1);
    releaseSend();
    await Promise.all([first, second, third]);

    assert.equal(queries.filter(({ sql }) => sql.includes('pg_advisory_xact_lock')).length, 2);
    assert.equal(sends, 1);
  });

  it('restores rated power when the station power limit is cleared', async () => {
    const { pool } = createPool({
      powerLimitW: null,
      sessions: [threeSessions[2]], // Session 3 rated 22000W
      initialLogs: [{ id: 1, session_id: '3', limit_w: 7400, status: 'ACCEPTED' }],
    });
    const sent = [];
    const rebalancer = createPowerRebalancer({
      pool,
      commandSender: {
        async send(code, action, payload) {
          sent.push({ code, action, payload });
          return { status: 'Accepted' };
        },
      },
    });

    const result = await rebalancer.rebalanceStation(7, { reason: 'STATION_POWER_LIMIT_CLEARED' });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.csChargingProfiles.chargingSchedule.chargingSchedulePeriod[0].limit, 22000);
    assert.deepStrictEqual(result.sessions.map(({ limitW, status }) => ({ limitW, status })), [
      { limitW: 22000, status: 'ACCEPTED' },
    ]);
  });
});

describe('getEffectiveLimitW', () => {
  it('returns station power limit when set', async () => {
    const { pool } = createPool({ powerLimitW: 30000 });
    const limit = await getEffectiveLimitW(pool, 7);
    assert.equal(limit, 30000);
  });

  it('returns null when station has no power limit', async () => {
    const { pool } = createPool({ powerLimitW: null });
    const limit = await getEffectiveLimitW(pool, 7);
    assert.equal(limit, null);
  });
});
