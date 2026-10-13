const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
process.env.CSMS_SKIP_DOTENV = '1';
process.env.DATABASE_URL ||= 'postgresql://localhost/csms_test';
process.env.JWT_SECRET ||= 'x'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';
const { NotFoundError } = require('../../src/lib/errors');
const { getBySessionId } = require('../../src/modules/billing/invoices.service');

function sessionRow(driverId = '42') {
  return {
    id: '7',
    driver_id: driverId,
    station_owner_id: '10',
    status: 'COMPLETED',
    meter_start: '1000',
    meter_stop: '2000',
  };
}

describe('billing invoices service', () => {
  it('returns the immutable invoice and lines to its driver', async () => {
    const issuedAt = new Date('2026-10-10T12:00:00.000Z');
    const calls = [];
    const db = {
      async query(sql) {
        calls.push(sql);
        if (sql.includes('LEFT JOIN session_invoices')) {
          return {
            rows: [{
              session_id: '7',
              billing_status: 'FINAL',
              billing_reason: null,
              id: '3',
              driver_id: '42',
              station_id: '5',
              tariff_id: '8',
              tariff_snapshot: { version: 2 },
              timezone: 'Asia/Ho_Chi_Minh',
              rounding_rule: 'PER_SEGMENT_HALF_UP',
              total_dong: '12000',
              period_date: '2026-10-10',
              issued_at: issuedAt,
            }],
          };
        }
        if (sql.includes('FROM invoice_lines')) {
          return {
            rows: [{
              seq: 1,
              kind: 'ENERGY',
              local_date: '2026-10-10',
              from_at: issuedAt,
              to_at: issuedAt,
              wh: '1000',
              price_per_kwh: '12000',
              minutes: null,
              per_min_dong: null,
              amount_dong: '12000',
            }],
          };
        }
        return { rows: [sessionRow()] };
      },
    };

    const result = await getBySessionId({ id: '42', roles: ['DRIVER'] }, 7, { db });
    assert.equal(result.billingStatus, 'FINAL');
    assert.equal(result.invoice.totalDong, '12000');
    assert.equal(result.invoice.tariffSnapshot.version, 2);
    assert.equal(result.invoice.lines[0].amountDong, '12000');
    assert.equal(calls.length, 3);
  });

  it('returns billing state without an invoice while finalization is pending', async () => {
    const db = {
      async query(sql) {
        if (sql.includes('LEFT JOIN session_invoices')) {
          return {
            rows: [{
              session_id: '7',
              billing_status: 'WAITING_IDLE',
              billing_reason: null,
              id: null,
            }],
          };
        }
        return { rows: [sessionRow()] };
      },
    };

    const result = await getBySessionId({ id: '42', roles: ['DRIVER'] }, 7, { db });
    assert.equal(result.sessionId, '7');
    assert.equal(result.status, 'PENDING');
    assert.equal(result.billingStatus, 'WAITING_IDLE');
    assert.equal(result.invoice, null);
  });

  it('denies another driver before querying invoice data', async () => {
    let invoiceQueryCalled = false;
    let denyCalled = false;
    const db = {
      async query(sql) {
        if (sql.includes('LEFT JOIN session_invoices')) {
          invoiceQueryCalled = true;
          return { rows: [] };
        }
        return { rows: [sessionRow('99')] };
      },
    };

    await assert.rejects(
      () => getBySessionId(
        { id: '42', roles: ['DRIVER'] },
        7,
        {
          db,
          onDeny: async () => {
            denyCalled = true;
            throw new NotFoundError();
          },
        }
      ),
      (error) => error instanceof NotFoundError
    );
    assert.equal(denyCalled, true);
    assert.equal(invoiceQueryCalled, false);
  });
});
