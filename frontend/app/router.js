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
  sessions: ['sessions:read-own', 'sessions:read'],
  history: 'sessions:read-own',
  invoice: 'invoices:read-own',
  wallet: 'wallets:read-own',
  notifications: 'notifications:read-own',
  wallets: 'wallets:manage',
  'unexpected-sessions': 'sessions:unexpected:read',
  'control-log': 'audit-logs:read',
  start: 'remote-start:create',
  find: 'stations:search',
  reservations: 'reservations:read-own',
  tariffs: 'tariffs:read',
  revenue: 'reports:revenue',
  reconciliation: 'reports:reconcile',
  periods: 'periods:manage',
  'erasure-requests': 'erasure:manage',
  settlements: 'settlements:read',
  health: 'health:dashboard',
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
  start: {
    driver: () => import('../pages/driver/start.js'),
  },
  find: {
    driver: () => import('../pages/driver/find.js'),
  },
  reservations: {
    driver: () => import('../pages/driver/find.js'),
  },
  sessions: {
    driver: () => import('../pages/driver/session.js'),
    operator: () => import('../pages/shared/sessions.js'),
    admin: () => import('../pages/shared/sessions.js'),
  },
  invoice: {
    driver: () => import('../pages/driver/invoice.js'),
  },
  history: {
    driver: () => import('../pages/driver/history.js'),
  },
  wallet: {
    driver: () => import('../pages/driver/wallet.js'),
  },
  notifications: {
    driver: () => import('../pages/driver/notifications.js'),
  },
  wallets: {
    admin: () => import('../pages/admin/wallets.js'),
  },
  'unexpected-sessions': {
    operator: () => import('../pages/shared/unexpected-sessions.js'),
    accountant: () => import('../pages/shared/unexpected-sessions.js'),
    admin: () => import('../pages/shared/unexpected-sessions.js'),
  },
  'control-log': {
    admin: () => import('../pages/shared/audit-logs.js'),
  },
  stations: () => import('../pages/shared/stations.js'),
  'charge-points': () => import('../pages/shared/charge-points.js'),
  'fleet-status': () => import('../pages/shared/fleet-status.js'),
  map: () => import('../pages/shared/map-page.js'),
  users: () => import('../pages/admin/users.js'),
  account: () => import('../pages/shared/account.js'),
  tariffs: () => import('../pages/shared/tariffs.js'),
  revenue: {
    owner: () => import('../pages/shared/revenue.js'),
    accountant: () => import('../pages/shared/revenue.js'),
    admin: () => import('../pages/shared/revenue.js'),
  },
  reconciliation: {
    accountant: () => import('../pages/shared/reconciliation.js'),
    admin: () => import('../pages/shared/reconciliation.js'),
  },
  periods: {
    accountant: () => import('../pages/shared/periods.js'),
    admin: () => import('../pages/shared/periods.js'),
  },
  'erasure-requests': {
    admin: () => import('../pages/admin/erasure-requests.js'),
  },
  settlements: {
    owner: () => import('../pages/shared/settlements.js'),
    accountant: () => import('../pages/shared/settlements.js'),
    admin: () => import('../pages/shared/settlements.js'),
  },
  health: {
    operator: () => import('../pages/shared/health.js'),
    admin: () => import('../pages/shared/health.js'),
  },
};

export function pageLoader(page, workspace) {
  const entry = PAGES[page];
  return typeof entry === 'function' ? entry : entry?.[workspace] ?? null;
}
