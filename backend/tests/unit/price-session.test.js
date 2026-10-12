const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { priceSession } = require('../../src/modules/billing/price-session');

const handCases = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/billing/hand-cases.json'), 'utf8')
);

describe('billing/price-session: một khung [GYM-56]', () => {
  it('tính đúng ca C01 (Một khung, kWh tròn)', () => {
    const c01 = handCases.find((c) => c.id === 'C01');
    assert.ok(c01);
    const result = priceSession(c01.input);

    assert.equal(result.totalDong, c01.expected.totalDong);
    assert.equal(result.roundingRule, c01.expected.roundingRule);
    assert.equal(result.lines.length, c01.expected.lines.length);
    assert.equal(result.lines[0].wh, c01.expected.lines[0].wh);
    assert.equal(result.lines[0].amountDong, c01.expected.lines[0].amountDong);
    assert.equal(result.lines[0].localDate, c01.expected.lines[0].localDate);
  });

  it('tính đúng ca C02 (Một khung, kWh lẻ -> làm tròn nửa lên)', () => {
    const c02 = handCases.find((c) => c.id === 'C02');
    assert.ok(c02);
    const result = priceSession(c02.input);

    assert.equal(result.totalDong, c02.expected.totalDong);
    assert.equal(result.lines[0].amountDong, 7503);
  });

  it('tính đúng ca C17 (Phiên 0 kWh)', () => {
    const c17 = handCases.find((c) => c.id === 'C17');
    assert.ok(c17);
    const result = priceSession(c17.input);

    assert.equal(result.totalDong, 0);
    assert.equal(result.lines[0].wh, 0);
    assert.equal(result.lines[0].amountDong, 0);
  });

  it('bảo toàn bất biến tổng Wh các đoạn = meterStopWh - meterStartWh', () => {
    const input = {
      startedAt: '2026-10-12T01:00:00.000Z',
      stoppedAt: '2026-10-12T02:00:00.000Z',
      meterStartWh: 1234,
      meterStopWh: 5678,
      timezone: 'Asia/Ho_Chi_Minh',
      tariff: {
        periods: [{ startMin: 0, endMin: 1440, pricePerKwh: 3500 }],
      },
    };
    const result = priceSession(input);
    const totalWh = result.lines.filter((l) => l.kind === 'ENERGY').reduce((sum, l) => sum + l.wh, 0);
    assert.equal(totalWh, input.meterStopWh - input.meterStartWh);
  });
});
