// Router theo hash: #/<workspace>/<trang>/<id>?<query>. Dùng hash để không cần backend trả index cho mọi đường dẫn.
export function parseHash(hash) {
  const [path, query = ''] = String(hash).replace(/^#\/?/, '').split('?');
  const [workspace, page = 'overview', id] = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { workspace, page, id, query: Object.fromEntries(new URLSearchParams(query)) };
}

// Quyền tối thiểu để mở trang (chỉ để hiện thông báo gọn; backend vẫn từ chối lời gọi trái phép).
export const PAGE_NEEDS = {
  stations: 'stations:read',
  'charge-points': 'charge-points:read',
  'fleet-status': 'charge-points:read',
  map: 'stations:read',
  users: 'users:create',
  sessions: 'sessions:read-own',
};

const fleetOverview = () => import('../pages/shared/fleet-overview.js');

// Mỗi trang là một module export render(ctx) → (cleanup?). Nạp lười để trang đăng nhập/nhẹ không tải hết.
const PAGES = {
  overview: {
    operator: () => import('../pages/operator/dashboard.js'),
    owner: fleetOverview,
    admin: fleetOverview,
    accountant: () => import('../pages/accountant/overview.js'),
    driver: () => import('../pages/driver/overview.js'),
  },
  sessions: {
    driver: () => import('../pages/driver/session.js'),
  },
  stations: () => import('../pages/shared/stations.js'),
  'charge-points': () => import('../pages/shared/charge-points.js'),
  'fleet-status': () => import('../pages/shared/fleet-status.js'),
  map: () => import('../pages/shared/map-page.js'),
  users: () => import('../pages/admin/users.js'),
  account: () => import('../pages/shared/account.js'),
};

export function pageLoader(page, workspace) {
  const entry = PAGES[page];
  return typeof entry === 'function' ? entry : entry?.[workspace] ?? null;
}
