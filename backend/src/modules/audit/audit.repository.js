const { prepare } = require('../../db/pool');

const record = (userId, action, entity, entityId, metadata = {}) =>
  prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?)')
    .run(userId || null, action, entity, entityId || null, JSON.stringify(metadata));

module.exports = { record };
