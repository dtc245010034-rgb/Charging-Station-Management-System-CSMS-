const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveIdleInterval } = require('../../src/modules/billing/resolve-idle-interval');

describe('resolveIdleInterval - xác định khoảng chiếm trụ từ lịch sử trạng thái', () => {
  const stoppedAt = '2026-10-12T02:00:00.000Z';

  it('1. Finishing -> Available: xác định khoảng idle từ Finishing tới Available', () => {
    const events = [
      { occurred_at: '2026-10-12T01:00:00.000Z', ocpp_status: 'Charging' },
      { occurred_at: '2026-10-12T02:00:00.000Z', ocpp_status: 'Finishing' },
      { occurred_at: '2026-10-12T02:20:00.000Z', ocpp_status: 'Available' },
    ];

    const result = resolveIdleInterval(events, { stoppedAt });
    assert.deepEqual(result, {
      hasIdle: true,
      isOpen: false,
      isCapped: false,
      billingReason: null,
      idleInterval: {
        from: '2026-10-12T02:00:00.000Z',
        to: '2026-10-12T02:20:00.000Z',
      },
    });
  });

  it('2. SuspendedEV -> Finishing -> Available (chuỗi liền): from tính từ SuspendedEV', () => {
    const events = [
      { occurred_at: '2026-10-12T01:50:00.000Z', ocpp_status: 'SuspendedEV' },
      { occurred_at: '2026-10-12T02:05:00.000Z', ocpp_status: 'Finishing' },
      { occurred_at: '2026-10-12T02:30:00.000Z', ocpp_status: 'Available' },
    ];

    const result = resolveIdleInterval(events, { stoppedAt });
    assert.deepEqual(result, {
      hasIdle: true,
      isOpen: false,
      isCapped: false,
      billingReason: null,
      idleInterval: {
        from: '2026-10-12T01:50:00.000Z',
        to: '2026-10-12T02:30:00.000Z',
      },
    });
  });

  it('3. Chưa rút súng (mở): trụ còn ở Finishing và chưa quá trần', () => {
    const events = [
      { occurred_at: '2026-10-12T02:00:00.000Z', ocpp_status: 'Finishing' },
    ];
    const now = Date.parse('2026-10-12T02:30:00.000Z'); // 30 phút sau, chưa quá trần 60 phút

    const result = resolveIdleInterval(events, { stoppedAt, maxWaitMinutes: 60, now });
    assert.deepEqual(result, {
      hasIdle: true,
      isOpen: true,
      isCapped: false,
      billingReason: null,
      idleInterval: {
        from: '2026-10-12T02:00:00.000Z',
        to: null,
      },
    });
  });

  it('4. Không có idle: xe rút súng ngay hoặc chuyển Available mà không có sự kiện idle', () => {
    const events = [
      { occurred_at: '2026-10-12T01:00:00.000Z', ocpp_status: 'Charging' },
      { occurred_at: '2026-10-12T02:00:00.000Z', ocpp_status: 'Available' },
    ];

    const result = resolveIdleInterval(events, { stoppedAt });
    assert.deepEqual(result, {
      hasIdle: false,
      isOpen: false,
      isCapped: false,
      billingReason: null,
      idleInterval: null,
    });
  });

  it('5. Charging xen giữa làm chuỗi bắt đầu lại: bỏ chuỗi SuspendedEV cũ', () => {
    const events = [
      { occurred_at: '2026-10-12T01:30:00.000Z', ocpp_status: 'SuspendedEV' },
      { occurred_at: '2026-10-12T01:40:00.000Z', ocpp_status: 'Charging' },
      { occurred_at: '2026-10-12T02:05:00.000Z', ocpp_status: 'Finishing' },
      { occurred_at: '2026-10-12T02:25:00.000Z', ocpp_status: 'Available' },
    ];

    const result = resolveIdleInterval(events, { stoppedAt });
    assert.deepEqual(result, {
      hasIdle: true,
      isOpen: false,
      isCapped: false,
      billingReason: null,
      idleInterval: {
        from: '2026-10-12T02:05:00.000Z',
        to: '2026-10-12T02:25:00.000Z',
      },
    });
  });

  it('6. Quá trần: khoảng mở quá from + maxWaitMinutes chốt tại trần kèm IDLE_CAPPED', () => {
    const events = [
      { occurred_at: '2026-10-12T02:00:00.000Z', ocpp_status: 'Finishing' },
    ];
    const now = Date.parse('2026-10-12T03:30:00.000Z'); // 90 phút sau from, quá trần 60 phút

    const result = resolveIdleInterval(events, { stoppedAt, maxWaitMinutes: 60, now });
    assert.deepEqual(result, {
      hasIdle: true,
      isOpen: false,
      isCapped: true,
      billingReason: 'IDLE_CAPPED',
      idleInterval: {
        from: '2026-10-12T02:00:00.000Z',
        to: '2026-10-12T03:00:00.000Z',
      },
    });
  });

  it('7. Chuỗi SuspendedEV kết thúc trước stoppedAt không tính là chiếm trụ sau phiên', () => {
    const events = [
      { occurred_at: '2026-10-12T01:30:00.000Z', ocpp_status: 'SuspendedEV' },
      { occurred_at: '2026-10-12T01:40:00.000Z', ocpp_status: 'Available' },
    ];

    const result = resolveIdleInterval(events, { stoppedAt });
    assert.deepEqual(result, {
      hasIdle: false,
      isOpen: false,
      isCapped: false,
      billingReason: null,
      idleInterval: null,
    });
  });
});
