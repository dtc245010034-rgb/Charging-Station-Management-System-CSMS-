const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BASE, env } = require('../helpers/db');
Object.assign(process.env, env({ DATABASE_URL: BASE }));

const { expireReservationsOnce } = require('../../src/modules/reservations/expiry-job');
const { sendCancelReservation } = require('../../src/modules/reservations/cancel-retry-job');

describe('reservation-expiry-job unit tests', () => {
  it('expires ACCEPTED reservation, debits wallet fee, audits, and sends CancelReservation', async () => {
    let cancelStatusSent = false;

    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FOR UPDATE')) {
          return {
            rowCount: 1,
            rows: [{
              id: 101,
              ocpp_reservation_id: 55,
              driver_id: 10,
              connector_id: 2,
              created_at: new Date(Date.now() - 3600000).toISOString(),
              expires_at: new Date(Date.now() - 60000).toISOString(),
              no_show_fee_dong: 20000,
              status: 'ACCEPTED',
              charge_point_code: 'CP-01',
            }],
          };
        }
        if (sql.includes('charging_sessions')) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes("status = 'EXPIRED'")) {
          return { rowCount: 1, rows: [{ id: 101 }] };
        }
        if (sql.includes('wallets') || sql.includes('wallet_ledger')) {
          return { rowCount: 1, rows: [{ id: 1, balance_dong: '30000' }] };
        }
        return { rowCount: 0, rows: [] };
      },
      release: () => {},
    };

    const mockDb = {
      query: async (sql) => {
        if (sql.includes("status = 'ACCEPTED'")) {
          return { rowCount: 1, rows: [{ id: 101 }] };
        }
        if (sql.includes("cancel_status = 'SENT'")) {
          cancelStatusSent = true;
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
      connect: async () => mockClient,
    };

    const mockCommandSender = {
      send: async (code, action, payload) => {
        return { status: 'Accepted', code, action, payload };
      },
    };

    const result = await expireReservationsOnce({
      db: mockDb,
      commandSender: mockCommandSender,
      now: new Date(),
    });

    assert.equal(result.candidates, 1);
    assert.equal(result.expired, 1);
    assert.equal(result.fulfilled, 0);
    assert.equal(cancelStatusSent, true);
  });

  it('marks FULFILLED and does not charge fee if charging session started in [created_at, expires_at]', async () => {
    let fulfilledUpdated = false;

    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FOR UPDATE')) {
          return {
            rowCount: 1,
            rows: [{
              id: 102,
              ocpp_reservation_id: 56,
              driver_id: 10,
              connector_id: 2,
              created_at: new Date(Date.now() - 3600000).toISOString(),
              expires_at: new Date(Date.now() - 60000).toISOString(),
              no_show_fee_dong: 20000,
              status: 'ACCEPTED',
              charge_point_code: 'CP-01',
            }],
          };
        }
        if (sql.includes('charging_sessions')) {
          return { rowCount: 1, rows: [{ '?column?': 1 }] };
        }
        if (sql.includes("status = 'FULFILLED'")) {
          fulfilledUpdated = true;
          return { rowCount: 1, rows: [{ id: 102 }] };
        }
        return { rowCount: 0, rows: [] };
      },
      release: () => {},
    };

    const mockDb = {
      query: async (sql) => {
        if (sql.includes("status = 'ACCEPTED'")) {
          return { rowCount: 1, rows: [{ id: 102 }] };
        }
        return { rowCount: 0, rows: [] };
      },
      connect: async () => mockClient,
    };

    const result = await expireReservationsOnce({
      db: mockDb,
      commandSender: { send: async () => assert.fail('should not call cancel on fulfilled') },
      now: new Date(),
    });

    assert.equal(result.candidates, 1);
    assert.equal(result.fulfilled, 1);
    assert.equal(result.expired, 0);
    assert.equal(fulfilledUpdated, true);
  });

  it('when fee = 0, marks EXPIRED without debiting fee and still sends CancelReservation', async () => {
    let cancelCalled = false;

    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FOR UPDATE')) {
          return {
            rowCount: 1,
            rows: [{
              id: 103,
              ocpp_reservation_id: 57,
              driver_id: 10,
              connector_id: 2,
              created_at: new Date(Date.now() - 3600000).toISOString(),
              expires_at: new Date(Date.now() - 60000).toISOString(),
              no_show_fee_dong: 0,
              status: 'ACCEPTED',
              charge_point_code: 'CP-01',
            }],
          };
        }
        if (sql.includes('charging_sessions')) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes("status = 'EXPIRED'")) {
          return { rowCount: 1, rows: [{ id: 103 }] };
        }
        if (sql.includes('wallet_ledger')) {
          assert.fail('should not write to wallet_ledger when fee is 0');
        }
        return { rowCount: 0, rows: [] };
      },
      release: () => {},
    };

    const mockDb = {
      query: async (sql) => {
        if (sql.includes("status = 'ACCEPTED'")) {
          return { rowCount: 1, rows: [{ id: 103 }] };
        }
        return { rowCount: 0, rows: [] };
      },
      connect: async () => mockClient,
    };

    const result = await expireReservationsOnce({
      db: mockDb,
      commandSender: {
        send: async () => {
          cancelCalled = true;
          return { status: 'Accepted' };
        },
      },
      now: new Date(),
    });

    assert.equal(result.candidates, 1);
    assert.equal(result.expired, 1);
    assert.equal(cancelCalled, true);
  });

  it('cancel-retry-job marks FAILED and inserts alert when attempts reach 5', async () => {
    let alertCreated = false;
    const mockDb = {
      query: async (sql, params) => {
        if (sql.includes('cancel_attempts = cancel_attempts + 1')) {
          return {
            rowCount: 1,
            rows: [{ cancel_status: 'FAILED', cancel_attempts: 5, connector_id: 2 }],
          };
        }
        if (sql.includes('SELECT r.id, r.connector_id')) {
          return {
            rowCount: 1,
            rows: [{ id: 104, connector_id: 2, charge_point_id: 3, station_id: 4 }],
          };
        }
        if (sql.includes('INSERT INTO alerts')) {
          alertCreated = true;
          assert.equal(params[0], 4); // station_id
          assert.equal(params[1], 3); // charge_point_id
          assert.equal(params[2], 2); // connector_id
          assert.equal(params[5], 'res:104'); // dedup_key
          return { rowCount: 1, rows: [{ id: 99 }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const mockCommandSender = {
      send: async () => {
        throw new Error('Charge point offline');
      },
    };

    const success = await sendCancelReservation({
      db: mockDb,
      commandSender: mockCommandSender,
      reservationId: 104,
      chargePointCode: 'CP-01',
      ocppReservationId: 58,
    });

    assert.equal(success, false);
    assert.equal(alertCreated, true);
  });
});
