const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateReservationExpiry, buildNoShowFeeEntry } = require('../../src/modules/reservations/hold');

test('S50-AC-01: quá hạn giữ chỗ mà chưa bắt đầu thì chuyển sang expired và tính phí không đến', () => {
  const reservation = {
    id: 'R-1001',
    status: 'HELD',
    expiresAt: '2026-10-18T08:15:00+07:00',
    startedAt: null,
  };

  const result = evaluateReservationExpiry({
    reservation,
    station: { noShowFeeDong: 50000 },
    now: new Date('2026-10-18T08:16:00+07:00'),
  });

  assert.equal(result.state, 'EXPIRED');
  assert.equal(result.shouldCancelReservation, true);
  assert.equal(result.noShowFeeDong, 50000);
  assert.equal(result.stationCommand, 'CancelReservation');
  assert.equal(result.stationStatus, 'Available');

  const fee = buildNoShowFeeEntry({ reservation, feeDong: 50000 });
  assert.deepEqual(fee, {
    reservationId: 'R-1001',
    entryType: 'RESERVATION_FEE',
    amountDong: 50000,
    reason: 'NO_SHOW_EXPIRED',
    requiresWalletDebit: true,
  });
});

test('S50-AC-02: trước hạn hoặc đã bắt đầu thì không bị quá hạn và không tính phí', () => {
  const stillHeld = evaluateReservationExpiry({
    reservation: {
      id: 'R-1002',
      status: 'HELD',
      expiresAt: '2026-10-18T08:15:00+07:00',
      startedAt: null,
    },
    station: { noShowFeeDong: 50000 },
    now: new Date('2026-10-18T08:10:00+07:00'),
  });

  assert.equal(stillHeld.state, 'HELD');
  assert.equal(stillHeld.shouldCancelReservation, false);
  assert.equal(stillHeld.noShowFeeDong, 0);

  const alreadyStarted = evaluateReservationExpiry({
    reservation: {
      id: 'R-1003',
      status: 'ACTIVE',
      expiresAt: '2026-10-18T08:15:00+07:00',
      startedAt: '2026-10-18T08:05:00+07:00',
    },
    station: { noShowFeeDong: 50000 },
    now: new Date('2026-10-18T08:06:00+07:00'),
  });

  assert.equal(alreadyStarted.state, 'ACTIVE');
  assert.equal(alreadyStarted.shouldCancelReservation, false);
  assert.equal(alreadyStarted.noShowFeeDong, 0);
});
