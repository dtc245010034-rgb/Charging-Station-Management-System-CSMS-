const audit = require('../modules/audit/audit.repository');
const { ForbiddenError, NotFoundError } = require('./errors');

// Gọi khi truy vấn đã lọc theo chủ sở hữu mà không ra dòng nào:
// tài nguyên có tồn tại → của người khác (403 + ACCESS_DENIED), không tồn tại → 404.
async function denyOrNotFound(actor, entity, id, exists, notFoundMessage) {
  if (!await exists(id)) throw new NotFoundError(notFoundMessage);
  await audit.record(actor.id, 'ACCESS_DENIED', entity, id, {}, actor.ip);
  throw new ForbiddenError();
}

module.exports = { denyOrNotFound };
