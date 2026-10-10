const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { subscribe, publishSessionUpdateFromDb } = require('../../src/modules/sessions/sessions.events');

describe('sessions.events: lỗi khi phát sự kiện phải được ghi log', () => {
  it('truy vấn DB lỗi -> ghi log 1 lần, không ném lỗi', async () => {
    const off = subscribe(() => {});
    const logged = [];
    const failingPool = { query: async () => { throw new Error('db down'); } };
    try {
      await publishSessionUpdateFromDb(1, { pool: failingPool, logError: (...args) => logged.push(args.join(' ')) });
    } finally {
      off();
    }
    assert.equal(logged.length, 1);
    assert.match(logged[0], /db down/);
  });

  it('formatSession ném lỗi -> ghi log, không ném lỗi', async () => {
    const off = subscribe(() => {});
    const logged = [];
    const badRow = { id: 1, driver_id: '5', status: 'COMPLETED', meter_start: '1.5', meter_stop: '3' };
    const pool = { query: async () => ({ rows: [badRow] }) };
    try {
      await publishSessionUpdateFromDb(1, { pool, logError: (...args) => logged.push(args.join(' ')) });
    } finally {
      off();
    }
    assert.equal(logged.length, 1);
  });
});
