const { query } = require('./db');
const { issueToken } = require('../../src/modules/auth/auth.service');

async function createUser(email, roleCode) {
  const u = await query("INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'x') RETURNING *", [email, email]);
  await query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = $2', [u.rows[0].id, roleCode]);
  return { ...u.rows[0], cookie: `token=${issueToken(u.rows[0], [roleCode])}` };
}

module.exports = { createUser };
