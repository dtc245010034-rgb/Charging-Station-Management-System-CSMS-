// Cấu hình workspace theo vai trò. Mục có enabled:false đã được thiết kế trong IA nhưng CHƯA có backend:
// chúng bị ẩn (không tạo menu "Coming Soon"); bật lên khi story `since` merge xong.
export const WORKSPACES = {
  operator: {
    role: 'OPERATOR', label: 'Vận hành viên', layout: 'desk',
    groups: [
      { title: null, items: [{ page: 'overview', label: 'Tổng quan', icon: 'home', enabled: true }] },
      {
        title: 'Vận hành',
        items: [
          { page: 'stations', label: 'Trạm sạc', icon: 'station', enabled: true, needs: 'stations:read' },
          { page: 'charge-points', label: 'Trụ sạc', icon: 'charger', enabled: true, needs: 'charge-points:read' },
          { page: 'sessions', label: 'Phiên sạc', icon: 'bolt', enabled: false, since: 'S-17' },
          { page: 'alerts', label: 'Cảnh báo', icon: 'alert', enabled: false, since: 'S-46' },
          { page: 'remote', label: 'Điều khiển từ xa', icon: 'sliders', enabled: false, since: 'S-16' },
          { page: 'ocpp', label: 'OCPP', icon: 'radio', enabled: false, since: 'S-06' },
          { page: 'control-log', label: 'Nhật ký điều khiển', icon: 'log', enabled: false, since: 'S-27' },
        ],
      },
      {
        title: 'Giám sát',
        items: [
          { page: 'fleet-status', label: 'Trạng thái trụ', icon: 'charger', enabled: true, needs: 'charge-points:read' },
          { page: 'map', label: 'Bản đồ', icon: 'map', enabled: true, needs: 'stations:read' },
          { page: 'incidents', label: 'Sự cố', icon: 'alert', enabled: false, since: 'S-46' },
          { page: 'performance', label: 'Hiệu suất', icon: 'activity', enabled: false, since: 'S-19' },
        ],
      },
      {
        title: 'Hệ thống',
        items: [
          { page: 'users', label: 'Người dùng', icon: 'users', enabled: false, since: 'S-61' },
          { page: 'system-log', label: 'Nhật ký hệ thống', icon: 'log', enabled: false, since: 'S-56' },
          { page: 'settings', label: 'Cài đặt', icon: 'settings', enabled: false },
        ],
      },
    ],
  },
  owner: {
    role: 'STATION_OWNER', label: 'Chủ trạm', layout: 'desk',
    groups: [
      { title: null, items: [{ page: 'overview', label: 'Tổng quan', icon: 'home', enabled: true }] },
      {
        title: 'Quản lý',
        items: [
          { page: 'fleet-status', label: 'Trạng thái trụ', icon: 'charger', enabled: true, needs: 'charge-points:read' },
          { page: 'stations', label: 'Trạm sạc của tôi', icon: 'station', enabled: true, needs: 'stations:read' },
          { page: 'charge-points', label: 'Trụ sạc', icon: 'charger', enabled: true, needs: 'charge-points:read' },
          { page: 'map', label: 'Bản đồ', icon: 'map', enabled: true, needs: 'stations:read' },
          { page: 'revenue', label: 'Doanh thu', icon: 'activity', enabled: false, since: 'S-52' },
        ],
      },
    ],
  },
  admin: {
    role: 'ADMIN', label: 'Quản trị', layout: 'desk',
    groups: [
      { title: null, items: [{ page: 'overview', label: 'Tổng quan', icon: 'home', enabled: true }] },
      {
        title: 'Hệ thống',
        items: [
          { page: 'stations', label: 'Trạm sạc', icon: 'station', enabled: true, needs: 'stations:read' },
          { page: 'charge-points', label: 'Trụ sạc', icon: 'charger', enabled: true, needs: 'charge-points:read' },
          { page: 'fleet-status', label: 'Trạng thái trụ', icon: 'charger', enabled: true, needs: 'charge-points:read' },
          { page: 'map', label: 'Bản đồ', icon: 'map', enabled: true, needs: 'stations:read' },
          { page: 'users', label: 'Tạo tài khoản', icon: 'users', enabled: true, needs: 'users:create' },
          { page: 'system-log', label: 'Nhật ký hệ thống', icon: 'log', enabled: false, since: 'S-56' },
        ],
      },
    ],
  },
  accountant: {
    role: 'ACCOUNTANT', label: 'Kế toán', layout: 'desk',
    groups: [
      { title: null, items: [{ page: 'overview', label: 'Tổng quan', icon: 'home', enabled: true }] },
      {
        title: 'Đối soát',
        items: [
          { page: 'reconciliation', label: 'Đối soát', icon: 'activity', enabled: false, since: 'S-53' },
          { page: 'periods', label: 'Kỳ đối soát', icon: 'calendar', enabled: false, since: 'S-55' },
        ],
      },
    ],
  },
  driver: {
    role: 'DRIVER', label: 'Tài xế', layout: 'mobile',
    groups: [
      {
        title: null,
        items: [
          { page: 'overview', label: 'Trang chủ', icon: 'home', enabled: true },
          { page: 'find', label: 'Tìm trạm', icon: 'station', enabled: false, since: 'S-47' },
          { page: 'sessions', label: 'Phiên sạc', icon: 'bolt', enabled: false, since: 'S-22' },
          { page: 'history', label: 'Lịch sử', icon: 'history', enabled: false, since: 'S-64' },
          { page: 'wallet', label: 'Ví', icon: 'wallet', enabled: false, since: 'S-40' },
          { page: 'account', label: 'Tài khoản', icon: 'user', enabled: true },
        ],
      },
    ],
  },
};

export const workspaceForRole = (role) => Object.keys(WORKSPACES).find((id) => WORKSPACES[id].role === role) ?? null;
export const workspacesFor = (roles) => roles.map(workspaceForRole).filter(Boolean);
export const routeFor = (workspace, page = 'overview', id) => `#/${workspace}/${page}${id ? `/${encodeURIComponent(id)}` : ''}`;
export const homePathFor = (role) => {
  const workspace = workspaceForRole(role);
  return workspace ? `/app.html${routeFor(workspace)}` : '/index.html';
};
export const goHome = (user) => location.replace(homePathFor(user?.roles?.[0] ?? user?.role));

export function visibleNav(workspaceId, role, can) {
  return WORKSPACES[workspaceId].groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.enabled && (!item.needs || can(role, item.needs))) }))
    .filter((group) => group.items.length);
}
