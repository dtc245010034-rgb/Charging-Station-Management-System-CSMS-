const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
process.env.CSMS_SKIP_DOTENV = '1';
process.env.DATABASE_URL ||= 'postgresql://localhost/csms_test';
process.env.JWT_SECRET ||= 'x'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';
const {
  createMeterValuesHandler,
  validatePayload,
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

function flushDeferredWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('MeterValues handler (T-41)', () => {
  it('is registered as an OCPP handler', () => {
    const handler = createOcppHandlers({
      ocppPool: { query: async () => ({ rows: [] }) },
      env: {},
    });
    assert.equal(typeof handler.MeterValues, 'function');
  });

  it('validates and parses both meterValue and sampledValue levels', () => {
    const readings = validatePayload(samplePayload);
    assert.deepEqual(readings, [
      {
        sampledAt: '2026-09-28T20:31:27.905Z',
        measurand: 'Energy.Active.Import.Register',
        value: '61',
        unit: 'Wh',
      },
      {
        sampledAt: '2026-09-28T20:31:27.905Z',
        measurand: 'Power.Active.Import',
        value: '22000',
        unit: 'W',
      },
      {
        sampledAt: '2026-09-28T20:31:27.905Z',
        measurand: 'Current.Import',
        value: '31.9',
        unit: 'A',
      },
      {
        sampledAt: '2026-09-28T20:31:37.905Z',
        measurand: 'Energy.Active.Import.Register',
        value: '71',
        unit: 'Wh',
      },
    ]);
  });

  it('returns CALLRESULT before looking up the connector and inserts supported samples in one bulk query', async () => {
    const calls = [];
    const handler = createMeterValuesHandler({
      pool: {
        async query(sql, params) {
          calls.push({ sql, params });
          if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
          return { rowCount: 4, rows: [] };
        },
      },
    });

    assert.deepEqual(
      await handler(samplePayload, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } }),
      {}
    );
    assert.deepEqual(calls, []);

    await flushDeferredWork();
    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /LEFT JOIN charging_sessions/);
    assert.deepEqual(calls[0].params, [8, 1, 1000]);
    assert.equal((calls[1].sql.match(/\(\$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+\)/g) || []).length, 4);
    assert.match(calls[1].sql, /ON CONFLICT \(session_id, measurand, sampled_at\) DO NOTHING/);
    assert.deepEqual(calls[1].params.slice(0, 5), [44, '2026-09-28T20:31:27.905Z', 'Energy.Active.Import.Register', '61', 'Wh']);
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
    });
    const connection = { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } };

    await handler(samplePayload, { connection });
    await flushDeferredWork();
    await handler(samplePayload, { connection });
    await flushDeferredWork();
    assert.equal(batchInserts, 2);
  });

  it('starts database work only after the CALLRESULT is sent, including with message deduplication', async () => {
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
      'dedupe save started',
      'dedupe save completed',
      'CALLRESULT sent',
      'database lookup',
    ]);
  });

  it('writes readings for an idle connector to orphan_messages after acknowledging the call', async () => {
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
      logWarning: () => {},
    });

    assert.deepEqual(
      await handler(samplePayload, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } }),
      {}
    );
    assert.deepEqual(calls, []);
    await flushDeferredWork();
    assert.equal(calls.length, 2);
    assert.match(calls[1].sql, /INSERT INTO orphan_messages/);
    assert.equal(calls[1].params[2], 'NO_ACTIVE_SESSION');
    assert.equal(JSON.parse(calls[1].params[1]).meterValue.length, 2);
  });

  it('rejects malformed payloads with OCPP constraint errors', () => {
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
  });
});
