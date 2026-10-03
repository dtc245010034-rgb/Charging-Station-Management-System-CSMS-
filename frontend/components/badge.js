import { h } from '../app/dom.js';
import { CONNECTOR_STATUS_LABELS, GROUPS, groupOf, stationStatusLabels } from '../app/status.js';

// Badge trạng thái trụ/đầu nối: hiện nhóm dễ đọc, giữ nguyên giá trị OCPP gốc trong tooltip.
export function statusBadge(status, ocppStatus = status) {
  const group = groupOf(status);
  const label = CONNECTOR_STATUS_LABELS[status] || (status === 'UNKNOWN' || !status ? 'Chưa rõ' : GROUPS[group].label);
  return h('span', { class: `badge badge--${group}`, title: `Trạng thái gốc: ${ocppStatus ?? 'UNKNOWN'}` },
    h('span', { class: `dot dot--${group}`, 'aria-hidden': 'true' }), label);
}

const STATION_TONE = { ACTIVE: 'ready', INACTIVE: 'offline', MAINTENANCE: 'warning' };
export function stationBadge(status) {
  const tone = STATION_TONE[status] ?? 'offline';
  return h('span', { class: `badge badge--${tone}` },
    h('span', { class: `dot dot--${tone}`, 'aria-hidden': 'true' }), stationStatusLabels[status] ?? status);
}

export const roleTag = (text) => h('span', { class: 'badge badge--brand badge--square' }, text);
