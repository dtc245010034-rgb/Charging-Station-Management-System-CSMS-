const express = require('express');
const { authenticate, allow } = require('../middlewares/authenticate');
const { ForbiddenError } = require('../lib/errors');
const { ROLES } = require('../lib/roles');

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Mọi route đã đăng ký qua secureRouter (dùng cho test quét).
const registry = [];

function validateAccess(access, where) {
  const valid = access === 'public'
    || (Array.isArray(access) && access.length > 0 && access.every((role) => ROLES.includes(role)));
  if (!valid) throw new Error(`access không hợp lệ cho ${where}: dùng 'public' hoặc mảng vai trò trong ${ROLES.join(', ')}`);
}

const denyUndeclared = (req, res, next) => next(new ForbiddenError('Route chưa khai báo quyền truy cập'));

// Bọc Express Router: router.get(path, { access }, ...handlers).
// Thiếu access → 403 mặc định (kể cả ADMIN) và cảnh báo lúc khởi động.
function secureRouter() {
  const router = express.Router();

  for (const method of METHODS) {
    const register = router[method].bind(router);
    router[method] = (path, ...args) => {
      const hasOptions = args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0]);
      const access = hasOptions ? args[0].access : undefined;
      const handlers = hasOptions ? args.slice(1) : args;
      const where = `${method.toUpperCase()} ${path}`;

      registry.push({ method: method.toUpperCase(), path, access });
      if (access === undefined) {
        console.warn(`[routeGuard] ${where} chưa khai báo access → từ chối mặc định (403)`);
        return register(path, denyUndeclared);
      }
      validateAccess(access, where);
      const guards = access === 'public' ? [] : [authenticate, allow(...access)];
      return register(path, ...guards, ...handlers);
    };
  }
  for (const method of ['all', 'use']) {
    router[method] = () => { throw new Error(`secureRouter không hỗ trợ router.${method}(); khai từng route với { access }`); };
  }
  return router;
}

module.exports = { secureRouter, registry };
