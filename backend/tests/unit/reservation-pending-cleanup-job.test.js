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
    let expired = false;
    const client = {
      async query(sql, params = []) {
        queries.push({ sql, params });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: null, rows: [] };
        if (sql.includes('WITH due AS')) {
          if (expired) return { rowCount: 0, rows: [] };
          expired = true;
          return { rowCount: 1, rows: [{ id: 8, driver_id: 1, connector_id: 2, ocpp_reservation_id: 80 }] };
        }
        if (sql.startsWith('INSERT INTO wallets')) return { rowCount: 1, rows: [] };
        if (sql.includes('SELECT driver_id, balance_dong')) {
          return { rowCount: 1, rows: [{ driver_id: 1, balance_dong: '0', locked: false }] };
        }
        if (sql.includes("entry_type = 'RESERVATION_FEE'")) return { rowCount: 0, rows: [] };
        if (sql.includes('INSERT INTO wallet_ledger')) return { rowCount: 1, rows: [{ id: 1 }] };
        if (sql.includes('UPDATE wallets')) return { rowCount: 1, rows: [{ driver_id: 1, balance_dong: '-20000' }] };
        if (sql.includes('INSERT INTO reservation_cancellation_queue')) return { rowCount: 1, rows: [] };
        throw new Error(`Unexpected SQL: ${sql}`);
      },
      release() {},
    };
    const db = { connect: async () => client, query: (...args) => client.query(...args) };
    const first = await expireStaleAcceptedReservations(db);
    const second = await expireStaleAcceptedReservations(db);

    assert.equal(first.rowCount, 1);
    assert.equal(second.rowCount, 0);
    const expiryQuery = queries.find(({ sql }) => sql.includes('WITH due AS')).sql;
    assert.match(expiryQuery, /status = 'ACCEPTED'/);
    assert.match(expiryQuery, /expires_at <= clock_timestamp\(\)/);
    assert.match(expiryQuery, /SET status = 'EXPIRED'/);
    assert.ok(queries.some(({ sql, params }) => sql.includes('INSERT INTO wallet_ledger') && params[2] === '-20000'));
  });

  it('scans once immediately, logs changes, prevents overlapping scans and stops its timer', async (t) => {
    let intervalCallback;
    let intervalMs;
    let cleared;
    let scans = 0;
    let pendingResolve;
    const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
    const logs = [];
    const client = {
      async query(sql) {
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: null, rows: [] };
        if (sql.includes('WITH due AS')) return { rowCount: 0, rows: [] };
        if (sql.includes('reservation_cancellation_queue')) return { rowCount: 0, rows: [] };
        throw new Error(`Unexpected SQL: ${sql}`);
      },
      release() {},
    };
    t.mock.method(global, 'setInterval', (callback, ms) => { intervalCallback = callback; intervalMs = ms; return timer; });
    t.mock.method(global, 'clearInterval', (value) => { cleared = value; });
    const job = startReservationPendingCleanupJob({
      db: {
        connect: async () => client,
        query: (sql) => {
          if (sql.includes('reservation_cancellation_queue')) {
            return Promise.resolve({ rowCount: 0, rows: [] });
          }
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
