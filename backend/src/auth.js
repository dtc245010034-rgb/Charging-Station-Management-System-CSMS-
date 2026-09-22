const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const bcrypt = require('bcryptjs');
const db = require('./db');

const secret = process.env.JWT_SECRET || 'development-secret';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function issueToken(user, roles = []) {
  const primaryRole = user.role || (roles.length ? roles[0] : 'OPERATOR');
  const allRoles = Array.from(new Set([...(roles.length ? roles : []), primaryRole]));
  return jwt.sign(
    { id: user.id, email: user.email, role: primaryRole, roles: allRoles },
    secret,
    { expiresIn: '8h' }
  );
}

function authenticate(req, res, next) {
  // Read token from httpOnly cookie first, then fallback to Authorization header
  let token = req.cookies?.token || null;
  if (!token) {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      token = header.slice(7);
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Yêu cầu đăng nhập' });
  }

  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ' });
  }
}

function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Yêu cầu đăng nhập' });
    const userRoles = req.user.roles || [req.user.role];
    const hasRole = roles.some((r) => userRoles.includes(r) || req.user.role === r);
    if (!hasRole) return res.status(403).json({ error: 'Không đủ quyền truy cập' });
    next();
  };
}

async function getUserRoles(userId) {
  try {
    const rows = await db.prepare(
      'SELECT r.code, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?'
    ).all(userId);
    return rows.map((r) => r.code);
  } catch {
    return [];
  }
}

function publicUser(user, roles = []) {
  const primaryRole = user.role || (roles.length ? roles[0] : 'OPERATOR');
  const allRoles = Array.from(new Set([...(roles.length ? roles : []), primaryRole]));
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: primaryRole,
    roles: allRoles,
    failed_attempts: user.failed_attempts || 0,
    locked_until: user.locked_until || null,
    created_at: user.created_at,
  };
}

async function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function verifyPassword(user, password) {
  if (!user || !user.password_hash || !password) return false;
  try {
    if (user.password_hash.startsWith('$argon2')) {
      return await argon2.verify(user.password_hash, password);
    }
    // Fallback support for legacy bcrypt hashes & auto-upgrade
    if (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$')) {
      const match = bcrypt.compareSync(password, user.password_hash);
      if (match) {
        hashPassword(password).then((newHash) => {
          db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, user.id);
        }).catch(() => {});
      }
      return match;
    }
    return false;
  } catch {
    return false;
  }
}

// User-level Lockout in PostgreSQL (table users)
async function checkUserLock(user) {
  if (!user || !user.locked_until) return { locked: false };
  const now = new Date();
  const lockedUntil = new Date(user.locked_until);
  if (lockedUntil > now) {
    const remainingMs = lockedUntil.getTime() - now.getTime();
    const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
    return {
      locked: true,
      lockedUntil: user.locked_until,
      remainingMinutes,
      message: `Tài khoản tạm thời bị khóa do nhập sai mật khẩu quá ${MAX_ATTEMPTS} lần liên tiếp. Vui lòng thử lại sau ${remainingMinutes} phút.`,
    };
  }
  return { locked: false };
}

async function recordUserFailedLogin(user) {
  if (!user) return;
  const now = new Date();
  let count = 1;

  if (user.locked_until && new Date(user.locked_until) <= now) {
    count = 1;
  } else {
    count = Number(user.failed_attempts || 0) + 1;
  }

  const lockedUntil = count >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000) : null;
  await db.prepare(
    'UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(count, lockedUntil, user.id);
}

async function resetUserFailedAttempts(userId) {
  if (!userId) return;
  await db.prepare(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(userId);
}

module.exports = {
  authenticate,
  allow,
  issueToken,
  publicUser,
  hashPassword,
  verifyPassword,
  checkUserLock,
  recordUserFailedLogin,
  resetUserFailedAttempts,
  getUserRoles,
  MAX_ATTEMPTS,
  LOCKOUT_MINUTES,
  db,
};
