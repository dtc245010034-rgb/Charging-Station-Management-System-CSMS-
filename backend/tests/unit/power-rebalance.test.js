const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createPowerRebalancer } = require('../../src/modules/power/rebalance');
const { OcppCommandError } = require('../../src/modules/ocpp/commands');

function createPool({ powerLimitW = 22000, sessions = [] } = {}) {
  const logs = [];
  const queries = [];
  let nextLogId = 1;
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: null, rows: [] };
      if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [] };
      if (sql.includes('SELECT power_limit_w FROM stations')) {
        return { rowCount: 1, rows: [{ power_limit_w: powerLimitW }] };
      }
      if (sql.includes('FROM charging_sessions cs')) return { rowCount: sessions.length, rows: sessions };
      if (sql.includes('INSERT INTO charging_profile_log')) {
        const row = { id: nextLogId++, status: 'SENT', limit_w: params[5] };
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
        chargingProfileKind: 'Absolute',
        chargingSchedule: { chargingRateUnit: 'W', chargingSchedulePeriod: [{ startPeriod: 0, limit: 7300 }] },
      }],
      ['SetChargingProfile', 1, {
        chargingProfileId: 1,
        transactionId: 2,
        stackLevel: 1,
        chargingProfilePurpose: 'TxProfile',
        chargingProfileKind: 'Absolute',
        chargingSchedule: { chargingRateUnit: 'W', chargingSchedulePeriod: [{ startPeriod: 0, limit: 7300 }] },
      }],
      ['SetChargingProfile', 1, {
        chargingProfileId: 1,
        transactionId: 3,
        stackLevel: 1,
        chargingProfilePurpose: 'TxProfile',
        chargingProfileKind: 'Absolute',
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
    const { pool, logs } = createPool({ sessions: threeSessions.slice(0, 1) });
    let inFlight = 0;
    let maxInFlight = 0;
    const rebalancer = createPowerRebalancer({
      pool,
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
      const { pool, logs } = createPool({ sessions: threeSessions.slice(0, 1) });
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
      const { pool } = createPool({ sessions: threeSessions.slice(0, 1) });
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
});
