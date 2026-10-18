const jwt = require('jsonwebtoken');
const env = require('../config/env');
const users = require('../modules/users/users.repository');
const { UnauthorizedError, ForbiddenError } = require('../lib/errors');

async function authenticate(req, res, next) {
  // Chỉ nhận phiên qua cookie httpOnly (không nhận Authorization: Bearer).
  const token = req.cookies?.token || null;
  if (!token) return next(new UnauthorizedError());

  const invalid = (msg = 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ') => next(new UnauthorizedError(msg));
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    return invalid();
  }

  if (!/^\d{1,18}$/.test(String(payload.id))) return invalid();

  const authContext = await users.getAuthContext(payload.id);
  if (!authContext) return invalid();
  if (authContext.disabled_at) {
    return next(new UnauthorizedError('Tài khoản đã bị khoá'));
  }
  if (authContext.token_version !== (payload.tv ?? 0)) {
    return invalid();
  }

  req.user = {
    ...payload,
    roles: authContext.roles,
    role: authContext.roles[0] || payload.role,
    ip: req.ip,
  };
  return next();
}

function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    const userRoles = req.user.roles || [req.user.role];
    const hasRole = roles.some((r) => userRoles.includes(r) || req.user.role === r);
    return hasRole ? next() : next(new ForbiddenError());
  };
}

module.exports = { authenticate, allow };
