const crypto = require('node:crypto');
const users = require('./users.repository');
const audit = require('../audit/audit.repository');
const { withTransaction } = require('../../db/tx');
const { hashPassword } = require('../../lib/password');
const { AppError, BadRequestError, ConflictError, NotFoundError } = require('../../lib/errors');

const listRoles = () => users.listRoles();

function publicUser(user, roles = []) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: roles[0] || null,
    roles,
    created_at: user.created_at,
  };
}

// Tạo user và gán vai trò trong MỘT transaction: lỗi giữa chừng không để lại user không có vai trò.
async function create({ name, email, password, role }) {
  const passwordHash = await hashPassword(password);
  try {
    return await withTransaction(async (client) => {
      const user = await users.insertUser(client, name, email, passwordHash);
      if (!await users.assignRoleByCode(client, user.id, role)) throw new BadRequestError('Vai trò không hợp lệ');
      if (role === 'DRIVER') {
        await users.insertVirtualIdTag(client, user.id, `V${crypto.randomBytes(9).toString('hex').toUpperCase()}`);
      }
      return user;
    });
  } catch (error) {
    throw error.code === '23505' ? new ConflictError('Email đã tồn tại') : error;
  }
}

async function createByAdmin(actor, data) {
  const user = await create(data);
  // metadata chỉ lưu tên trường và vai trò, không lưu email/mật khẩu.
  await audit.record(actor.id, 'CREATE', 'user', user.id, { fields: ['name', 'email', 'password', 'role'], role: data.role });
  return publicUser(user, [data.role]);
}

async function listAdminUsers() {
  const result = await require('../../db/pool').pool.query(
    `SELECT u.id, u.name, u.email, u.created_at, u.disabled_at,
            COALESCE(ARRAY_AGG(r.code ORDER BY r.id) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     GROUP BY u.id
     ORDER BY u.id`
  );
  return result.rows.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.roles[0] || null,
    roles: user.roles,
    created_at: user.created_at,
    disabled_at: user.disabled_at,
  }));
}

async function assignRole(actor, userId, role) {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(806154)');
    const user = await client.query(
      `SELECT u.id,
              EXISTS (
                SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id AND r.code = 'ADMIN'
              ) AS is_admin
       FROM users u WHERE u.id = $1 FOR UPDATE`,
      [userId]
    );
    if (!user.rowCount) throw new NotFoundError('Không tìm thấy người dùng');

    const roleResult = await client.query('SELECT id FROM roles WHERE code = $1', [role]);
    if (!roleResult.rowCount) throw new BadRequestError('Vai trò không hợp lệ');
    if (user.rows[0].is_admin && role !== 'ADMIN') {
      const admins = await client.query(
        `SELECT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE r.code = 'ADMIN' AND u.disabled_at IS NULL
         ORDER BY u.id FOR UPDATE OF u`
      );
      if (admins.rowCount <= 1) {
        throw new AppError(409, 'LAST_ADMIN', 'Không thể gỡ vai trò quản trị viên cuối cùng');
      }
    }
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleResult.rows[0].id]);
    await client.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
    await audit.record(actor.id, 'USER_ROLE_ASSIGNED', 'user', userId, { role }, actor.ip, client);
    return userId;
  }).then(async () => {
    const users = await listAdminUsers();
    return users.find((user) => String(user.id) === String(userId));
  });
}

async function setDisabled(actor, userId, disabled) {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(806154)');
    const userResult = await client.query(
      `SELECT u.id, u.disabled_at,
              EXISTS (
                SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id AND r.code = 'ADMIN'
              ) AS is_admin
       FROM users u WHERE u.id = $1 FOR UPDATE`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) throw new NotFoundError('Không tìm thấy người dùng');

    if (disabled) {
      if (user.is_admin) {
        const admins = await client.query(
          `SELECT u.id FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
           WHERE r.code = 'ADMIN' AND u.disabled_at IS NULL
           ORDER BY u.id FOR UPDATE OF u`
        );
        if (admins.rowCount <= 1) {
          throw new AppError(409, 'LAST_ADMIN', 'Không thể vô hiệu hoá quản trị viên cuối cùng');
        }
      }
      if (String(actor.id) === String(userId)) {
        throw new AppError(409, 'CANNOT_DISABLE_SELF', 'Không thể vô hiệu hoá tài khoản đang đăng nhập');
      }
      const ownership = await client.query('SELECT 1 FROM stations WHERE owner_id = $1 LIMIT 1', [userId]);
      if (ownership.rowCount) throw new AppError(409, 'OWNS_STATIONS', 'Chủ trạm phải chuyển trạm trước khi vô hiệu hoá');
    }

    const result = await client.query(
      `UPDATE users
       SET disabled_at = ${disabled ? 'CURRENT_TIMESTAMP' : 'NULL'},
           token_version = token_version + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [userId]
    );
    await audit.record(
      actor.id,
      disabled ? 'USER_DISABLED' : 'USER_ENABLED',
      'user',
      userId,
      { disabled },
      actor.ip,
      client
    );
    return result.rows[0].id;
  }).then(async () => {
    const users = await listAdminUsers();
    return users.find((user) => String(user.id) === String(userId));
  });
}

module.exports = { listRoles, create, createByAdmin, publicUser, listAdminUsers, assignRole, setDisabled };
