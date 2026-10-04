const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { pool, ocppPool } = require('../../src/db/pool');

describe('F10: chỉ pool của handler OCPP có lock_timeout; pool chung (API, migration, job) giữ nguyên', () => {
  before(() => {});
  after(async () => { await closePool(); await ocppPool?.end(); });

  it('ocppPool đặt lock_timeout 5 giây theo mặc định', async () => {
    const result = await ocppPool.query('SHOW lock_timeout');
    assert.equal(result.rows[0].lock_timeout, '5s');
  });

  it('pool chung không có lock_timeout', async () => {
    const result = await pool.query('SHOW lock_timeout');
    assert.equal(result.rows[0].lock_timeout, '0');
  });
});
