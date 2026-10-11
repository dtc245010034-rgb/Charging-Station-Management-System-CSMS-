const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  markAbnormalSessions,
  startAbnormalSessionJob,
} = require('../../src/modules/sessions/abnormal-job');
const { listUnexpectedSessions } = require('../../src/modules/sessions/sessions.repository');
const { closeUnexpectedSession } = require('../../src/modules/sessions/sessions.service');
const { AppError } = require('../../src/lib/errors');

describe('S-25 unexpected charging sessions', () => {
  it('marks stale or over-time remote-stop sessions ABNORMAL without completing them', async () => {
    let sqlSeen = '';
    let parameters;
    const result = await markAbnormalSessions({
      query: async (sql, values) => {
        sqlSeen = sql;
        parameters = values;
        return { rowCount: 1, rows: [] };
      },
    }, 60);

    assert.deepEqual(parameters, [60, 120]);
    assert.match(sqlSeen, /cs\.status = 'CHARGING'/);
    assert.match(sqlSeen, /SET status = 'ABNORMAL'/);
    assert.match(sqlSeen, /cp\.last_seen_at <= CURRENT_TIMESTAMP - make_interval\(secs => \$1::int\)/);
    assert.match(sqlSeen, /remote_stop_requested_at <= CURRENT_TIMESTAMP - make_interval\(secs => \$2::int\)/);
    assert.match(sqlSeen, /remote_stop_status IN \('SENDING', 'ACCEPTED', 'ERROR', 'TIMED_OUT'\)/);
    assert.match(sqlSeen, /needs_review = TRUE/);
    assert.doesNotMatch(sqlSeen, /SET status = 'COMPLETED'/);
    assert.equal(result.rowCount, 1);
  });

  it('lists only ABNORMAL sessions until a later StopTransaction completes them', async () => {
    let sqlSeen = '';
    await listUnexpectedSessions({
      query: async (sql) => {
        sqlSeen = sql;
        return { rows: [] };
      },
    });
    assert.match(sqlSeen, /WHERE cs\.status = 'ABNORMAL'/);
    assert.doesNotMatch(sqlSeen, /cs\.needs_review = TRUE/);
  });

  it('rejects an invalid offline threshold', async () => {
    await assert.rejects(
      () => markAbnormalSessions({ query: async () => ({ rows: [] }) }, 0),
      (error) => error instanceof TypeError
    );
  });

  it('starts the scan immediately and exposes a stop handle', async () => {
    let calls = 0;
    const job = startAbnormalSessionJob({
      db: { query: async () => { calls += 1; return { rowCount: 0, rows: [] }; } },
      abnormalAfterSeconds: 21600,
      intervalMs: 60000,
      logInfo: () => {},
      logError: (message) => assert.fail(message),
    });
    await new Promise((resolve) => setImmediate(resolve));
    job.stop();
    assert.equal(calls, 1);
  });

  it('requires a non-empty manual closure reason', async () => {
    await assert.rejects(
      () => closeUnexpectedSession({ id: 3 }, 10, '  ', { db: {} }),
      (error) => error instanceof AppError && error.status === 400
    );
  });

  it('closes using the latest trusted energy reading and audits the action atomically', async () => {
    const queries = [];
    const client = {
      async query(sql, values = []) {
        queries.push({ sql, values });
        if (sql.includes('SELECT id, driver_id, meter_start, review_reason')) {
          return { rows: [{ id: 10, driver_id: 21, meter_start: '10000', review_reason: 'CHARGE_POINT_OFFLINE_TIMEOUT' }] };
        }
        if (sql.includes('FROM meter_values')) return { rows: [{ value: '15.25', unit: 'kWh' }] };
        return { rows: [], rowCount: 1 };
      },
      release() {},
    };
    const db = { connect: async () => client };

    const result = await closeUnexpectedSession({ id: 3 }, 10, 'Trụ mất liên lạc', { db, ip: '127.0.0.1' });
    const update = queries.find(({ sql }) => sql.includes('UPDATE charging_sessions'));
    const audit = queries.find(({ sql }) => sql.includes('INSERT INTO audit_logs'));

    assert.deepEqual(result, { id: 10, status: 'COMPLETED', meter_stop: 15250, current_kwh: 5.25 });
    assert.ok(update);
    assert.match(update.sql, /status = 'COMPLETED'/);
    assert.match(update.sql, /remote_stop_status = CASE.*'STOPPED'/s);
    assert.match(update.sql, /manual_closed_by = \$4/);
    assert.deepEqual(update.values, [10, 15250, 'Trụ mất liên lạc', 3]);
    assert.ok(audit);
    assert.deepEqual(JSON.parse(audit.values[4]), {
      reason: 'Trụ mất liên lạc',
      meter_start_wh: 10000,
      meter_stop_wh: 15250,
      energy_kwh: 5.25,
      previous_review_reason: 'CHARGE_POINT_OFFLINE_TIMEOUT',
    });
    assert.equal(audit.values[5], '127.0.0.1');
    assert.ok(queries.some(({ sql }) => sql === 'COMMIT'));
  });

  it('does not close a session without a usable final energy reading', async () => {
    const queries = [];
    const client = {
      async query(sql) {
        queries.push(sql);
        if (sql.includes('SELECT id, driver_id, meter_start, review_reason')) {
          return { rows: [{ id: 10, driver_id: 21, meter_start: '10000', review_reason: 'CHARGE_POINT_OFFLINE_TIMEOUT' }] };
        }
        if (sql.includes('FROM meter_values')) return { rows: [] };
        return { rows: [], rowCount: 1 };
      },
      release() {},
    };
    const db = { connect: async () => client };

    await assert.rejects(
      () => closeUnexpectedSession({ id: 3 }, 10, 'Trụ mất liên lạc', { db }),
      (error) => error instanceof AppError && error.code === 'FINAL_METER_READING_UNAVAILABLE'
    );
    assert.ok(queries.includes('ROLLBACK'));
    assert.ok(!queries.some((sql) => sql.includes('UPDATE charging_sessions')));
  });
});
