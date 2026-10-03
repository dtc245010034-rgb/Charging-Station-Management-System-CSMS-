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
  AVAILABLE: 'ready', OCCUPIED: 'charging', RESERVED: 'ready', ERROR: 'fault',
};

// Trụ mới đăng ký có trạng thái 'UNKNOWN' cho tới khi nhận StatusNotification → nhóm offline.
// Trạng thái nội bộ của đầu nối dùng cùng các nhóm hiển thị mà không đổi nhóm OCPP của trụ.
// Nhóm 'warning' không suy ra được từ trạng thái; nó đến từ cảnh báo theo business rule (S-46), chưa có nguồn.
export const groupOf = (status) => GROUP_OF[status] ?? 'offline';
export const CONNECTOR_STATUS_LABELS = {
  AVAILABLE: 'Rảnh',
  OCCUPIED: 'Bận',
  RESERVED: 'Đặt chỗ',
  ERROR: 'Lỗi',
};

// Thứ tự nặng → nhẹ, dùng để chọn màu đại diện của một trạm gồm nhiều trụ.
const SEVERITY = ['fault', 'warning', 'charging', 'ready', 'offline'];

export function worstGroup(statuses) {
  const groups = new Set(statuses.map(groupOf));
  return SEVERITY.find((group) => groups.has(group)) ?? 'offline';
}

export function countByGroup(statuses) {
  const counts = { ready: 0, charging: 0, warning: 0, fault: 0, offline: 0 };
  for (const status of statuses) counts[groupOf(status)] += 1;
  return counts;
}

export const stationStatusLabels = { ACTIVE: 'Đang hoạt động', INACTIVE: 'Chưa hoạt động', MAINTENANCE: 'Bảo trì' };
