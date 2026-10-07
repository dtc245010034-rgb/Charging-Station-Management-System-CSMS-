const { bootNotificationHandler } = require('./boot-notification');
const { createHeartbeatHandler } = require('./heartbeat');
const { createAuthorizeHandler } = require('./authorize');
const { createStatusNotificationHandler } = require('./status-notification');
const { createStartTransactionHandler } = require('./start-transaction');

function createOcppHandlers({ ocppPool, env, now }) {
  return {
    BootNotification: bootNotificationHandler,
    Heartbeat: createHeartbeatHandler({ now }),
    StatusNotification: createStatusNotificationHandler({
      pool: ocppPool,
      errorDedupSeconds: env.OCPP_ERROR_DEDUP_SECONDS,
    }),
    Authorize: createAuthorizeHandler({ pool: ocppPool }),
    StartTransaction: createStartTransactionHandler({ pool: ocppPool }),
  };
}

module.exports = {
  createOcppHandlers,
  bootNotificationHandler,
  createHeartbeatHandler,
  createAuthorizeHandler,
  createStatusNotificationHandler,
  createStartTransactionHandler,
};
