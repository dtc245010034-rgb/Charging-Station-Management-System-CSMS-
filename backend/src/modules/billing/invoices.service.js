const sessionsService = require('../sessions/sessions.service');
const invoicesRepository = require('./invoices.repository');

async function getBySessionId(actor, sessionId, options = {}) {
  const db = options?.query ? options : options?.db || null;
  await sessionsService.getSessionById(actor, sessionId, { db, onDeny: options.onDeny });
  return invoicesRepository.findBySessionId(db, sessionId);
}

module.exports = { getBySessionId };
