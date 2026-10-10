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
  'charge-points:write': WRITE,
  'charge-points:reset': ['ADMIN', 'OPERATOR'],
  'stations:lock': ADMIN,
  'sessions:read-own': ['DRIVER'],
  'sessions:read': ['ADMIN', 'OPERATOR', 'ACCOUNTANT', 'STATION_OWNER'],
  'sessions:stop': ['ADMIN', 'OPERATOR'],
};

export const can = (role, key) => (PERMISSIONS[key] ?? []).includes(role);
