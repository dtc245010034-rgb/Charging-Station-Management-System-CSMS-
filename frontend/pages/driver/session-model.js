import { formatNumber } from '../../app/format.js';

// Dưới 1 kW giữ đơn vị W để 400 W không thành "0 kW"; từ 1 kW làm tròn 2 chữ số để 3680 W thành "3,68 kW".
export function formatPower(watts) {
  if (watts === null || watts === undefined) return '—';
  const value = Number(watts);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (Math.round(value) < 1000) return `${formatNumber(Math.round(value))} W`;
  return `${formatNumber(Math.round(value / 10) / 100)} kW`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export function elapsedSeconds(startedAt, endedAt) {
  const start = startedAt ? Date.parse(startedAt) : Number.NaN;
  const end = endedAt ? Date.parse(endedAt) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function endStateOf(status) {
  if (status === 'COMPLETED') {
    return { badge: 'ĐÃ KẾT THÚC', badgeClass: 'badge--neutral', dotClass: 'dot--offline', title: 'Phiên sạc đã kết thúc' };
  }
  if (status === 'ABNORMAL') {
    return { badge: 'BỊ GIÁN ĐOẠN', badgeClass: 'badge--warning', dotClass: 'dot--warning', title: 'Phiên sạc bị gián đoạn' };
  }
  return { badge: 'ĐÃ DỪNG', badgeClass: 'badge--neutral', dotClass: 'dot--offline', title: 'Phiên sạc đã dừng' };
}

// shown: { id, status } của phiên đang hiển thị, hoặc null khi trang trống/đang tải.
// incoming: đối tượng phiên lấy từ payload.session của sự kiện SSE.
// Quy tắc không phụ thuộc thứ tự tới của các sự kiện: CHARGING của phiên đã kết thúc bị bỏ, kết thúc của phiên không hiện bị bỏ.
export function decideAction(shown, incoming) {
  if (!incoming || incoming.id === null || incoming.id === undefined) return 'ignore';
  const same = Boolean(shown) && shown.id === incoming.id;
  if (incoming.status === 'CHARGING') {
    if (!same) return 'show-live';
    return shown.status === 'CHARGING' ? 'update-live' : 'ignore';
  }
  return same && shown.status === 'CHARGING' ? 'show-ended' : 'ignore';
}
