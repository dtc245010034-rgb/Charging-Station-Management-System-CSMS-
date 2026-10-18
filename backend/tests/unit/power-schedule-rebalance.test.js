const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createPowerRebalancer } = require('../../src/modules/power/rebalance');

describe('scheduled power rebalance', () => {
  it('W07: sends a new charging profile when the effective limit changes at a window boundary', async () => {
    const logs = [];
    const queries = [];
    let nextLogId = 1;
    let at = new Date('2026-10-21T02:59:59.000Z');
    const session = {
      session_id: '1',
      connector_id: '11',
      connector_no: 1,
      charge_point_id: '21',
      charge_point_code: 'SIM-S45',
      rated_w: 11000,
    };
    const client = {
      async query(sql, params = []) {
        queries.push(sql);
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: null, rows: [] };
        if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [] };
        if (sql.includes('SELECT power_limit_w, timezone FROM stations')) {
          return { rowCount: 1, rows: [{ power_limit_w: 22000, timezone: 'Asia/Ho_Chi_Minh' }] };
        }
        if (sql.includes("status = 'ACCEPTED'") && sql.includes('charging_profile_log')) {
          const accepted = logs.filter((log) => log.status === 'ACCEPTED');
          return { rowCount: accepted.length, rows: accepted.map(({ session_id, limit_w }) => ({ session_id, limit_w })) };
        }
        if (sql.includes('FROM charging_sessions cs')) return { rowCount: 1, rows: [session] };
        if (sql.includes('INSERT INTO charging_profile_log')) {
          const row = { id: nextLogId++, session_id: params[3], limit_w: params[5], status: 'SENT' };
          logs.push(row);
          return { rowCount: 1, rows: [{ id: row.id }] };
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
    const pool = { connect: async () => client, query: (...args) => client.query(...args) };
    const scheduleRepository = {
      async list(_db, stationId) {
        assert.equal(stationId, 7);
        return [{ id: 3, start_minute: 8 * 60, end_minute: 10 * 60, limit_w: 6000 }];
      },
    };
    const sent = [];
    const rebalancer = createPowerRebalancer({
      pool,
      scheduleRepository,
      scheduleNow: () => at,
      minIntervalMs: 0,
      commandSender: {
        async send(_code, action, payload) {
          sent.push({
            action,
            limitW: payload.csChargingProfiles.chargingSchedule.chargingSchedulePeriod[0].limit,
          });
          return { status: 'Accepted' };
        },
      },
    });

    await rebalancer.rebalanceStation(7, { reason: 'SCHEDULE' });
    at = new Date('2026-10-21T03:00:00.000Z');
    await rebalancer.rebalanceStation(7, { reason: 'SCHEDULE' });

    assert.deepEqual(sent, [
      { action: 'SetChargingProfile', limitW: 6000 },
      { action: 'SetChargingProfile', limitW: 11000 },
    ]);
    assert.deepEqual(logs.map(({ status, limit_w }) => [status, limit_w]), [
      ['ACCEPTED', 6000],
      ['ACCEPTED', 11000],
    ]);
    assert.equal(queries.filter((sql) => sql.includes('SELECT power_limit_w, timezone FROM stations')).length, 2);
  });
});
