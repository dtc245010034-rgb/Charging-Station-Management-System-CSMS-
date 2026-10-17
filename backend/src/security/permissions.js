const { ROLES } = require('../lib/roles');

const PUBLIC = 'public';
const ADMIN = ['ADMIN'];
const READ_OPERATIONS = ['ADMIN', 'STATION_OWNER', 'OPERATOR'];
const WRITE_OPERATIONS = ['ADMIN', 'STATION_OWNER'];

// Ma trận quyền Sprint 1 — NGUỒN DUY NHẤT. Route chỉ tham chiếu khoá ở đây qua access().
// Lọc "của mình" cho STATION_OWNER làm ở tầng truy vấn (db/scope.js), không nằm trong ma trận này.
const permissions = {
  'auth:public': PUBLIC,
  'health:read': PUBLIC,
  'roles:read': ADMIN,
  'users:create': ADMIN,
  'stations:read': READ_OPERATIONS,
  'stations:search': ['DRIVER'],
  'stations:write': WRITE_OPERATIONS,
  'charge-points:read': READ_OPERATIONS,
  'charge-points:read-driver': ['DRIVER'],
  'charge-points:write': WRITE_OPERATIONS,
  'charge-points:reset': ['ADMIN', 'OPERATOR'],
  'charge-points:configure': ['ADMIN', 'OPERATOR'],
  'remote-start:create': ['DRIVER'],
  'reservations:create': ['DRIVER'],
  'reservations:read-own': ['DRIVER'],
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
  'payments:webhook': PUBLIC,
  'notifications:read-own': ['DRIVER'],
  'audit-logs:read': ADMIN,
  'tariffs:read': ['ADMIN', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT'],
  'tariffs:write': WRITE_OPERATIONS,
  'reports:revenue': ['ADMIN', 'ACCOUNTANT', 'STATION_OWNER'],
  'periods:manage': ['ADMIN', 'ACCOUNTANT'],
  'periods:reopen': ADMIN,
  'reports:reconcile': ['ADMIN', 'ACCOUNTANT'],
  'erasure:request': ['DRIVER'],
  'erasure:manage': ADMIN,
  'alerts:read': READ_OPERATIONS,
  'alerts:close': ['ADMIN', 'OPERATOR'],
  'partner-rates:manage': ['ADMIN', 'ACCOUNTANT'],
  'partner-rates:read': ['ADMIN', 'ACCOUNTANT', 'STATION_OWNER'],
};

function access(key) {
  if (!(key in permissions)) throw new Error(`Chưa khai báo quyền "${key}" trong security/permissions.js`);
  return permissions[key];
}

module.exports = { permissions, access, ROLES };
