// Gom trạng thái để ĐỌC cho dễ; giá trị gốc (9 trạng thái OCPP 1.6J) không bao giờ bị đổi hay ghi đè.
// Đây là nơi DUY NHẤT ánh xạ trạng thái → nhóm hiển thị; khi S-10 (T-20) chốt trạng thái nội bộ thì chỉ sửa ở đây.
export const OCPP_STATUSES = [
  'Available', 'Preparing', 'Charging', 'SuspendedEVSE', 'SuspendedEV', 'Finishing', 'Reserved', 'Unavailable', 'Faulted',
];

export const GROUPS = {
  ready: { label: 'Sẵn sàng' },
  charging: { label: 'Đang sạc' },
  warning: { label: 'Cảnh báo' },
  fault: { label: 'Lỗi' },
  offline: { label: 'Ngoại tuyến / chưa rõ' },
};

const GROUP_OF = {
  Available: 'ready', Preparing: 'ready', Reserved: 'ready',
  Charging: 'charging', SuspendedEV: 'charging', SuspendedEVSE: 'charging', Finishing: 'charging',
  Faulted: 'fault',
  Unavailable: 'offline',
  AVAILABLE: 'ready', OCCUPIED: 'charging', RESERVED: 'ready', ERROR: 'fault', UNAVAILABLE: 'offline',
  // Trụ đang giữ kết nối OCPP (charge_points.status). Màu của trụ còn xét thêm đầu nối, xem pointGroup.
  ONLINE: 'ready',
};

// Trụ mới đăng ký có trạng thái 'UNKNOWN' cho tới khi nhận StatusNotification → nhóm offline.
// Nhóm 'warning' không suy ra được từ trạng thái; nó đến từ cảnh báo theo business rule (S-46), chưa có nguồn.
export const groupOf = (status) => GROUP_OF[status] ?? 'offline';
export const CONNECTOR_STATUS_LABELS = {
  AVAILABLE: 'Rảnh',
  OCCUPIED: 'Bận',
  RESERVED: 'Đặt chỗ',
  ERROR: 'Lỗi',
  UNAVAILABLE: 'Tạm ngừng',
};

export function statusLabel(status, group = groupOf(status)) {
  if (CONNECTOR_STATUS_LABELS[status]) return CONNECTOR_STATUS_LABELS[status];
  if (status === 'UNKNOWN' || !status) return 'Chưa rõ';
  return GROUPS[group].label;
}

// Trụ ONLINE mang màu của đầu nối nặng nhất; trụ không ONLINE (UNKNOWN...) luôn là ngoại tuyến vì không có kết nối.
// Trụ ONLINE mà mọi đầu nối đều UNAVAILABLE không phục vụ được ai nên là ngoại tuyến; đầu nối UNKNOWN (chưa báo trạng thái) không hạ cấp trụ.
export function pointGroup(point) {
  if (point.status !== 'ONLINE') return groupOf(point.status);
  const connectors = point.connector_statuses ?? [];
  if (connectors.length > 0 && connectors.every((status) => status === 'UNAVAILABLE')) return 'offline';
  return worstGroup([point.status, ...connectors]);
}

// Nhãn của trụ dùng đúng tên nhóm trong chú giải; nhãn riêng "Chưa rõ" chỉ dành cho đầu nối.
export const ONLINE_PAUSED_LABEL = 'Trực tuyến – tạm ngừng';

export function pointLabel(status, group = groupOf(status)) {
  if (status === 'UNKNOWN' || !status) return GROUPS.offline.label;
  if (status === 'ONLINE' && group === 'offline') return ONLINE_PAUSED_LABEL;
  return statusLabel(status, group);
}

// Nhãn và màu trụ ở trang "Trạng thái trụ"; trụ trực tuyến mà mọi đầu nối tạm ngừng dùng cùng nhãn với trang "Trụ sạc".
export function fleetPointLabel(point) {
  if (point.offline) return { label: 'Ngoại tuyến', tone: 'offline' };
  if (point.status !== 'ONLINE') return { label: 'Chưa rõ', tone: 'offline' };
  const group = pointGroup({ status: point.status, connector_statuses: (point.connectors ?? []).map((c) => c.status) });
  return group === 'offline' ? { label: ONLINE_PAUSED_LABEL, tone: 'offline' } : { label: 'Trực tuyến', tone: 'ready' };
}

// Thứ tự nặng → nhẹ, dùng để chọn màu đại diện của một trạm gồm nhiều trụ.
const SEVERITY = ['fault', 'warning', 'charging', 'ready', 'offline'];

export function worstGroup(items, toGroup = groupOf) {
  const groups = new Set(items.map(toGroup));
  return SEVERITY.find((group) => groups.has(group)) ?? 'offline';
}

export function countByGroup(items, toGroup = groupOf) {
  const counts = { ready: 0, charging: 0, warning: 0, fault: 0, offline: 0 };
  for (const item of items) counts[toGroup(item)] += 1;
  return counts;
}

export const stationStatusLabels = { ACTIVE: 'Đang hoạt động', INACTIVE: 'Chưa hoạt động', MAINTENANCE: 'Bảo trì' };
