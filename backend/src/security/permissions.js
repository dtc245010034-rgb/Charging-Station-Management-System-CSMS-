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
  'users:read': ADMIN,
  'stations:read': READ_OPERATIONS,
  'stations:write': WRITE_OPERATIONS,
  'charge-points:read': READ_OPERATIONS,
  'charge-points:write': WRITE_OPERATIONS,
};

function access(key) {
  if (!(key in permissions)) throw new Error(`Chưa khai báo quyền "${key}" trong security/permissions.js`);
  return permissions[key];
}

module.exports = { permissions, access, ROLES };
