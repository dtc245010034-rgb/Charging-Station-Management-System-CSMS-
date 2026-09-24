const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { UnauthorizedError, ForbiddenError } = require('../lib/errors');

function authenticate(req, res, next) {
  // Read token from httpOnly cookie first, then fallback to Authorization header
  let token = req.cookies?.token || null;
  if (!token) {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) token = header.slice(7);
  }
  if (!token) return next(new UnauthorizedError());

  try {
    req.user = jwt.verify(token, env.JWT_SECRET);
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
