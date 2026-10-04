const jwt = require('jsonwebtoken');
const env = require('../config/env');
const users = require('../modules/users/users.repository');
const { UnauthorizedError, ForbiddenError } = require('../lib/errors');

async function authenticate(req, res, next) {
  // Chỉ nhận phiên qua cookie httpOnly (không nhận Authorization: Bearer).
  const token = req.cookies?.token || null;
  if (!token) return next(new UnauthorizedError());

  const invalid = () => next(new UnauthorizedError('Phiên đăng nhập đã hết hạn hoặc không hợp lệ'));
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    return invalid();
  }
  // Token bị thu hồi khi đăng xuất (token_version đổi) hoặc tài khoản không còn tồn tại; token cũ không có `tv` tính là 0.
  const current = /^\d{1,18}$/.test(String(payload.id)) ? await users.tokenVersionOf(payload.id) : null;
  if (current === null || current !== (payload.tv ?? 0)) return invalid();
  req.user = { ...payload, ip: req.ip };
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
