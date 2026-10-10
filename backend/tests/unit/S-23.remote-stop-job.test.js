const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { markExpiredRemoteStops, startRemoteStopTimeoutJob } = require('../../src/modules/sessions/remote-stop-job');

describe('S-23 remote stop timeout job', () => {
  it('uses database time, marks expired stop requests for review, and audits the deadline', async () => {
    let sqlSeen = '';
    let auditArgs;
    const deadline = new Date('2026-10-10T12:02:00.000Z');
    const db = {
      async query(sql) {
        sqlSeen = sql;
        return {
          rowCount: 1,
          rows: [{ id: 15, charge_point_id: '4', driver_id: null, remote_stop_requested_by: '9', remote_stop_deadline: deadline, remote_stop_status: 'TIMED_OUT' }],
        };
      },
    };

    const result = await markExpiredRemoteStops(db, {
      recordAudit: async (...args) => { auditArgs = args; },
    });

    assert.match(sqlSeen, /CURRENT_TIMESTAMP/);
    assert.match(sqlSeen, /remote_stop_status IN \('SENDING', 'ACCEPTED'\)/);
    assert.match(sqlSeen, /remote_stop_deadline <= CURRENT_TIMESTAMP/);
    assert.match(sqlSeen, /needs_review = TRUE/);
    assert.doesNotMatch(sqlSeen, /status = 'COMPLETED'/);
    assert.equal(result.rowCount, 1);
    assert.deepEqual(auditArgs.slice(0, 4), ['9', 'REMOTE_STOP', 'charging_session', 15]);
    assert.equal(auditArgs[4].result, 'TIMED_OUT');
    assert.equal(auditArgs[4].deadline, deadline.toISOString());
  });

  it('starts immediately, prevents overlapping scans, and returns a stop handle', async () => {
    let calls = 0;
    const job = startRemoteStopTimeoutJob({
      db: { query: async () => { calls += 1; return { rowCount: 0, rows: [] }; } },
      intervalMs: 60000,
      logInfo: () => {},
      logError: (message) => assert.fail(message),
    });
    await job.run();
    job.stop();
    assert.equal(calls, 1);
  });
});
