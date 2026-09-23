const argon2 = require('argon2');
const { query } = require('./db');
const { issueToken } = require('../../src/modules/auth/auth.service');

// password (tuỳ chọn): tạo hash argon2id thật để dùng cho test đăng nhập.
async function createUser(email, roleCode, password) {
  const hash = password ? await argon2.hash(password, { type: argon2.argon2id }) : 'x';
  const u = await query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *', [email, email, hash]);
  await query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = $2', [u.rows[0].id, roleCode]);
  return { ...u.rows[0], cookie: `token=${issueToken(u.rows[0], [roleCode])}` };
}

module.exports = { createUser };
