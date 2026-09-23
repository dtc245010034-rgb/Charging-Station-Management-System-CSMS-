const { prepare } = require('../../db/pool');

const findByEmail = (email) => prepare('SELECT * FROM users WHERE email = ?').get(email);
const findById = (id) => prepare('SELECT * FROM users WHERE id = ?').get(id);
const insert = (name, email, passwordHash) =>
  prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, passwordHash);

const listRoles = () => prepare('SELECT id, code, name, description, created_at FROM roles ORDER BY id ASC').all();
const findRoleByCode = (code) => prepare('SELECT id FROM roles WHERE code = ?').get(code);
const assignRole = (userId, roleId) =>
  prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(userId, roleId);
const roleCodesOf = async (userId) => {
  const rows = await prepare('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?').all(userId);
  return rows.map((r) => r.code);
};

module.exports = { findByEmail, findById, insert, listRoles, findRoleByCode, assignRole, roleCodesOf };
