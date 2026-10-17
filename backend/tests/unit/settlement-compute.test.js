const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeSettlement } = require('../../src/modules/settlement/compute');

describe('settlement/compute', () => {
  const rates = [
    { id: 'A-70', ownerId: 'A', shareBp: 7000, includeIdle: true, effectiveFrom: '2026-01-01' },
    { id: 'A-75', ownerId: 'A', shareBp: 7500, includeIdle: true, effectiveFrom: '2026-10-15' },
    { id: 'B-60', ownerId: 'B', shareBp: 6000, includeIdle: false, effectiveFrom: '2026-01-01' },
  ];

  it('K01-K04: groups invoices by effective rate and rounds each segment half-up', () => {
    const invoices = [
      { ownerId: 'A', periodDate: '2026-09-30', energyDong: '50000', idleDong: '0' },
      { ownerId: 'A', periodDate: '2026-10-10', energyDong: '120000', idleDong: '0' },
      { ownerId: 'A', periodDate: '2026-10-12', energyDong: '80500', idleDong: '12000' },
      { ownerId: 'A', periodDate: '2026-10-14', energyDong: '45250', idleDong: '0' },
      { ownerId: 'A', periodDate: '2026-10-15', energyDong: '200000', idleDong: '6000' },
      { ownerId: 'A', periodDate: '2026-10-20', energyDong: '33333', idleDong: '0' },
      { ownerId: 'A', periodDate: '2026-11-01', energyDong: '70000', idleDong: '0' },
      { ownerId: 'B', periodDate: '2026-10-11', energyDong: '99999', idleDong: '5000' },
      { ownerId: 'B', periodDate: '2026-10-25', energyDong: '10000', idleDong: '2500' },
    ];

    const result = computeSettlement({ month: '2026-10', invoices, rates });
    assert.deepStrictEqual(result.lines, [
      {
        ownerId: 'A',
        rateId: 'A-70',
        shareBp: 7000,
        includeIdle: true,
        fromDate: '2026-10-01',
        toDate: '2026-10-14',
        sessions: 3,
        energyDong: '245750',
        idleDong: '12000',
        baseDong: '257750',
        shareDong: '180425',
        platformDong: '77325',
      },
      {
        ownerId: 'A',
        rateId: 'A-75',
        shareBp: 7500,
        includeIdle: true,
        fromDate: '2026-10-15',
        toDate: '2026-10-31',
        sessions: 2,
        energyDong: '233333',
        idleDong: '6000',
        baseDong: '239333',
        shareDong: '179500',
        platformDong: '59833',
      },
      {
        ownerId: 'B',
        rateId: 'B-60',
        shareBp: 6000,
        includeIdle: false,
        fromDate: '2026-10-01',
        toDate: '2026-10-31',
        sessions: 2,
        energyDong: '109999',
        idleDong: '7500',
        baseDong: '109999',
        shareDong: '65999',
        platformDong: '51500',
      },
    ]);
    assert.deepStrictEqual(result.totals, {
      revenueDong: '614582',
      shareDong: '425924',
      platformDong: '188658',
    });
    assert.deepStrictEqual(result.missingRates, []);
  });

  it('returns missing owner/date pairs rather than treating a missing rate as zero', () => {
    const result = computeSettlement({
      month: '2026-10',
      invoices: [{ ownerId: 'C', periodDate: '2026-10-05', energyDong: '1000', idleDong: '0' }],
      rates,
    });
    assert.deepStrictEqual(result.missingRates, [{ ownerId: 'C', periodDate: '2026-10-05' }]);
  });
});
