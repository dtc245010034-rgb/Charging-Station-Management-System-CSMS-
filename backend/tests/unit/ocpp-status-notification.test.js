const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  OCPP_CONNECTOR_STATUS_MAP,
  UNKNOWN_CONNECTOR_STATUS,
  mapOcppConnectorStatus,
} = require('../../src/modules/connectors/status-mapping');
const { createStatusNotificationHandler } = require('../../src/modules/ocpp/handlers/status-notification');

describe('OCPP connector status mapping', () => {
  it('maps all nine OCPP statuses to the four internal statuses', () => {
    assert.deepEqual(
      Object.fromEntries(Object.entries(OCPP_CONNECTOR_STATUS_MAP)),
      {
        Available: 'AVAILABLE',
        Preparing: 'OCCUPIED',
        Charging: 'OCCUPIED',
        SuspendedEV: 'OCCUPIED',
        SuspendedEVSE: 'OCCUPIED',
        Finishing: 'OCCUPIED',
        Reserved: 'RESERVED',
        Unavailable: 'ERROR',
        Faulted: 'ERROR',
      }
    );
  });

  it('maps unknown values to the internal error state without confusing inherited keys for known states', () => {
    assert.equal(mapOcppConnectorStatus('VendorSpecificState'), UNKNOWN_CONNECTOR_STATUS);
    assert.equal(mapOcppConnectorStatus('__proto__'), UNKNOWN_CONNECTOR_STATUS);
  });
});

describe('StatusNotification handler', () => {
  it('updates the connector status and retains the original OCPP status', async () => {
    const queries = [];
    const pool = {
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rowCount: 1 };
      },
    };
    const handler = createStatusNotificationHandler({ pool });
    const response = await handler(
      { connectorId: 2, status: 'Charging' },
      { connection: { chargePointCode: 'CP-TEST' } }
    );

    assert.deepEqual(response, {});
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /UPDATE connectors/);
    assert.deepEqual(queries[0].params, ['OCCUPIED', 'Charging', 'CP-TEST', 2]);
  });

  it('stores unknown statuses verbatim and acknowledges them without failing', async () => {
    let params;
    const handler = createStatusNotificationHandler({
      pool: {
        query: async (_sql, values) => {
          params = values;
          return { rowCount: 1 };
        },
      },
      logWarning: () => {},
    });

    const response = await handler(
      { connectorId: 1, status: 'VendorSpecificState' },
      { connection: { chargePoint: { code: 'CP-TEST' } } }
    );

    assert.deepEqual(response, {});
    assert.deepEqual(params, ['ERROR', 'VendorSpecificState', 'CP-TEST', 1]);
  });

  it('appends connector error code, vendor code, and reported time when errorCode is not NoError', async () => {
    const queries = [];
    const handler = createStatusNotificationHandler({
      pool: {
        query: async (sql, params) => {
          queries.push({ sql, params });
          return { rowCount: 1 };
        },
      },
    });
    const response = await handler(
      {
        connectorId: 1,
        status: 'Faulted',
        errorCode: 'GroundFailure',
        vendorErrorCode: 'VENDOR-42',
        timestamp: '2026-10-03T04:00:00.000Z',
      },
      { connection: { chargePointCode: 'CP-TEST' } }
    );

    assert.deepEqual(response, {});
    assert.equal(queries.length, 2);
    assert.match(queries[1].sql, /INSERT INTO connector_errors/);
    assert.deepEqual(queries[1].params, [
      'GroundFailure',
      'VENDOR-42',
      '2026-10-03T04:00:00.000Z',
      'CP-TEST',
      1,
    ]);
  });

  it('does not append an error for NoError and does not remove existing error history', async () => {
    const errors = [{ error_code: 'GroundFailure', vendor_error_code: 'VENDOR-42' }];
    const handler = createStatusNotificationHandler({
      pool: {
        query: async (sql, params) => {
          if (sql.includes('INSERT INTO connector_errors')) {
            errors.push({ error_code: params[0], vendor_error_code: params[1] });
          }
          return { rowCount: 1 };
        },
      },
    });

    await handler(
      { connectorId: 1, status: 'Available', errorCode: 'NoError' },
      { connection: { chargePointCode: 'CP-TEST' } }
    );

    assert.deepEqual(errors, [{ error_code: 'GroundFailure', vendor_error_code: 'VENDOR-42' }]);
  });

  it('does not update connector rows for connectorId 0', async () => {
    let queryCalled = false;
    const handler = createStatusNotificationHandler({
      pool: { query: async () => { queryCalled = true; return { rowCount: 1 }; } },
    });
    assert.deepEqual(await handler({ connectorId: 0, status: 'Available' }), {});
    assert.equal(queryCalled, false);
  });

  it('acknowledges undeclared connectors without inserting errors and rate-limits warnings per charge point', async () => {
    const queries = [];
    const warnings = [];
    let currentTime = 1000;
    const handler = createStatusNotificationHandler({
      pool: {
        query: async (sql, params) => {
          queries.push({ sql, params });
          return { rowCount: 0 };
        },
      },
      logWarning: (message) => warnings.push(message),
      now: () => currentTime,
    });

    for (let index = 0; index < 5; index += 1) {
      assert.deepEqual(await handler(
        { connectorId: 3, status: 'Faulted', errorCode: 'GroundFailure' },
        { connection: { chargePointCode: 'CP-TWO-CONNECTORS' } }
      ), {});
    }

    assert.equal(queries.length, 5);
    assert.ok(queries.every(({ sql }) => sql.includes('UPDATE connectors')));
    assert.equal(queries.filter(({ sql }) => sql.includes('INSERT INTO connector_errors')).length, 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /CP-TWO-CONNECTORS/);
    assert.match(warnings[0], /connectorId: 3/);

    currentTime += 60000;
    await handler(
      { connectorId: 3, status: 'Faulted', errorCode: 'GroundFailure' },
      { connection: { chargePointCode: 'CP-TWO-CONNECTORS' } }
    );
    assert.equal(warnings.length, 2);
  });

  it('returns an OCPP internal error when the database update fails', async () => {
    const handler = createStatusNotificationHandler({
      pool: { query: async () => { throw new Error('database unavailable'); } },
      logError: () => {},
    });
    await assert.rejects(
      handler(
        { connectorId: 1, status: 'Available' },
        { connection: { chargePointCode: 'CP-TEST' } }
      ),
      (error) => error.code === 'InternalError'
    );
  });
});
