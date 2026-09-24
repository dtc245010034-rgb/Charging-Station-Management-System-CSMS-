const { prepare } = require('../../db/pool');

const findByEmail = (email) => prepare('SELECT * FROM users WHERE email = ?').get(email);
const findById = (id) => prepare('SELECT * FROM users WHERE id = ?').get(id);

const listRoles = () => prepare('SELECT id, code, name, description, created_at FROM roles ORDER BY id ASC').all();
const roleCodesOf = async (userId) => {
  const rows = await prepare('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?').all(userId);
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

module.exports = { findByEmail, findById, listRoles, roleCodesOf, insertUser, assignRoleByCode };
