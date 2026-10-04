import { h } from '../app/dom.js';
import { groupOf, pointLabel, statusLabel, stationStatusLabels } from '../app/status.js';

// Badge trạng thái trụ/đầu nối: hiện nhóm dễ đọc, giữ nguyên giá trị OCPP gốc trong tooltip.
export function statusBadge(status, ocppStatus = status, group = groupOf(status), label = statusLabel(status, group)) {
  return h('span', { class: `badge badge--${group}`, title: `Trạng thái gốc: ${ocppStatus ?? 'UNKNOWN'}` },
    h('span', { class: `dot dot--${group}`, 'aria-hidden': 'true' }), label);
}

export const pointStatusBadge = (point, group) => statusBadge(point.status, point.status, group, pointLabel(point.status, group));

// Lỗi báo ở mức cả trụ (StatusNotification connectorId 0); chỉ hiện khi có mã lỗi, không đổi trạng thái ONLINE của trụ.
export function stationLevelErrorBadge(point) {
  if (!point.last_error_code) return null;
  return h('span', { class: 'badge badge--fault', title: `Trạng thái OCPP mức trụ: ${point.ocpp_status ?? 'UNKNOWN'}` },
    h('span', { class: 'dot dot--fault', 'aria-hidden': 'true' }), `Lỗi mức trụ: ${point.last_error_code}`);
}

const STATION_TONE = { ACTIVE: 'ready', INACTIVE: 'offline', MAINTENANCE: 'warning' };
export function stationBadge(status) {
  const tone = STATION_TONE[status] ?? 'offline';
  return h('span', { class: `badge badge--${tone}` },
    h('span', { class: `dot dot--${tone}`, 'aria-hidden': 'true' }), stationStatusLabels[status] ?? status);
}

export const roleTag = (text) => h('span', { class: 'badge badge--brand badge--square' }, text);
