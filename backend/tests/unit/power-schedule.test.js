'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { effectiveLimitW } = require('../../src/modules/power/schedule');

describe('power schedule', () => {
  const windows = [{ id: 7, startMinute: 17 * 60, endMinute: 20 * 60, limitW: 11000 }];

  it('W01-W04: applies base and scheduled limits at Ho Chi Minh boundaries', () => {
    const cases = [
      ['2026-10-12T09:59:59.000Z', { limitW: 22000, source: 'BASE' }],
      ['2026-10-12T10:00:00.000Z', { limitW: 11000, source: 'WINDOW', windowId: 7 }],
      ['2026-10-12T12:59:59.000Z', { limitW: 11000, source: 'WINDOW', windowId: 7 }],
      ['2026-10-12T13:00:00.000Z', { limitW: 22000, source: 'BASE' }],
    ];

    for (const [at, expected] of cases) {
      assert.deepStrictEqual(effectiveLimitW({
        baseLimitW: 22000,
        windows,
        timezone: 'Asia/Ho_Chi_Minh',
        at,
      }), expected);
    }
  });

  it('uses the station timezone rather than UTC when selecting a window', () => {
    assert.deepStrictEqual(effectiveLimitW({
      baseLimitW: 22000,
      windows,
      timezone: 'Asia/Kolkata',
      at: '2026-10-12T11:30:00.000Z',
    }), { limitW: 11000, source: 'WINDOW', windowId: 7 });
  });
});
