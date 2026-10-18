const { prepare } = require('../../db/pool');

const findByEmail = (email) => prepare('SELECT * FROM users WHERE email = ?').get(email);
const findById = (id) => prepare('SELECT * FROM users WHERE id = ?').get(id);

const tokenVersionOf = async (id) => (await prepare('SELECT token_version FROM users WHERE id = ?').get(id))?.token_version ?? null;
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

module.exports = { findByEmail, findById, tokenVersionOf, bumpTokenVersion, listRoles, roleCodesOf, insertUser, assignRoleByCode, insertVirtualIdTag };
