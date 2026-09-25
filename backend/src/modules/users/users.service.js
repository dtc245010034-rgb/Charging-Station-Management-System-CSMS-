const users = require('./users.repository');
const audit = require('../audit/audit.repository');
const { withTransaction } = require('../../db/tx');
const { hashPassword } = require('../../lib/password');
const { BadRequestError, ConflictError } = require('../../lib/errors');

const listRoles = () => users.listRoles();
const listStationOwners = () => users.listByRole('STATION_OWNER');

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

module.exports = { listRoles, listStationOwners, create, createByAdmin, publicUser };
