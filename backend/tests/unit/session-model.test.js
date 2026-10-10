const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(__dirname, '../../../frontend', file)).href);

describe('frontend/pages/driver/session-model', () => {
  describe('formatPower', async () => {
    const { formatPower } = await load('pages/driver/session-model.js');
    const { formatNumber } = await load('app/format.js');

    it('3680 W -> 3,68 kW (không làm tròn thành 4 kW)', () => {
      assert.equal(formatPower(3680), `${formatNumber(3.68)} kW`);
    });

    it('400 W giữ đơn vị W (không thành 0 kW)', () => {
      assert.equal(formatPower(400), `${formatNumber(400)} W`);
    });

    it('7200 W -> 7,2 kW và 22000 W -> 22 kW', () => {
      assert.equal(formatPower(7200), `${formatNumber(7.2)} kW`);
      assert.equal(formatPower(22000), `${formatNumber(22)} kW`);
    });

    it('999.6 W làm tròn lên 1 kW, không hiện "1000 W"', () => {
      assert.equal(formatPower(999.6), `${formatNumber(1)} kW`);
    });

    it('0 W -> 0 W', () => {
      assert.equal(formatPower(0), `${formatNumber(0)} W`);
    });

    it('thiếu, âm hoặc không phải số -> —', () => {
      for (const value of [null, undefined, -5, Number.NaN, 'abc']) {
        assert.equal(formatPower(value), '—', String(value));
      }
    });
  });

  describe('formatDuration / elapsedSeconds', async () => {
    const { formatDuration, elapsedSeconds } = await load('pages/driver/session-model.js');

    it('formatDuration: mm:ss và hh:mm:ss', () => {
      assert.equal(formatDuration(65), '01:05');
      assert.equal(formatDuration(3725), '01:02:05');
      assert.equal(formatDuration(-1), '00:00');
      assert.equal(formatDuration(Number.NaN), '00:00');
    });

    it('elapsedSeconds: khoảng giữa hai mốc ISO, null nếu thiếu mốc', () => {
      assert.equal(elapsedSeconds('2026-10-10T00:00:00Z', '2026-10-10T00:10:30Z'), 630);
      assert.equal(elapsedSeconds('2026-10-10T00:00:00Z', null), null);
      assert.equal(elapsedSeconds(null, '2026-10-10T00:10:30Z'), null);
      assert.equal(elapsedSeconds('2026-10-10T00:10:00Z', '2026-10-10T00:00:00Z'), 0);
    });
  });

  describe('endStateOf', async () => {
    const { endStateOf } = await load('pages/driver/session-model.js');

    it('COMPLETED, ABNORMAL và trạng thái khác có nhãn tiếng Việt riêng', () => {
      assert.equal(endStateOf('COMPLETED').badge, 'ĐÃ KẾT THÚC');
      assert.equal(endStateOf('COMPLETED').title, 'Phiên sạc đã kết thúc');
      assert.equal(endStateOf('ABNORMAL').badge, 'BỊ GIÁN ĐOẠN');
      assert.equal(endStateOf('ABNORMAL').badgeClass, 'badge--warning');
      assert.equal(endStateOf('KHAC').badge, 'ĐÃ DỪNG');
    });
  });

  describe('decideAction', async () => {
    const { decideAction } = await load('pages/driver/session-model.js');
    const live = (id) => ({ id, status: 'CHARGING' });

    it('không có sự kiện hợp lệ -> ignore', () => {
      assert.equal(decideAction(live(1), null), 'ignore');
      assert.equal(decideAction(live(1), {}), 'ignore');
    });

    it('trang trống + CHARGING -> show-live', () => {
      assert.equal(decideAction(null, { id: 1, status: 'CHARGING' }), 'show-live');
    });

    it('đang hiện phiên 1 + CHARGING của phiên 1 -> update-live', () => {
      assert.equal(decideAction(live(1), { id: 1, status: 'CHARGING' }), 'update-live');
    });

    it('đang hiện phiên 1 + CHARGING của phiên 2 -> show-live (chuyển sang phiên mới)', () => {
      assert.equal(decideAction(live(1), { id: 2, status: 'CHARGING' }), 'show-live');
    });

    it('đang hiện phiên 1 + COMPLETED hoặc ABNORMAL của phiên 1 -> show-ended', () => {
      assert.equal(decideAction(live(1), { id: 1, status: 'COMPLETED' }), 'show-ended');
      assert.equal(decideAction(live(1), { id: 1, status: 'ABNORMAL' }), 'show-ended');
    });

    it('kết thúc của phiên không đang hiện -> ignore', () => {
      assert.equal(decideAction(live(1), { id: 2, status: 'COMPLETED' }), 'ignore');
      assert.equal(decideAction(null, { id: 2, status: 'COMPLETED' }), 'ignore');
    });

    it('CHARGING cũ đến sau khi phiên đó đã kết thúc -> ignore', () => {
      const ended = { id: 1, status: 'COMPLETED' };
      assert.equal(decideAction(ended, { id: 1, status: 'CHARGING' }), 'ignore');
    });

    it('kết thúc lặp lại cho phiên đã hiện kết thúc -> ignore', () => {
      const ended = { id: 1, status: 'COMPLETED' };
      assert.equal(decideAction(ended, { id: 1, status: 'COMPLETED' }), 'ignore');
    });

    it('thay phiên trên cùng đầu nối: hai thứ tự sự kiện đều kết thúc ở phiên mới', () => {
      const apply = (shown, event) => {
        const action = decideAction(shown, event);
        if (action === 'ignore') return shown;
        return { id: event.id, status: event.status };
      };
      const oldAbnormal = { id: 1, status: 'ABNORMAL' };
      const newCharging = { id: 2, status: 'CHARGING' };

      const orderA = [oldAbnormal, newCharging].reduce(apply, live(1));
      const orderB = [newCharging, oldAbnormal].reduce(apply, live(1));

      assert.deepEqual(orderA, { id: 2, status: 'CHARGING' });
      assert.deepEqual(orderB, { id: 2, status: 'CHARGING' });
    });
  });
});
