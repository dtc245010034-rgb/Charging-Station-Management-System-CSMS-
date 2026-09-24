const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const env = require('../../config/env');
const users = require('../users/users.repository');
const { AppError, ConflictError, UnauthorizedError, NotFoundError } = require('../../lib/errors');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SYSTEM_ROLES = ['DRIVER', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT', 'ADMIN'];

function issueToken(user, roles = []) {
  return jwt.sign(
    { id: user.id, email: user.email, role: roles[0] || null, roles },
    env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

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

const hashPassword = (password) => argon2.hash(password, { type: argon2.argon2id });

async function verifyPassword(user, password) {
  if (!user || !user.password_hash || !password) return false;
  try {
    return user.password_hash.startsWith('$argon2') && await argon2.verify(user.password_hash, password);
  } catch {
    return false;
  }
}

function checkUserLock(user) {
  if (!user || !user.locked_until) return { locked: false };
  const lockedUntil = new Date(user.locked_until);
  if (lockedUntil <= new Date()) return { locked: false };
  const remainingMinutes = Math.ceil((lockedUntil.getTime() - Date.now()) / (60 * 1000));
  return {
    locked: true,
    message: `Tài khoản tạm thời bị khóa do nhập sai mật khẩu quá ${MAX_ATTEMPTS} lần liên tiếp. Vui lòng thử lại sau ${remainingMinutes} phút.`,
  };
}

async function recordFailedLogin(user) {
  const expired = user.locked_until && new Date(user.locked_until) <= new Date();
  const count = expired ? 1 : Number(user.failed_attempts || 0) + 1;
  const lockedUntil = count >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
  await users.setFailedAttempts(user.id, count, lockedUntil);
}

async function register({ name, email, password, role }) {
  const passwordHash = await hashPassword(password);
  let result;
  try {
    result = await users.insert(name, email.toLowerCase().trim(), passwordHash);
  } catch (error) {
    if (error.code === '23505') throw new ConflictError('Email đã tồn tại');
    throw error;
  }
  const roleRow = await users.findRoleByCode(role);
  if (roleRow) await users.assignRole(result.lastInsertRowid, roleRow.id);
  const user = await users.findById(result.lastInsertRowid);
  const roles = await users.roleCodesOf(user.id);
  return { user: publicUser(user, roles), token: issueToken(user, roles) };
}

async function login(rawEmail, password) {
  const email = rawEmail.toLowerCase().trim();
  const user = await users.findByEmail(email);
  if (user) {
    const lock = checkUserLock(user);
    if (lock.locked) throw new AppError(429, 'ACCOUNT_LOCKED', lock.message);
  }
  if (!(user && await verifyPassword(user, password))) {
    if (user) await recordFailedLogin(user);
    // Generic message that does not leak email existence
    throw new UnauthorizedError('Email hoặc mật khẩu không đúng');
  }
  await users.resetFailedAttempts(user.id);
  const roles = await users.roleCodesOf(user.id);
  return { user: publicUser(user, roles), token: issueToken(user, roles) };
}

async function me(userId) {
  const user = await users.findById(userId);
  if (!user) throw new NotFoundError('Người dùng không tồn tại');
  return publicUser(user, await users.roleCodesOf(user.id));
}

module.exports = { register, login, me, issueToken, publicUser, hashPassword, verifyPassword, checkUserLock, SYSTEM_ROLES, MAX_ATTEMPTS, LOCKOUT_MINUTES };
