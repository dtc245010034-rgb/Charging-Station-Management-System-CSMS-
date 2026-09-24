const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { UnauthorizedError, ForbiddenError } = require('../lib/errors');

function authenticate(req, res, next) {
  // Chỉ nhận phiên qua cookie httpOnly (không nhận Authorization: Bearer).
  const token = req.cookies?.token || null;
  if (!token) return next(new UnauthorizedError());

  try {
    req.user = { ...jwt.verify(token, env.JWT_SECRET), ip: req.ip };
    return next();
  } catch {
    return next(new UnauthorizedError('Phiên đăng nhập đã hết hạn hoặc không hợp lệ'));
  }
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
