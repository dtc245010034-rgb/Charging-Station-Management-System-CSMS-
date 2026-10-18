'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BASE, env } = require('../helpers/db');
Object.assign(process.env, env({ DATABASE_URL: BASE }));

const {
  findActiveForDriver,
  fulfillAcceptedReservation,
} = require('../../src/modules/reservations/reservations.repository');

describe('reservations repository - expiry and fulfillment [GYM-74]', () => {
  it('leaves expired reservations for the fee-bearing cleanup job', async () => {
    const executedQueries = [];
    const reservations = [
      { id: 101, driver_id: 5, status: 'ACCEPTED', expires_at: new Date('2026-10-17T10:00:00Z') },
    ];

    const mockClient = {
      async query(sql, params = []) {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT id FROM reservations')) {
          const [driverId] = params;
          const active = reservations.filter(
            (r) => r.driver_id === driverId && ['PENDING', 'ACCEPTED'].includes(r.status)
          );
          return { rowCount: active.length, rows: active };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    const activeBefore = await findActiveForDriver(mockClient, 5);
    assert.strictEqual(activeBefore.id, 101);
    assert.strictEqual(reservations[0].status, 'ACCEPTED');
    assert.equal(executedQueries.some(({ sql }) => sql.includes("SET status = 'EXPIRED'")), false);
  });

  it('keeps active ACCEPTED reservation if still within validity period', async () => {
    const reservations = [
      { id: 102, driver_id: 6, status: 'ACCEPTED', expires_at: new Date('2026-10-17T11:00:00Z') },
    ];

    const mockClient = {
      async query(sql, params = []) {
        if (sql.includes('SELECT id FROM reservations')) {
          const [driverId] = params;
          const active = reservations.filter(
            (r) => r.driver_id === driverId && ['PENDING', 'ACCEPTED'].includes(r.status)
          );
          return { rowCount: active.length, rows: active };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    const active = await findActiveForDriver(mockClient, 6);
    assert.ok(active, 'Đặt chỗ còn hạn phải được trả về');
    assert.strictEqual(active.id, 102);
    assert.strictEqual(reservations[0].status, 'ACCEPTED');
  });

  it('fulfills accepted reservation by driverId regardless of whether idTagId differs', async () => {
    let capturedQuery = null;
    let capturedParams = null;
    const mockDb = {
      async query(sql, params) {
        capturedQuery = sql;
        capturedParams = params;
        return { rowCount: 1, rows: [{ id: 50 }] };
      },
    };

    const result = await fulfillAcceptedReservation(mockDb, {
      reservationId: 1234,
      connectorId: 3,
      driverId: 99,
      idTagId: 888, // Thẻ khác với lúc đặt chỗ
    });

    assert.ok(result);
    assert.strictEqual(result.id, 50);
    assert.match(capturedQuery, /SET status = 'FULFILLED'/);
    assert.match(capturedQuery, /WHERE ocpp_reservation_id = \$1/);
    assert.match(capturedQuery, /AND connector_id = \$2/);
    assert.match(capturedQuery, /AND driver_id = \$3/);
    assert.match(capturedQuery, /AND status = 'ACCEPTED'/);
    // Không được có điều kiện cứng id_tag_id = $4 trong WHERE
    assert.doesNotMatch(capturedQuery, /WHERE[\s\S]*AND id_tag_id = \$4/);
    assert.deepStrictEqual(capturedParams, [1234, 3, 99, 888]);
  });
});
