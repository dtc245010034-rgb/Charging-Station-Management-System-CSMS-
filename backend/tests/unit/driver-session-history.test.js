const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
process.env.CSMS_SKIP_DOTENV = '1';
process.env.DATABASE_URL ||= 'postgresql://localhost/csms_test';
process.env.JWT_SECRET ||= 'x'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';
const { BadRequestError, ForbiddenError } = require('../../src/lib/errors');
const { getDriverSessionHistory } = require('../../src/modules/sessions/sessions.service');

function historyRow(id, stoppedAt) {
  return {
    id: String(id),
    status: 'COMPLETED',
    started_at: new Date(Date.parse(stoppedAt) - 3_600_000),
    stopped_at: new Date(stoppedAt),
    stop_reason: 'Remote',
    meter_start: '1000',
    meter_stop: '3601000',
    billing_status: 'FINAL',
    billing_reason: null,
    charge_point_code: 'CP-HISTORY',
    connector_no: 1,
    station_name: 'Trạm thử',
    station_address: 'Địa chỉ thử',
    invoice_total_dong: '25000',
  };
}

describe('driver session history', () => {
  it('returns 20 owned sessions and a cursor for the next page', async () => {
    let queryValues;
    const rows = Array.from({ length: 21 }, (_, index) =>
      historyRow(100 - index, `2026-10-${String(13 - Math.floor(index / 24)).padStart(2, '0')}T12:00:00.000Z`)
    );
    const result = await getDriverSessionHistory({ id: '42', roles: ['DRIVER'] }, {
      db: {
        query: async (sql, values) => {
          assert.match(sql, /cs\.driver_id = \$1/);
          assert.match(sql, /cs\.status = 'COMPLETED'/);
          assert.match(sql, /ORDER BY cs\.stopped_at DESC, cs\.id DESC/);
          queryValues = values;
          return { rows };
        },
      },
    });

    assert.deepEqual(queryValues, ['42', null, null, 21]);
    assert.equal(result.items.length, 20);
    assert.equal(result.items[0].id, '100');
    assert.equal(result.items[0].currentKwh, 3600);
    assert.equal(result.items[0].invoiceTotalDong, '25000');
    assert.ok(result.nextCursor);
  });

  it('uses the opaque cursor as a stable timestamp/id boundary', async () => {
    let queryValues;
    const cursor = Buffer.from(JSON.stringify({
      stoppedAt: '2026-10-12T12:00:00.000Z',
      id: '80',
    })).toString('base64url');
    const result = await getDriverSessionHistory({ id: '42', roles: ['DRIVER'] }, {
      cursor,
      db: {
        query: async (_sql, values) => {
          queryValues = values;
          return { rows: [historyRow(79, '2026-10-11T12:00:00.000Z')] };
        },
      },
    });

    assert.deepEqual(queryValues, ['42', '2026-10-12T12:00:00.000Z', '80', 21]);
    assert.equal(result.items.length, 1);
    assert.equal(result.nextCursor, null);
  });

  it('rejects invalid cursors and non-driver callers', async () => {
    let queryCalled = false;
    const db = { query: async () => { queryCalled = true; return { rows: [] }; } };
    await assert.rejects(
      () => getDriverSessionHistory({ id: '42', roles: ['DRIVER'] }, { cursor: 'bad', db }),
      (error) => error instanceof BadRequestError
    );
    await assert.rejects(
      () => getDriverSessionHistory({ id: '42', roles: ['OPERATOR'] }, { db }),
      (error) => error instanceof ForbiddenError
    );
    assert.equal(queryCalled, false);
  });
});
