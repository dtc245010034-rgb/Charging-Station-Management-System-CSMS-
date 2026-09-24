const env = require('../config/env');
const { AppError, ForbiddenError } = require('../lib/errors');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const allowedOrigins = env.APP_ORIGIN.split(',').map((origin) => origin.trim());

// Chống CSRF: request đổi dữ liệu phải là application/json và (nếu trình duyệt gửi) Origin hợp lệ.
// Form/text-plain cross-site không đặt được Content-Type JSON nên bị chặn.
function requireJson(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) return next(new ForbiddenError('Origin không hợp lệ'));
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Yêu cầu phải có Content-Type: application/json'));
  }
  return next();
}

module.exports = { requireJson };
