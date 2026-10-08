const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
process.env.CSMS_SKIP_DOTENV = '1';
process.env.DATABASE_URL ||= 'postgresql://localhost/csms_test';
process.env.JWT_SECRET ||= 'x'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';
const {
  createMeterValuesHandler,
  validatePayload,
  MAX_METER_VALUES,
  MAX_SAMPLED_VALUES,
} = require('../../src/modules/ocpp/handlers/meter-values');
const { createOcppHandlers } = require('../../src/modules/ocpp/handlers');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { OcppCallError } = require('../../src/modules/ocpp/frames');

const samplePayload = {
  connectorId: 1,
  transactionId: 1000,
  meterValue: [
    {
      timestamp: '2026-09-28T20:31:27.905Z',
      sampledValue: [
        { value: '61', context: 'Sample.Periodic', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
        { value: '22000', measurand: 'Power.Active.Import', unit: 'W' },
        { value: '31.9', measurand: 'Current.Import', unit: 'A' },
        { value: '230', measurand: 'Voltage', unit: 'V' },
      ],
    },
    {
      timestamp: '2026-09-28T20:31:37.905Z',
      sampledValue: [
        { value: '71', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
      ],
    },
  ],
};

describe('MeterValues handler (T-41)', () => {
  it('is registered as an OCPP handler', () => {
    const handler = createOcppHandlers({
      ocppPool: { query: async () => ({ rows: [] }) },
      env: {},
    });
    assert.equal(typeof handler.MeterValues, 'function');
  });

  it('validates and parses both meterValue and sampledValue levels', () => {
    const readings = validatePayload(samplePayload, () => Date.parse('2026-09-28T20:31:27.905Z'));
    assert.deepEqual(readings, [
      {
        reportedAt: '2026-09-28T20:31:27.905Z',
        sampledAt: '2026-09-28T20:31:27.905Z',
        measurand: 'Energy.Active.Import.Register',
        value: '61',
        unit: 'Wh',
        phase: '',
        context: 'Sample.Periodic',
      },
      {
        reportedAt: '2026-09-28T20:31:27.905Z',
        sampledAt: '2026-09-28T20:31:27.905Z',
        measurand: 'Power.Active.Import',
        value: '22000',
        unit: 'W',
        phase: '',
        context: '',
      },
      {
        reportedAt: '2026-09-28T20:31:27.905Z',
        sampledAt: '2026-09-28T20:31:27.905Z',
        measurand: 'Current.Import',
        value: '31.9',
        unit: 'A',
        phase: '',
        context: '',
      },
      {
        reportedAt: '2026-09-28T20:31:37.905Z',
        sampledAt: '2026-09-28T20:31:37.905Z',
        measurand: 'Energy.Active.Import.Register',
        value: '71',
        unit: 'Wh',
        phase: '',
        context: '',
      },
    ]);
  });

  it('synchronously looks up connector and inserts supported samples in one bulk query before returning CALLRESULT (D5)', async () => {
    const calls = [];
    const handler = createMeterValuesHandler({
      pool: {
        async query(sql, params) {
          calls.push({ sql, params });
          if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
          return { rowCount: 4, rows: [] };
        },
      },
      now: () => Date.parse('2026-09-28T20:31:27.905Z'),
    });

    assert.deepEqual(
      await handler(samplePayload, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } }),
      {}
    );
    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /LEFT JOIN charging_sessions/);
    assert.deepEqual(calls[0].params, [8, 1, 1000]);
    assert.equal((calls[1].sql.match(/\(\$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+\)/g) || []).length, 4);
    assert.match(calls[1].sql, /ON CONFLICT \(session_id, reported_at, measurand, phase, context\) DO NOTHING/);
    assert.deepEqual(calls[1].params.slice(0, 6), [44, '2026-09-28T20:31:27.905Z', '2026-09-28T20:31:27.905Z', 'Energy.Active.Import.Register', '61', 'Wh']);
  });

  it('stores all samples from each periodic request with a separate batch insert', async () => {
    let batchInserts = 0;
    const handler = createMeterValuesHandler({
      pool: {
        async query(sql) {
          if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
          if (sql.includes('INSERT INTO meter_values')) batchInserts += 1;
          return { rowCount: 1, rows: [] };
        },
      },
      now: () => Date.parse('2026-09-28T20:31:27.905Z'),
    });
    const connection = { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } };

    await handler(samplePayload, { connection });
    await handler(samplePayload, { connection });
    assert.equal(batchInserts, 2);
  });

  it('executes database work synchronously before CALLRESULT is sent (D5)', async () => {
    const events = [];
    const handlers = {
      MeterValues: createMeterValuesHandler({
        pool: {
          async query(sql) {
            if (sql.includes('FROM connectors c')) {
              events.push('database lookup');
              return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
            }
            return { rowCount: 1, rows: [] };
          },
        },
        now: () => Date.parse('2026-09-28T20:31:27.905Z'),
      }),
    };
    const messageHandler = createOcppMessageHandler({
      handlers,
      messageStore: {
        async begin() { return { state: 'new' }; },
        async complete() {
          events.push('dedupe save started');
          await new Promise((resolve) => setImmediate(resolve));
          events.push('dedupe save completed');
        },
        async release() {},
      },
    });
    const connection = {
      chargePointCode: 'CP-TEST',
      chargePoint: { id: 8 },
      send(_frame, callback) {
        events.push('CALLRESULT sent');
        callback();
      },
    };

    await messageHandler.handleMessage(
      connection,
      JSON.stringify([2, 'meter-values-1', 'MeterValues', samplePayload])
    );
    assert.deepEqual(events, [
      'database lookup',
      'dedupe save started',
      'dedupe save completed',
      'CALLRESULT sent',
    ]);
  });

  it('writes readings for an idle connector to orphan_messages synchronously before acknowledging (D5)', async () => {
    const calls = [];
    const handler = createMeterValuesHandler({
      pool: {
        async query(sql, params) {
          calls.push({ sql, params });
          return sql.includes('FROM connectors c')
            ? { rowCount: 1, rows: [{ connector_id: 3, session_id: null }] }
            : { rowCount: 1, rows: [] };
        },
      },
      now: () => Date.parse('2026-09-28T20:31:27.905Z'),
      logWarning: () => {},
    });

    assert.deepEqual(
      await handler(samplePayload, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } }),
      {}
    );
    assert.equal(calls.length, 3);
    assert.match(calls[2].sql, /INSERT INTO orphan_messages/);
    assert.equal(calls[2].params[2], 'NO_ACTIVE_SESSION');
    assert.equal(JSON.parse(calls[2].params[1]).meterValue.length, 2);
  });

  it('enforces D6 clock skew: replaces timestamp > 24h with receivedAt and flags needs_review', async () => {
    const calls = [];
    const fixedNow = new Date('2026-10-07T12:00:00.000Z');
    const handler = createMeterValuesHandler({
      pool: {
        async query(sql, params) {
          calls.push({ sql, params });
          if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
          return { rowCount: 1, rows: [] };
        },
      },
      now: () => fixedNow,
    });

    const skewedPayload = {
      connectorId: 1,
      transactionId: 1000,
      meterValue: [
        {
          timestamp: '1970-01-01T00:00:00.000Z',
          sampledValue: [{ value: '500', measurand: 'Energy.Active.Import.Register', unit: 'Wh' }],
        },
      ],
    };

    await handler(skewedPayload, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } });
    assert.equal(calls.length, 3);
    // call 1: select connector
    // call 2: insert meter_values with the original reported timestamp and normalized sampled_at
    assert.match(calls[1].sql, /INSERT INTO meter_values/);
    assert.equal(calls[1].params[1], '1970-01-01T00:00:00.000Z');
    assert.equal(calls[1].params[2], fixedNow.toISOString());
    // call 3: update charging_sessions with needs_review and CLOCK_SKEW
    assert.match(calls[2].sql, /UPDATE charging_sessions\s+SET needs_review = TRUE/);
    assert.deepEqual(calls[2].params, [44]);
  });

  it('records CHARGE_POINT_MISMATCH when transaction belongs to another charge point (D12)', async () => {
    const calls = [];
    const handler = createMeterValuesHandler({
      pool: {
        async query(sql, params) {
          calls.push({ sql, params });
          if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: null }] };
          if (sql.includes('SELECT charge_point_id FROM charging_sessions')) return { rowCount: 1, rows: [{ charge_point_id: 99 }] };
          return { rowCount: 1, rows: [] };
        },
      },
      now: () => Date.parse('2026-09-28T20:31:27.905Z'),
      logWarning: () => {},
    });

    await handler(samplePayload, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } });
    assert.equal(calls.length, 3);
    assert.match(calls[2].sql, /INSERT INTO orphan_messages/);
    assert.equal(calls[2].params[2], 'CHARGE_POINT_MISMATCH');
  });

  it('rejects malformed payloads with OCPP constraint errors and respects array size limits', () => {
    assert.throws(
      () => validatePayload({ ...samplePayload, connectorId: -1 }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
    assert.throws(
      () => validatePayload({ ...samplePayload, meterValue: [{ timestamp: 'bad', sampledValue: [] }] }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
    assert.throws(
      () => validatePayload({
        ...samplePayload,
        meterValue: [{ timestamp: '2026-09-28T20:31:27.905Z', sampledValue: [{ value: 'NaN' }] }],
      }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
    // Overflow meterValue length
    const tooManyMeterValues = Array(MAX_METER_VALUES + 1).fill({
      timestamp: '2026-09-28T20:31:27.905Z',
      sampledValue: [{ value: '1' }],
    });
    assert.throws(
      () => validatePayload({ ...samplePayload, meterValue: tooManyMeterValues }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
    // Overflow sampledValue length
    const tooManySamples = Array(MAX_SAMPLED_VALUES + 1).fill({ value: '1' });
    assert.throws(
      () => validatePayload({
        ...samplePayload,
        meterValue: [{ timestamp: '2026-09-28T20:31:27.905Z', sampledValue: tooManySamples }],
      }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
  });
});
