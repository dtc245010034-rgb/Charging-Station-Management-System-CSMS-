const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { optionsFromArgs, makeSample, readSessionResults } = require('../../../tools/test-s21-reconnect-fleet');

describe('S-21 reconnect fleet scenario', () => {
  it('parses configurable fleet size, reconnect count range, and repetition count', () => {
    const previous = {
      STAGING_BASE_URL: process.env.STAGING_BASE_URL,
      STAGING_DATABASE_URL: process.env.STAGING_DATABASE_URL,
    };
    process.env.STAGING_BASE_URL = 'https://staging.invalid';
    process.env.STAGING_DATABASE_URL = 'postgres://readonly.invalid/csms';
    try {
      assert.deepEqual(optionsFromArgs(['--count', '4', '--disconnects', '1-2', '--runs', '3', '--prefix', 'S21-CI-']), {
        url: 'https://staging.invalid',
        count: 4,
        disconnects: [1, 2],
        runs: 3,
        prefix: 'S21-CI-',
        tag: 'TAG-DEMO-01',
      });
      assert.deepEqual(optionsFromArgs(['--disconnects', '2']).disconnects, [2, 2]);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('rejects a zero disconnect count and inverted range', () => {
    const previous = {
      STAGING_BASE_URL: process.env.STAGING_BASE_URL,
      STAGING_DATABASE_URL: process.env.STAGING_DATABASE_URL,
    };
    process.env.STAGING_BASE_URL = 'https://staging.invalid';
    process.env.STAGING_DATABASE_URL = 'postgres://readonly.invalid/csms';
    try {
      assert.throws(() => optionsFromArgs(['--disconnects', '0']), /MIN >= 1/);
      assert.throws(() => optionsFromArgs(['--disconnects', '3-1']), /MIN >= 1/);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('creates T-41-compatible cumulative Wh samples at the supplied timestamp', () => {
    const sample = makeSample(12345, '2026-10-09T04:00:00.000Z');
    assert.deepEqual(sample, {
      timestamp: '2026-10-09T04:00:00.000Z',
      sampledValue: [{
        value: '12345',
        context: 'Sample.Periodic',
        measurand: 'Energy.Active.Import.Register',
        unit: 'Wh',
      }],
    });
  });

  it('passes only completed sessions whose persisted kWh and meter sample count match the simulator', async () => {
    const expected = {
      code: 'S21-CI-001',
      transactionId: 17,
      disconnectCount: 2,
      meterStart: 20000,
      meterStop: 26250,
      expectedKwh: 6.25,
      firstSampleAt: '2026-10-09T03:59:56.000Z',
      stoppedAt: '2026-10-09T04:00:00.000Z',
    };
    const passed = await readSessionResults({
      query: async () => ({
        rows: [{
          id: 17,
          status: 'COMPLETED',
          meter_start: '20000',
          meter_stop: '26250',
          stopped_at: new Date('2026-10-09T04:00:00.000Z'),
          needs_review: false,
          meter_sample_count: 5,
          first_sample_at: new Date('2026-10-09T03:59:56.000Z'),
          last_sample_at: new Date('2026-10-09T04:00:00.000Z'),
        }],
      }),
    }, [expected], [expected.code]);
    assert.equal(passed[0].systemKwh, 6.25);
    assert.equal(passed[0].passed, true);

    const mismatch = await readSessionResults({
      query: async () => ({
        rows: [{
          id: 17,
          status: 'COMPLETED',
          meter_start: '20000',
          meter_stop: '26000',
          stopped_at: new Date('2026-10-09T04:00:00.000Z'),
          needs_review: false,
          meter_sample_count: 4,
          first_sample_at: new Date('2026-10-09T03:59:56.000Z'),
          last_sample_at: new Date('2026-10-09T04:00:00.000Z'),
        }],
      }),
    }, [expected], [expected.code]);
    assert.equal(mismatch[0].passed, false);
  });
});
