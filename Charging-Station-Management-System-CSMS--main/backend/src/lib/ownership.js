const audit = require('../modules/audit/audit.repository');
const env = require('../config/env');
const { ForbiddenError, NotFoundError } = require('./errors');
const { createRateLimiter } = require('./rate-limit');

// Chặn spam 403 làm phình audit_logs: mỗi tài khoản chỉ ghi tối đa N dòng ACCESS_DENIED mỗi phút.
const deniedLimiter = createRateLimiter({ limit: env.AUDIT_DENIED_LIMIT_PER_MINUTE, windowMs: 60000 });

// Gọi khi truy vấn đã lọc theo chủ sở hữu mà không ra dòng nào:
// tài nguyên có tồn tại → của người khác (403 + ACCESS_DENIED), không tồn tại → 404.
async function denyOrNotFound(actor, entity, id, exists, notFoundMessage) {
  if (!await exists(id)) throw new NotFoundError(notFoundMessage);
  if (deniedLimiter.take(`actor:${actor.id}`).allowed) await audit.record(actor.id, 'ACCESS_DENIED', entity, id, {}, actor.ip);
  throw new ForbiddenError();
}

module.exports = { denyOrNotFound };
