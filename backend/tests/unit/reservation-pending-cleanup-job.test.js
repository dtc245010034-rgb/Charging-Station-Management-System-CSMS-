const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BASE, env } = require('../helpers/db');
Object.assign(process.env, env({ DATABASE_URL: BASE }));
const {
  RESERVATION_PENDING_SCAN_INTERVAL_MS,
  failStalePendingReservations,
  expireStaleAcceptedReservations,
  startReservationPendingCleanupJob,
} = require('../../src/modules/reservations/pending-cleanup-job');

describe('reservation pending cleanup job', () => {
  it('fails only PENDING rows older than 60 seconds and is repeatable', async () => {
    const queries = [];
    const results = [{ rowCount: 1, rows: [{ id: 7 }] }, { rowCount: 0, rows: [] }];
    const db = { query: async (sql) => { queries.push(sql); return results.shift(); } };
    const first = await failStalePendingReservations(db);
    const second = await failStalePendingReservations(db);

    assert.equal(first.rowCount, 1);
    assert.equal(second.rowCount, 0);
    assert.match(queries[0], /status = 'PENDING'/);
    assert.match(queries[0], /CURRENT_TIMESTAMP - INTERVAL '60 seconds'/);
    assert.match(queries[0], /SET status = 'FAILED'/);
  });

  it('expires ACCEPTED reservations whose expires_at is in the past', async () => {
    const queries = [];
    const results = [{ rowCount: 1, rows: [{ id: 8 }] }, { rowCount: 0, rows: [] }];
    const db = { query: async (sql) => { queries.push(sql); return results.shift(); } };
    const first = await expireStaleAcceptedReservations(db);
    const second = await expireStaleAcceptedReservations(db);

    assert.equal(first.rowCount, 1);
    assert.equal(second.rowCount, 0);
    assert.match(queries[0], /status = 'ACCEPTED'/);
    assert.match(queries[0], /expires_at <= CURRENT_TIMESTAMP/);
    assert.match(queries[0], /SET status = 'EXPIRED'/);
  });

  it('scans once immediately, logs changes, prevents overlapping scans and stops its timer', async (t) => {
    let intervalCallback;
    let intervalMs;
    let cleared;
    let scans = 0;
    let pendingResolve;
    const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
    const logs = [];
    t.mock.method(global, 'setInterval', (callback, ms) => { intervalCallback = callback; intervalMs = ms; return timer; });
    t.mock.method(global, 'clearInterval', (value) => { cleared = value; });
    const job = startReservationPendingCleanupJob({
      db: {
        query: () => {
          scans += 1;
          if (!pendingResolve) {
            return new Promise((resolve) => { pendingResolve = resolve; });
          }
          return Promise.resolve({ rowCount: 1, rows: [{ id: 9 }] });
        },
      },
      logInfo: (message) => logs.push(message),
    });

    intervalCallback();
    assert.equal(scans, 1);
    pendingResolve({ rowCount: 2, rows: [{ id: 1 }, { id: 2 }] });
    await job.run();
    assert.equal(intervalMs, RESERVATION_PENDING_SCAN_INTERVAL_MS);
    assert.equal(timer.unrefCalled, true);
    assert.ok(logs.length >= 1);
    job.stop();
    assert.equal(cleared, timer);
  });
});
