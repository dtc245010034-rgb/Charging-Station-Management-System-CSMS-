const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateDriverCancellation } = require('../../src/modules/reservations/cancel');

test('S51-AC-01: huỷ chỗ trước hạn thì gửi CancelReservation, trả về Available và không tính phí', () => {
  const decision = evaluateDriverCancellation({
    reservation: {
      id: 'R-2001',
      status: 'HELD',
      expiresAt: '2026-10-18T08:15:00+07:00',
      startedAt: null,
    },
    now: new Date('2026-10-18T08:10:00+07:00'),
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.stationCommand, 'CancelReservation');
  assert.equal(decision.stationStatus, 'Available');
  assert.equal(decision.feeDong, 0);
  assert.equal(decision.reason, 'DRIVER_CANCELLED_BEFORE_EXPIRY');
});

test('S51-AC-02: huỷ sau khi đã quá hạn thì không được vì đã tính phí', () => {
  const decision = evaluateDriverCancellation({
    reservation: {
      id: 'R-2002',
      status: 'HELD',
      expiresAt: '2026-10-18T08:15:00+07:00',
      startedAt: null,
    },
    now: new Date('2026-10-18T08:16:00+07:00'),
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.stationCommand, null);
  assert.equal(decision.stationStatus, null);
  assert.equal(decision.feeDong, 0);
  assert.equal(decision.reason, 'EXPIRED_ALREADY');
});
