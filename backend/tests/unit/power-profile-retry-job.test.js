const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROFILE_RETRY_DELAYS_SECONDS,
  processDuePowerProfiles,
  startPowerProfileRetryJob,
} = require('../../src/modules/power/profile-retry-job');

function createPool(profile) {
  const queries = [];
  const claimed = [];
  const updates = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: null, rows: [] };
      if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [] };
      if (sql.includes('FOR UPDATE OF l')) return { rowCount: 1, rows: [profile] };
      if (sql.includes('INSERT INTO charging_profile_log')) {
        const retry = { ...profile, id: profile.id + 1, attempt: profile.attempt + 1, status: 'SENT' };
        claimed.push(retry);
        return { rowCount: 1, rows: [retry] };
      }
      if (sql.includes('UPDATE charging_profile_log')) {
        updates.push({ status: params[0], reason: params[1], id: params[2] });
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  return {
    claimed,
    queries,
    updates,
    pool: {
      connect: async () => client,
      async query(sql, params = []) {
        queries.push({ sql, params });
        if (sql.includes('UPDATE charging_profile_log') && sql.includes('SET status = $1')) {
          updates.push({ status: params[0], reason: params[1], id: params[2] });
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes("l.status IN ('OFFLINE', 'TIMEOUT')") && sql.includes('l.attempt <= $2')) {
          return { rowCount: 1, rows: [profile] };
        }
        return { rowCount: 0, rows: [] };
      },
    },
  };
}

const failedProfile = {
  id: 21,
  attempt: 1,
  status: 'OFFLINE',
  session_id: '15',
  station_id: '7',
  charge_point_id: '4',
  connector_id: '9',
  transaction_id: 15,
  limit_w: 6000,
  trigger: 'START_TRANSACTION',
  charge_point_code: 'SIM-001',
  connector_no: 1,
  session_status: 'CHARGING',
};

describe('power profile retry job', () => {
  it('uses the 30/60/120 second backoff schedule', () => {
    assert.deepStrictEqual(PROFILE_RETRY_DELAYS_SECONDS, [30, 60, 120]);
  });

  it('claims due work once, resends the profile, and records an accepted retry', async () => {
    const { pool, claimed, queries, updates } = createPool(failedProfile);
    const sent = [];
    const result = await processDuePowerProfiles({
      db: pool,
      commandSender: {
        async send(code, action, payload) {
          sent.push({ code, action, payload });
          return { status: 'Accepted' };
        },
      },
      onProfileRejected: async () => assert.fail('accepted profile must not trigger rejection handling'),
      onProfileUnconfirmed: async () => assert.fail('accepted profile must not trigger unconfirmed handling'),
    });

    assert.equal(result.retried, 1);
    assert.equal(claimed[0].attempt, 2);
    assert.deepStrictEqual(updates, [{ status: 'ACCEPTED', reason: null, id: claimed[0].id }]);
    assert.deepStrictEqual(sent, [{
      code: 'SIM-001',
      action: 'SetChargingProfile',
      payload: {
        connectorId: 1,
        csChargingProfiles: {
          chargingProfileId: 1,
          transactionId: 15,
          stackLevel: 1,
          chargingProfilePurpose: 'TxProfile',
          chargingProfileKind: 'Absolute',
          chargingSchedule: {
            chargingRateUnit: 'W',
            chargingSchedulePeriod: [{ startPeriod: 0, limit: 6000 }],
          },
        },
      },
    }]);
    assert.ok(queries.some(({ params }) => params.includes(30)));
  });

  it('alerts after the third retry fails without stopping the session', async () => {
    const thirdAttempt = { ...failedProfile, attempt: 3, id: 23 };
    const { pool, claimed, updates } = createPool(thirdAttempt);
    const unconfirmed = [];
    let stopped = false;
    const result = await processDuePowerProfiles({
      db: pool,
      commandSender: { async send() { throw new Error('OCPP call timed out: SetChargingProfile'); } },
      onProfileRejected: async () => { stopped = true; },
      onProfileUnconfirmed: async (...args) => unconfirmed.push(args),
    });

    assert.equal(result.retried, 1);
    assert.equal(claimed[0].attempt, 4);
    assert.equal(updates[0].status, 'TIMEOUT');
    assert.deepStrictEqual(unconfirmed.map(([profile, status]) => [profile.session_id, status]), [['15', 'TIMEOUT']]);
    assert.equal(stopped, false);
  });

  it('starts immediately, prevents overlapping runs, and exposes a stop handle', async () => {
    let calls = 0;
    const job = startPowerProfileRetryJob({
      db: { query: async () => { calls += 1; return { rowCount: 0, rows: [] }; } },
      commandSender: { async send() { return { status: 'Accepted' }; } },
      intervalMs: 60000,
      logError: (message) => assert.fail(message),
    });
    await job.run();
    job.stop();
    assert.equal(calls, 1);
  });
});
