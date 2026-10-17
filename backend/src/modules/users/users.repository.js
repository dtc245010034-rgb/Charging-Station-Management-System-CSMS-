const { prepare } = require('../../db/pool');
const { pool } = require('../../db/pool');

const findByEmail = (email) => prepare('SELECT * FROM users WHERE email = ?').get(email);
const findById = (id) => prepare('SELECT * FROM users WHERE id = ?').get(id);

const tokenVersionOf = async (id) => {
  const user = await prepare('SELECT token_version, is_active FROM users WHERE id = ?').get(id);
  return user?.is_active ? user.token_version : null;
};
// Chỉ tăng khi phiên đang đăng xuất còn hợp lệ, để token cũ không đăng xuất nhầm phiên mới.
const bumpTokenVersion = (id, expectedVersion) => prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ? AND token_version = ?').run(id, expectedVersion);

const listRoles = () => prepare('SELECT id, code, name, description, created_at FROM roles ORDER BY id ASC').all();
const roleCodesOf = async (userId) => {
  const rows = await prepare('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.id ASC').all(userId);
  return rows.map((r) => r.code);
};

// Hai hàm dưới nhận `client` để service gom vào một transaction.
const insertUser = async (client, name, email, passwordHash) => {
  const r = await client.query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *', [name, email, passwordHash]);
  return r.rows[0];
};
const assignRoleByCode = async (client, userId, roleCode) => {
  const r = await client.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = $2', [userId, roleCode]);
  return r.rowCount === 1;
};
const insertVirtualIdTag = async (client, userId, tag) => {
  const r = await client.query(
    "INSERT INTO id_tags (tag, user_id, status, is_virtual) VALUES ($1, $2, 'ACTIVE', TRUE) RETURNING id",
    [tag, userId]
  );
  return r.rows[0];
};

async function listAdminUsers({ search, page, pageSize }) {
  const escaped = search.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  const total = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM users u
     WHERE $1 = '' OR u.name ILIKE $2 ESCAPE E'\\\\' OR u.email ILIKE $2 ESCAPE E'\\\\'`,
    [search, pattern]
  );
  const rows = await pool.query(
    `SELECT u.id::text, u.name, u.email, u.is_active, u.created_at,
            COALESCE(ARRAY_REMOVE(ARRAY_AGG(r.code ORDER BY r.id), NULL), ARRAY[]::text[]) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE $1 = '' OR u.name ILIKE $2 ESCAPE E'\\\\' OR u.email ILIKE $2 ESCAPE E'\\\\'
     GROUP BY u.id
     ORDER BY u.id DESC
     LIMIT $3 OFFSET $4`,
    [search, pattern, pageSize, (page - 1) * pageSize]
  );
  return {
    users: rows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      roles: row.roles,
      isActive: row.is_active,
      createdAt: row.created_at,
    })),
    page,
    pageSize,
    total: total.rows[0].total,
  };
}

async function findAdminUserForUpdate(client, id) {
  const result = await client.query(
    'SELECT id::text, name, email, is_active, created_at FROM users WHERE id = $1 FOR UPDATE',
    [id]
  );
  if (!result.rowCount) return null;
  const roles = await client.query(
    `SELECT r.code
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
     ORDER BY r.id`,
    [id]
  );
  return { ...result.rows[0], roles: roles.rows.map((row) => row.code) };
}

async function adminUserById(client, id) {
  const result = await client.query(
    `SELECT u.id::text, u.name, u.email, u.is_active, u.created_at,
            COALESCE(ARRAY_REMOVE(ARRAY_AGG(r.code ORDER BY r.id), NULL), ARRAY[]::text[]) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [id]
  );
  const row = result.rows[0];
  return row ? {
    id: row.id,
    name: row.name,
    email: row.email,
    roles: row.roles,
    isActive: row.is_active,
    createdAt: row.created_at,
  } : null;
}

module.exports = {
  findByEmail,
  findById,
  tokenVersionOf,
  bumpTokenVersion,
  listRoles,
  roleCodesOf,
  insertUser,
  assignRoleByCode,
  insertVirtualIdTag,
  listAdminUsers,
  findAdminUserForUpdate,
  adminUserById,
};
