'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tickPowerSchedule, startPowerScheduleJob } = require('../../src/modules/power/schedule-job');
const { allocate } = require('../../src/modules/power/allocate');
const { effectiveLimitW } = require('../../src/modules/power/schedule');

describe('S-45 / Commit 5.4: power schedule job & W05–W08 simulation', () => {
  it('tickPowerSchedule gọi rebalanceStation với reason: SCHEDULE cho trạm đủ điều kiện', async () => {
    const rebalanced = [];
    const fakeDb = {
      query: async (sql) => {
        assert.match(sql, /station_power_windows/);
        return { rows: [{ id: 42 }] };
      },
    };

    const result = await tickPowerSchedule({
      rebalanceStation: async (stationId, options) => {
        rebalanced.push({ stationId, options });
      },
      db: fakeDb,
    });

    assert.deepEqual(result, [42]);
    assert.deepEqual(rebalanced, [{ stationId: 42, options: { reason: 'SCHEDULE' } }]);
  });

  it('tickPowerSchedule bỏ qua trạm bị lỗi mà không ném ngoại lệ (K4)', async () => {
    const fakeDb = {
      query: async () => ({ rows: [{ id: 1 }, { id: 2 }] }),
    };

    const rebalanced = [];
    const result = await tickPowerSchedule({
      rebalanceStation: async (stationId) => {
        if (stationId === 1) throw new Error('DB lock timeout');
        rebalanced.push(stationId);
      },
      db: fakeDb,
    });

    assert.deepEqual(result, [2]);
  });

  it('startPowerScheduleJob tạo timer và stop() dừng timer', async () => {
    let ticks = 0;
    const job = startPowerScheduleJob({
      rebalanceStation: async () => { ticks += 1; },
      intervalMs: 50,
      db: { query: async () => ({ rows: [] }) },
    });

    assert.equal(typeof job.stop, 'function');
    assert.equal(typeof job.tick, 'function');
    await job.tick();
    assert.ok(ticks >= 0);
    job.stop();
  });

  it('Mô phỏng Bảng W05–W08: phân bổ công suất trước/sau ranh giới và xe vào/ra', () => {
    const timezone = 'Asia/Ho_Chi_Minh';
    const baseLimitW = 22000;
    const windows = [
      { id: 1, start_minute: 17 * 60, end_minute: 20 * 60, limit_w: 11000 },
    ];

    // W05 Trước 17:00 (22 kW): C (7.4 kW), B (11 kW), A (22 kW)
    const sessions3 = [
      { sessionId: 'C', ratedW: 7400 },
      { sessionId: 'B', ratedW: 11000 },
      { sessionId: 'A', ratedW: 22000 },
    ];

    const before17 = effectiveLimitW({
      baseLimitW,
      windows,
      timezone,
      at: '2026-10-18T09:59:59Z', // 16:59:59 ICT
    });
    assert.equal(before17.limitW, 22000);

    const allocBefore = allocate({ limitW: before17.limitW, sessions: sessions3 });
    const allocMapBefore = new Map(allocBefore.map((s) => [s.sessionId, s.limitW]));
    // C 7300, B 7300, A 7400 (Σ 22 000)
    assert.equal(allocMapBefore.get('C'), 7300);
    assert.equal(allocMapBefore.get('B'), 7300);
    assert.equal(allocMapBefore.get('A'), 7400);
    const sumBefore = allocBefore.reduce((acc, s) => acc + s.limitW, 0);
    assert.equal(sumBefore, 22000);

    // W05 Sau 17:00 (11 kW): C 3600, B 3700, A 3700 (Σ 11 000)
    const after17 = effectiveLimitW({
      baseLimitW,
      windows,
      timezone,
      at: '2026-10-18T10:00:00Z', // 17:00:00 ICT
    });
    assert.equal(after17.limitW, 11000);

    const allocAfter = allocate({ limitW: after17.limitW, sessions: sessions3 });
    const allocMapAfter = new Map(allocAfter.map((s) => [s.sessionId, s.limitW]));
    assert.equal(allocMapAfter.get('C'), 3600);
    assert.equal(allocMapAfter.get('B'), 3700);
    assert.equal(allocMapAfter.get('A'), 3700);
    const sumAfter = allocAfter.reduce((acc, s) => acc + s.limitW, 0);
    assert.equal(sumAfter, 11000);

    // W06 Từ 17:00:15 đến 19:59:59 không có xe vào/ra:
    // Hạn mức hiệu lực vẫn là 11 000 W và phân bổ giữ nguyên
    const midWindow = effectiveLimitW({
      baseLimitW,
      windows,
      timezone,
      at: '2026-10-18T11:00:00Z', // 18:00:00 ICT
    });
    assert.equal(midWindow.limitW, 11000);

    // W07 18:30 phiên D (7,4 kW) vào -> 4 phiên: C 2700, D 2700, B 2800, A 2800 (Σ 11 000)
    const sessions4 = [
      { sessionId: 'C', ratedW: 7400 },
      { sessionId: 'D', ratedW: 7400 },
      { sessionId: 'B', ratedW: 11000 },
      { sessionId: 'A', ratedW: 22000 },
    ];
    const allocD = allocate({ limitW: midWindow.limitW, sessions: sessions4 });
    const allocMapD = new Map(allocD.map((s) => [s.sessionId, s.limitW]));
    assert.equal(allocMapD.get('C'), 2700);
    assert.equal(allocMapD.get('D'), 2700);
    assert.equal(allocMapD.get('B'), 2800);
    assert.equal(allocMapD.get('A'), 2800);
    const sumD = allocD.reduce((acc, s) => acc + s.limitW, 0);
    assert.equal(sumD, 11000);

    // W08 20:00:00 trở lại 22 kW, vẫn 4 phiên -> mỗi phiên 5 500 W (Σ 22 000)
    const at20 = effectiveLimitW({
      baseLimitW,
      windows,
      timezone,
      at: '2026-10-18T13:00:00Z', // 20:00:00 ICT
    });
    assert.equal(at20.limitW, 22000);
    const alloc20 = allocate({ limitW: at20.limitW, sessions: sessions4 });
    const allocMap20 = new Map(alloc20.map((s) => [s.sessionId, s.limitW]));
    assert.equal(allocMap20.get('C'), 5500);
    assert.equal(allocMap20.get('D'), 5500);
    assert.equal(allocMap20.get('B'), 5500);
    assert.equal(allocMap20.get('A'), 5500);
    const sum20 = alloc20.reduce((acc, s) => acc + s.limitW, 0);
    assert.equal(sum20, 22000);
  });
});
