'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { effectiveLimitW } = require('../../src/modules/power/schedule');

describe('S-45 / Bảng W01–W04: effectiveLimitW', () => {
  const timezone = 'Asia/Ho_Chi_Minh';
  const baseLimitW = 22000;
  const windows = [
    { id: 1, start_minute: 17 * 60, end_minute: 20 * 60, limit_w: 11000 },
  ];

  it('W01: 16:59:59 giờ trạm -> Hạn mức hiệu lực 22 000 W (nền)', () => {
    // 16:59:59 ICT = 09:59:59 UTC
    const at = '2026-10-18T09:59:59.000Z';
    const result = effectiveLimitW({ baseLimitW, windows, timezone, at });
    assert.deepEqual(result, {
      limitW: 22000,
      source: 'BASE',
    });
  });

  it('W02: 17:00:00 giờ trạm (= 10:00:00 UTC) -> 11 000 W (khung)', () => {
    const at = '2026-10-18T10:00:00.000Z';
    const result = effectiveLimitW({ baseLimitW, windows, timezone, at });
    assert.deepEqual(result, {
      limitW: 11000,
      source: 'WINDOW',
      windowId: 1,
    });
  });

  it('W03: 19:59:59 giờ trạm -> 11 000 W (khung)', () => {
    // 19:59:59 ICT = 12:59:59 UTC
    const at = '2026-10-18T12:59:59.000Z';
    const result = effectiveLimitW({ baseLimitW, windows, timezone, at });
    assert.deepEqual(result, {
      limitW: 11000,
      source: 'WINDOW',
      windowId: 1,
    });
  });

  it('W04: 20:00:00 giờ trạm -> 22 000 W (nền)', () => {
    // 20:00:00 ICT = 13:00:00 UTC
    const at = '2026-10-18T13:00:00.000Z';
    const result = effectiveLimitW({ baseLimitW, windows, timezone, at });
    assert.deepEqual(result, {
      limitW: 22000,
      source: 'BASE',
    });
  });

  it('Trạm không có khung nào -> trả về hạn mức nền', () => {
    const result = effectiveLimitW({ baseLimitW: 15000, windows: [], timezone, at: new Date() });
    assert.deepEqual(result, {
      limitW: 15000,
      source: 'BASE',
    });
  });

  it('Hỗ trợ múi giờ khác UTC (ví dụ UTC+0)', () => {
    const at = '2026-10-18T17:00:00.000Z';
    const resUtc = effectiveLimitW({
      baseLimitW: 22000,
      windows: [{ id: 2, start_minute: 17 * 60, end_minute: 20 * 60, limit_w: 10000 }],
      timezone: 'UTC',
      at,
    });
    assert.equal(resUtc.limitW, 10000);
    assert.equal(resUtc.source, 'WINDOW');
  });
});
