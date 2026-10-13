const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
process.env.CSMS_SKIP_DOTENV = '1';
process.env.DATABASE_URL ||= 'postgresql://localhost/csms_test';
process.env.JWT_SECRET ||= 'x'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';
const {
  findSessionsForFinalization,
  startBillingFinalizationJob,
} = require('../../src/modules/billing/finalization-job');

describe('billing finalization job', () => {
  it('selects unprocessed and retry-due sessions with SKIP LOCKED', async () => {
    let queryArgs;
    const expected = { rowCount: 1, rows: [{ id: '21' }] };
    const result = await findSessionsForFinalization({
      query: async (...args) => {
        queryArgs = args;
        return expected;
      },
    }, 12);

    assert.match(queryArgs[0], /billing_status IS NULL/);
    assert.match(queryArgs[0], /billing_status = 'ERROR'/);
    assert.match(queryArgs[0], /billing_next_at <= CURRENT_TIMESTAMP/);
    assert.match(queryArgs[0], /FOR UPDATE SKIP LOCKED/);
    assert.deepEqual(queryArgs[1], [12]);
    assert.equal(result, expected);
  });

  it('rejects an invalid scan limit', async () => {
    await assert.rejects(() => findSessionsForFinalization({ query: async () => ({}) }, 0), {
      name: 'TypeError',
      message: 'limit must be a positive safe integer',
    });
  });

  it('starts immediately, serializes runs, finalizes scanned sessions, and stops', async () => {
    let queryCount = 0;
    const finalized = [];
    const db = {
      async query() {
        queryCount += 1;
        return { rowCount: 2, rows: [{ id: '21' }, { id: '22' }] };
      },
    };
    const job = startBillingFinalizationJob({
      db,
      intervalMs: 60000,
      finalizeSession: async (sessionId, options) => {
        finalized.push([sessionId, options.pool]);
        return { status: 'FINAL' };
      },
      logInfo: () => {},
      logError: (message) => assert.fail(message),
    });

    await Promise.all([job.run(), job.run()]);
    job.stop();

    assert.equal(queryCount, 1);
    assert.deepEqual(finalized, [['21', db], ['22', db]]);
  });
});
