// Chỉ để ẨN/HIỆN nút và menu cho gọn. Backend mới là nơi quyết định quyền (security/permissions.js);
// test backend/tests/unit/frontend-permissions.test.js giữ hai bảng này khớp nhau.
const ADMIN = ['ADMIN'];
const READ = ['ADMIN', 'STATION_OWNER', 'OPERATOR'];
const WRITE = ['ADMIN', 'STATION_OWNER'];

export const PERMISSIONS = {
  'roles:read': ADMIN,
  'users:create': ADMIN,
  'stations:read': READ,
  'stations:write': WRITE,
  'charge-points:read': READ,
  'charge-points:read-driver': ['DRIVER'],
  'charge-points:write': WRITE,
  'charge-points:reset': ['ADMIN', 'OPERATOR'],
  'remote-start:create': ['DRIVER'],
  'stations:lock': ADMIN,
  'sessions:read-own': ['DRIVER'],
  'sessions:read': ['ADMIN', 'OPERATOR', 'ACCOUNTANT', 'STATION_OWNER'],
  'sessions:stop': ['ADMIN', 'OPERATOR'],
  'sessions:unexpected:read': ['OPERATOR', 'ACCOUNTANT', 'ADMIN'],
  'sessions:unexpected:close': ['OPERATOR', 'ADMIN'],
  'invoices:read-own': ['DRIVER'],
  'invoices:read': ['ADMIN', 'OPERATOR', 'ACCOUNTANT', 'STATION_OWNER'],
  'wallets:read-own': ['DRIVER'],
  'wallets:read': ['ADMIN', 'ACCOUNTANT'],
  'wallets:manage': ADMIN,
  'wallets:topup': ['DRIVER'],
  'notifications:read-own': ['DRIVER'],
  'audit-logs:read': ['ADMIN'],
  'tariffs:read': ['ADMIN', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT'],
  'tariffs:write': WRITE,
  'reports:revenue': ['ADMIN', 'ACCOUNTANT', 'STATION_OWNER'],
  'periods:manage': ['ADMIN', 'ACCOUNTANT'],
  'periods:reopen': ADMIN,
  'reports:reconcile': ['ADMIN', 'ACCOUNTANT'],
  'erasure:request': ['DRIVER'],
  'erasure:manage': ADMIN,
  'alerts:read': READ,
  'alerts:close': ['ADMIN', 'OPERATOR'],
};

export const can = (role, key) => (PERMISSIONS[key] ?? []).includes(role);
