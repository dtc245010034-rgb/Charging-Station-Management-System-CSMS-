'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BASE, env } = require('../helpers/db');
Object.assign(process.env, env({ DATABASE_URL: BASE }));

const {
  expireStaleForDriver,
  findActiveForDriver,
  fulfillAcceptedReservation,
} = require('../../src/modules/reservations/reservations.repository');

describe('reservations repository - expiry and fulfillment [GYM-74]', () => {
  it('expires stale ACCEPTED reservation and clears driver active lock', async () => {
    const executedQueries = [];
    const reservations = [
      { id: 101, driver_id: 5, status: 'ACCEPTED', expires_at: new Date('2026-10-17T10:00:00Z') },
    ];

    const mockClient = {
      async query(sql, params = []) {
        executedQueries.push({ sql, params });
        if (sql.includes("SET status = 'EXPIRED'")) {
          const [driverId, now] = params;
          for (const r of reservations) {
            if (r.driver_id === driverId && r.status === 'ACCEPTED' && r.expires_at <= new Date(now)) {
              r.status = 'EXPIRED';
            }
          }
          return { rowCount: 1, rows: [] };
        }
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

    const now = new Date('2026-10-17T10:30:00Z'); // Sau expires_at
    await expireStaleForDriver(mockClient, 5, now);
    const activeBefore = await findActiveForDriver(mockClient, 5, now);
    assert.strictEqual(activeBefore, null, 'Đặt chỗ quá hạn phải được chuyển sang EXPIRED và trả về null');
    assert.strictEqual(reservations[0].status, 'EXPIRED');
  });

  it('keeps active ACCEPTED reservation if still within validity period', async () => {
    const reservations = [
      { id: 102, driver_id: 6, status: 'ACCEPTED', expires_at: new Date('2026-10-17T11:00:00Z') },
    ];

    const mockClient = {
      async query(sql, params = []) {
        if (sql.includes("SET status = 'EXPIRED'")) {
          const [driverId, now] = params;
          for (const r of reservations) {
            if (r.driver_id === driverId && r.status === 'ACCEPTED' && r.expires_at <= new Date(now)) {
              r.status = 'EXPIRED';
            }
          }
          return { rowCount: 0, rows: [] };
        }
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

    const now = new Date('2026-10-17T10:30:00Z'); // Trước expires_at
    const active = await findActiveForDriver(mockClient, 6, now);
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
