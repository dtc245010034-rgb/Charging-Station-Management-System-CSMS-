const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveEffectiveRate, buildInvoiceSummary } = require('../../src/modules/billing/subscription-pricing');

test('S65-AC-01: gói tháng còn hạn dùng biểu giá gói thay vì trạm và hoá đơn ghi rõ đang áp gói nào', () => {
  const result = resolveEffectiveRate({
    stationTariff: { pricePerKwh: 4000 },
    subscription: {
      id: 'PLAN-01',
      status: 'ACTIVE',
      startsAt: '2026-10-01T00:00:00+07:00',
      expiresAt: '2026-11-01T00:00:00+07:00',
      pricePerKwh: 2800,
      label: 'Gói tháng ưu tiên',
    },
    now: new Date('2026-10-18T08:30:00+07:00'),
  });

  assert.equal(result.source, 'SUBSCRIPTION');
  assert.equal(result.effectiveRate, 2800);
  assert.equal(result.packageLabel, 'Gói tháng ưu tiên');

  const invoice = buildInvoiceSummary({
    stationTariff: { pricePerKwh: 4000 },
    subscription: {
      id: 'PLAN-01',
      status: 'ACTIVE',
      startsAt: '2026-10-01T00:00:00+07:00',
      expiresAt: '2026-11-01T00:00:00+07:00',
      pricePerKwh: 2800,
      label: 'Gói tháng ưu tiên',
    },
    now: new Date('2026-10-18T08:30:00+07:00'),
  });

  assert.equal(invoice.billingSource, 'SUBSCRIPTION');
  assert.equal(invoice.activePackageId, 'PLAN-01');
  assert.equal(invoice.packageLabel, 'Gói tháng ưu tiên');
  assert.equal(invoice.unitPriceDong, 2800);
});

test('S65-AC-02: khi gói hết hạn hoặc không có gói thì quay lại biểu giá trạm', () => {
  const result = resolveEffectiveRate({
    stationTariff: { pricePerKwh: 4500 },
    subscription: {
      id: 'PLAN-02',
      status: 'EXPIRED',
      startsAt: '2026-09-01T00:00:00+07:00',
      expiresAt: '2026-09-30T23:59:00+07:00',
      pricePerKwh: 2600,
      label: 'Gói hết hạn',
    },
    now: new Date('2026-10-18T08:30:00+07:00'),
  });

  assert.equal(result.source, 'STATION');
  assert.equal(result.effectiveRate, 4500);
  assert.equal(result.packageLabel, null);
});
