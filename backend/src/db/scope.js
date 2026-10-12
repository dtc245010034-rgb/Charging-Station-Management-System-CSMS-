const { ForbiddenError } = require('../lib/errors');

const ALIAS = /^[a-z_][a-z0-9_]*$/i;

// Điều kiện sở hữu DUY NHẤT cho mọi truy vấn trạm/trụ/đầu nối. `alias` là bí danh bảng stations.
// Trả về { sql, params } với placeholder `?` (db/pool.js đổi sang $n).
function scopeByOwner(actor, alias) {
  if (!ALIAS.test(alias)) throw new Error(`alias không hợp lệ: ${alias}`);
  const roles = actor.roles || [];
  if (roles.includes('ADMIN') || roles.includes('OPERATOR')) return { sql: 'TRUE', params: [] };
  if (roles.includes('STATION_OWNER')) return { sql: `${alias}.owner_id = ?`, params: [actor.id] };
  throw new ForbiddenError();
}

module.exports = { scopeByOwner };
