const crypto = require('node:crypto');
const users = require('./users.repository');
const audit = require('../audit/audit.repository');
const { withTransaction } = require('../../db/tx');
const { hashPassword } = require('../../lib/password');
const { AppError, BadRequestError, ConflictError, NotFoundError } = require('../../lib/errors');
const { closeStreamsOf } = require('../../lib/sse-registry');

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

async function listForAdmin(query) {
  return users.listAdminUsers({ ...query, pageSize: 50 });
}

async function activeAdminCount(client) {
  const result = await client.query(
    `SELECT COUNT(DISTINCT u.id)::int AS count
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id AND r.code = 'ADMIN'
     WHERE u.is_active = TRUE`
  );
  return result.rows[0].count;
}

async function changeRole(actor, id, role) {
  let changed = false;
  const user = await withTransaction(async (client) => {
    await client.query('LOCK TABLE user_roles IN EXCLUSIVE MODE');
    const current = await users.findAdminUserForUpdate(client, id);
    if (!current) throw new NotFoundError('Không tìm thấy tài khoản');

    if (current.roles.includes('ADMIN') && role !== 'ADMIN' && current.is_active) {
      if (await activeAdminCount(client) <= 1) {
        throw new AppError(409, 'LAST_ADMIN_REQUIRED', 'Phải duy trì ít nhất một quản trị viên đang hoạt động');
      }
    }
    if (current.roles.length === 1 && current.roles[0] === role) return users.adminUserById(client, id);

    await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
    if (!await users.assignRoleByCode(client, id, role)) throw new BadRequestError('Vai trò không hợp lệ');
    await client.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [id]);
    await audit.record(actor.id, 'USER_ROLE_CHANGED', 'user', id, {
      from_roles: current.roles,
      to_role: role,
    }, actor.ip, client);
    changed = true;
    return users.adminUserById(client, id);
  });
  if (changed) closeStreamsOf(id);
  return user;
}

async function setActive(actor, id, isActive) {
  if (!isActive && String(actor.id) === String(id)) {
    throw new AppError(400, 'CANNOT_DISABLE_SELF', 'Không thể khoá tài khoản đang đăng nhập');
  }

  let changed = false;
  const user = await withTransaction(async (client) => {
    await client.query('LOCK TABLE user_roles IN EXCLUSIVE MODE');
    const current = await users.findAdminUserForUpdate(client, id);
    if (!current) throw new NotFoundError('Không tìm thấy tài khoản');
    if (current.is_active === isActive) return users.adminUserById(client, id);

    if (!isActive && current.roles.includes('ADMIN') && await activeAdminCount(client) <= 1) {
      throw new AppError(409, 'LAST_ADMIN_REQUIRED', 'Phải duy trì ít nhất một quản trị viên đang hoạt động');
    }

    await client.query(
      'UPDATE users SET is_active = $2, token_version = token_version + 1 WHERE id = $1',
      [id, isActive]
    );
    const action = isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
    await audit.record(actor.id, action, 'user', id, { is_active: isActive }, actor.ip, client);
    changed = true;
    return users.adminUserById(client, id);
  });
  if (changed || !isActive) closeStreamsOf(id);
  return user;
}

module.exports = { listRoles, create, createByAdmin, publicUser, listForAdmin, changeRole, setActive };
