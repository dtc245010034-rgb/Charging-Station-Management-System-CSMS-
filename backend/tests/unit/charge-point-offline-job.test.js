const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  OFFLINE_SCAN_INTERVAL_MS,
  scanStaleChargePoints,
  startChargePointOfflineJob,
} = require('../../src/modules/charge-points/offline-job');

describe('Job nền phát hiện trụ mất heartbeat', () => {
  it('so sánh ngưỡng bằng CURRENT_TIMESTAMP của cơ sở dữ liệu', async () => {
    let executedQuery;
    const expectedResult = { rowCount: 1 };
    const result = await scanStaleChargePoints({
      query: async (sql) => {
        executedQuery = sql;
        return expectedResult;
      },
    });

    assert.strictEqual(result, expectedResult);
    assert.match(executedQuery, /last_seen_at <= CURRENT_TIMESTAMP/);
    assert.match(executedQuery, /heartbeat_interval \* INTERVAL '2 seconds'/);
    assert.match(executedQuery, /status = 'ONLINE'/);
    assert.match(executedQuery, /SET status = 'OFFLINE'/);
  });

  it('quét ngay, tiếp tục mỗi phút, ghi log khi có đổi trạng thái và dừng timer', async (t) => {
    let callback;
    let scheduledInterval;
    let clearedTimer;
    let queryCount = 0;
    const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
    const logs = [];
    t.mock.method(global, 'setInterval', (handler, interval) => {
      callback = handler;
      scheduledInterval = interval;
      return timer;
    });
    t.mock.method(global, 'clearInterval', (handle) => { clearedTimer = handle; });

    const job = startChargePointOfflineJob({
      db: { query: async () => ({ rowCount: ++queryCount === 1 ? 2 : 0 }) },
      logInfo: (message) => logs.push(message),
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(queryCount, 1);
    assert.equal(scheduledInterval, OFFLINE_SCAN_INTERVAL_MS);
    assert.equal(timer.unrefCalled, true);
    assert.deepEqual(logs, ['[Job] Marked 2 stale charge point(s) offline']);

    callback();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(queryCount, 2);
    assert.equal(logs.length, 1);

    job.stop();
    assert.strictEqual(clearedTimer, timer);
  });
});
