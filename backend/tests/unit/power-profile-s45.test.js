const test = require('node:test');
const assert = require('node:assert/strict');

const { resolvePowerLimit, rebalanceCapacity } = require('../../src/modules/power/plan');

test('S45-AC-01: resolvePowerLimit đổi giới hạn đúng ranh giới khung giờ', () => {
  const station = {
    timezone: 'Asia/Ho_Chi_Minh',
    power_limit_kw: 40,
    power_profile: [
      { start: '00:00', end: '07:00', maxKw: 20 },
      { start: '07:00', end: '09:00', maxKw: 10 },
      { start: '09:00', end: '23:59', maxKw: 30 },
    ],
  };

  assert.equal(resolvePowerLimit(station, new Date('2026-10-18T06:59:59+07:00')), 20);
  assert.equal(resolvePowerLimit(station, new Date('2026-10-18T07:00:00+07:00')), 10);
  assert.equal(resolvePowerLimit(station, new Date('2026-10-18T09:00:00+07:00')), 30);
});

test('S45-AC-02: rebalanceCapacity chia đều nhưng không vượt trạm', () => {
  const result = rebalanceCapacity({
    stationLimitKw: 25,
    activeSessions: [
      { id: 'A', currentKw: 5 },
      { id: 'B', currentKw: 12 },
      { id: 'C', currentKw: 7 },
    ],
  });

  assert.equal(result.totalLimitKw, 25);
  assert.equal(result.sessions.reduce((sum, item) => sum + item.limitKw, 0), 25);
  assert.ok(result.sessions.every((item) => item.limitKw <= 25));
  assert.equal(result.sessions.length, 3);
});
