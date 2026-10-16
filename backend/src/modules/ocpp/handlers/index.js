const { bootNotificationHandler } = require('./boot-notification');
const { createHeartbeatHandler } = require('./heartbeat');
const { createAuthorizeHandler } = require('./authorize');
const { createStatusNotificationHandler } = require('./status-notification');
const { createStartTransactionHandler } = require('./start-transaction');
const { createStopTransactionHandler } = require('./stop-transaction');
const { createMeterValuesHandler } = require('./meter-values');

function createOcppHandlers({ ocppPool, env, now, rebalanceStation = null }) {
  return {
    BootNotification: bootNotificationHandler,
    Heartbeat: createHeartbeatHandler({ now }),
    StatusNotification: createStatusNotificationHandler({
      pool: ocppPool,
      errorDedupSeconds: env.OCPP_ERROR_DEDUP_SECONDS,
      rebalanceStation,
    }),
    Authorize: createAuthorizeHandler({ pool: ocppPool }),
    StartTransaction: createStartTransactionHandler({ pool: ocppPool, rebalanceStation }),
    StopTransaction: createStopTransactionHandler({ pool: ocppPool, rebalanceStation }),
    MeterValues: createMeterValuesHandler({ pool: ocppPool }),
  };
}

module.exports = {
  createOcppHandlers,
  bootNotificationHandler,
  createHeartbeatHandler,
  createAuthorizeHandler,
  createStatusNotificationHandler,
  createStartTransactionHandler,
  createStopTransactionHandler,
  createMeterValuesHandler,
};
