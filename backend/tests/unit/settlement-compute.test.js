const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeSettlement } = require('../../src/modules/settlement/compute');

describe('S-54: settlement compute pure function (Bảng K01–K05)', () => {
  const month = '2026-10';

  const rates = [
    { id: 1, owner_id: 101, share_bp: 7000, include_idle: true, effective_from: '2026-01-01' },
    { id: 2, owner_id: 101, share_bp: 7500, include_idle: true, effective_from: '2026-10-15' },
    { id: 3, owner_id: 102, share_bp: 6000, include_idle: false, effective_from: '2026-01-01' },
  ];

  const invoices = [
    { id: 1, owner_id: 101, period_date: '2026-09-30', energy_dong: 50000, idle_dong: 0 },
    { id: 2, owner_id: 101, period_date: '2026-10-10', energy_dong: 120000, idle_dong: 0 },
    { id: 3, owner_id: 101, period_date: '2026-10-12', energy_dong: 80500, idle_dong: 12000 },
    { id: 4, owner_id: 101, period_date: '2026-10-14', energy_dong: 45250, idle_dong: 0 },
    { id: 5, owner_id: 101, period_date: '2026-10-15', energy_dong: 200000, idle_dong: 6000 },
    { id: 6, owner_id: 101, period_date: '2026-10-20', energy_dong: 33333, idle_dong: 0 },
    { id: 7, owner_id: 101, period_date: '2026-11-01', energy_dong: 70000, idle_dong: 0 },
    { id: 8, owner_id: 102, period_date: '2026-10-11', energy_dong: 99999, idle_dong: 5000 },
    { id: 9, owner_id: 102, period_date: '2026-10-25', energy_dong: 10000, idle_dong: 2500 },
  ];

  it('K01: A, đoạn 1 (01–14/10, 70%): base = 257 750, share = 180 425', () => {
    const res = computeSettlement({ month, invoices, rates });
    const ownerALines = res.lines.filter((l) => l.owner_id === 101);
    const seg1 = ownerALines.find((l) => l.rate_id === 1);

    assert.ok(seg1, 'Phải có đoạn 1 cho owner A');
    assert.equal(seg1.share_bp, 7000);
    assert.equal(seg1.include_idle, true);
    assert.equal(seg1.sessions, 3);
    assert.equal(seg1.energy_dong, 245750n);
    assert.equal(seg1.idle_dong, 12000n);
    assert.equal(seg1.base_dong, 257750n);
    assert.equal(seg1.share_dong, 180425n);
  });

  it('K02: A, đoạn 2 (15–31/10, 75%): base = 239 333, share = 179 500 (làm tròn nửa lên)', () => {
    const res = computeSettlement({ month, invoices, rates });
    const ownerALines = res.lines.filter((l) => l.owner_id === 101);
    const seg2 = ownerALines.find((l) => l.rate_id === 2);

    assert.ok(seg2, 'Phải có đoạn 2 cho owner A');
    assert.equal(seg2.share_bp, 7500);
    assert.equal(seg2.include_idle, true);
    assert.equal(seg2.sessions, 2);
    assert.equal(seg2.energy_dong, 233333n);
    assert.equal(seg2.idle_dong, 6000n);
    assert.equal(seg2.base_dong, 239333n);
    assert.equal(seg2.share_dong, 179500n);
  });

  it('K03: A, tổng: phải trả 359 925, doanh thu 497 083, nền tảng 137 158', () => {
    const res = computeSettlement({ month, invoices, rates });
    const ownerA = res.byOwner[101];

    assert.ok(ownerA);
    assert.equal(ownerA.revenue_dong, 497083n);
    assert.equal(ownerA.share_dong, 359925n);
    assert.equal(ownerA.platform_dong, 137158n);
  });

  it('K04: B (60%, KHÔNG chia phí chiếm trụ): base = 109 999, share = 65 999, doanh thu 117 499, nền tảng 51 500', () => {
    const res = computeSettlement({ month, invoices, rates });
    const ownerB = res.byOwner[102];

    assert.ok(ownerB);
    assert.equal(ownerB.revenue_dong, 117499n);
    assert.equal(ownerB.share_dong, 65999n);
    assert.equal(ownerB.platform_dong, 51500n);

    const segB = res.lines.find((l) => l.owner_id === 102);
    assert.equal(segB.base_dong, 109999n);
    assert.equal(segB.idle_dong, 7500n);
    assert.equal(segB.share_dong, 65999n);
  });

  it('K05: Toàn bảng kê: revenue_dong = 614 582, share_dong = 425 924, platform_dong = 188 658', () => {
    const res = computeSettlement({ month, invoices, rates });

    assert.equal(res.summary.revenue_dong, 614582n);
    assert.equal(res.summary.share_dong, 425924n);
    assert.equal(res.summary.platform_dong, 188658n);
  });

  it('K06: Thiếu tỉ lệ chia ném lỗi 409 MISSING_RATE', () => {
    const incompleteRates = [
      { id: 1, owner_id: 101, share_bp: 7000, include_idle: true, effective_from: '2026-10-15' },
    ];

    assert.throws(
      () => computeSettlement({ month, invoices, rates: incompleteRates }),
      (err) => err.status === 409 && err.code === 'MISSING_RATE'
    );
  });
});
