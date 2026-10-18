const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BASE, env } = require('../helpers/db');
Object.assign(process.env, env({ DATABASE_URL: BASE }));
const {
  POWER_SCHEDULE_TICK_MS,
  createPowerScheduleJob,
  startPowerScheduleJob,
} = require('../../src/modules/power/schedule-job');

describe('power schedule job', () => {
  it('W05: rebalances only stations with active windows and charging sessions', async () => {
    let query;
    const calls = [];
    const logs = [];
    const job = createPowerScheduleJob({
      db: {
        query: async (sql) => {
          query = sql;
          return { rows: [{ id: 11 }, { id: 12 }] };
        },
      },
      rebalanceStation: async (id, options) => {
        calls.push({ id, options });
        if (id === 12) throw new Error('OCPP offline');
        return id;
      },
      logError: (...args) => logs.push(args),
    });

    assert.deepEqual(await job.run(), [11]);
    assert.match(query, /w\.deleted_at IS NULL/);
    assert.match(query, /cs\.status = 'CHARGING'/);
    assert.deepEqual(calls, [
      { id: 11, options: { reason: 'SCHEDULE' } },
      { id: 12, options: { reason: 'SCHEDULE' } },
    ]);
    assert.equal(logs.length, 1);
    assert.match(logs[0][0], /Rebalance station 12 failed/);
    assert.match(logs[0][1], /OCPP offline/);
  });

  it('W06: scans immediately, prevents overlapping scans, and stops its timer', async (t) => {
    let intervalCallback;
    let intervalMs;
    let cleared;
    let resolveScan;
    let scans = 0;
    const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
    t.mock.method(global, 'setInterval', (callback, ms) => {
      intervalCallback = callback;
      intervalMs = ms;
      return timer;
    });
    t.mock.method(global, 'clearInterval', (value) => { cleared = value; });
    const job = startPowerScheduleJob({
      db: {
        query: () => {
          scans += 1;
          return new Promise((resolve) => { resolveScan = resolve; });
        },
      },
      rebalanceStation: async () => {},
      logError: () => {},
    });

    intervalCallback();
    assert.equal(scans, 1);
    resolveScan({ rows: [] });
    await job.run();
    assert.equal(intervalMs, POWER_SCHEDULE_TICK_MS);
    assert.equal(timer.unrefCalled, true);
    job.stop();
    assert.equal(cleared, timer);
  });
});
