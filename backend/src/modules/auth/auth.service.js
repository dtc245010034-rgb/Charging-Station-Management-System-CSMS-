const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const env = require('../../config/env');
const users = require('../users/users.repository');
const throttle = require('./login-throttle.repository');
const { AppError, ConflictError, UnauthorizedError, NotFoundError } = require('../../lib/errors');

const EMAIL_MAX_FAILURES = 5;
const LOCKED_MESSAGE = 'Đăng nhập tạm bị khoá, thử lại sau';
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

// Hash giả để email không tồn tại vẫn tốn thời gian argon2.verify như email có thật.
let dummyHash;
const getDummyHash = () => { dummyHash ??= hashPassword('dummy-password-for-timing'); return dummyHash; };

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

async function login(rawEmail, password, ip) {
  const email = rawEmail.toLowerCase().trim();
  const emailKey = `email:${crypto.createHash('sha256').update(email).digest('hex')}`;
  const ipKey = `ip:${ip}`;

  // Khoá theo email HOẶC IP: chặn trước khi verify nên nhập đúng mật khẩu vẫn bị từ chối.
  if (await throttle.isLocked([emailKey, ipKey])) throw new AppError(429, 'ACCOUNT_LOCKED', LOCKED_MESSAGE);

  const user = await users.findByEmail(email);
  const passwordOk = await verifyPassword({ password_hash: user ? user.password_hash : await getDummyHash() }, password);
  if (!user || !passwordOk) {
    // Đếm cả email không tồn tại để hành vi giống hệt email có thật.
    await Promise.all([throttle.recordFailure(emailKey, EMAIL_MAX_FAILURES), throttle.recordFailure(ipKey, env.LOGIN_IP_MAX_FAILURES)]);
    throw new UnauthorizedError('Email hoặc mật khẩu không đúng');
  }
  await throttle.clear(emailKey);
  const roles = await users.roleCodesOf(user.id);
  return { user: publicUser(user, roles), token: issueToken(user, roles) };
}

async function me(userId) {
  const user = await users.findById(userId);
  if (!user) throw new NotFoundError('Người dùng không tồn tại');
  return publicUser(user, await users.roleCodesOf(user.id));
}

module.exports = { register, login, me, issueToken, publicUser, hashPassword, verifyPassword, SYSTEM_ROLES };
