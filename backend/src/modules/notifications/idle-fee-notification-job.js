const { sanitizeErrorMessage } = require('../../lib/constants');
const { notifySessionEvent } = require('./notify');

const IDLE_NOTIFICATION_SCAN_BATCH_SIZE = 50;
const IDLE_NOTIFICATION_SCAN_INTERVAL_MS = 30_000;

async function findSessionsPastIdleGrace(db, limit = IDLE_NOTIFICATION_SCAN_BATCH_SIZE) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('limit must be a positive safe integer');
  }

  const database = db || require('../../db/pool').pool;
  return database.query(
    `SELECT cs.id
     FROM charging_sessions cs
     JOIN charge_points cp ON cp.id = cs.charge_point_id
     JOIN LATERAL (
       SELECT t.idle_grace_min
       FROM tariffs t
       WHERE t.station_id = cp.station_id
         AND t.effective_from <= cs.started_at
       ORDER BY t.effective_from DESC, t.version DESC
       LIMIT 1
     ) tariff ON true
     WHERE cs.status = 'COMPLETED'
       AND cs.billing_status = 'WAITING_IDLE'
       AND cs.billing_idle_from IS NOT NULL
       AND cs.billing_idle_from + make_interval(mins => tariff.idle_grace_min) <= CURRENT_TIMESTAMP
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.session_id = cs.id AND n.kind = 'IDLE_FEE_STARTED'
       )
     ORDER BY cs.billing_idle_from, cs.id
     LIMIT $1`,
    [limit]
  );
}

async function runIdleFeeNotificationBatch({
  db,
  limit = IDLE_NOTIFICATION_SCAN_BATCH_SIZE,
  logError = console.error,
} = {}) {
  const database = db || require('../../db/pool').pool;
  const sessions = await findSessionsPastIdleGrace(database, limit);
  let notified = 0;

  for (const session of sessions.rows) {
    const result = await notifySessionEvent({
      sessionId: session.id,
      kind: 'IDLE_FEE_STARTED',
      db: database,
      logError,
    });
    if (result.created) notified += 1;
  }
  return { notified };
}

function startIdleFeeNotificationJob({
  db,
  intervalMs = IDLE_NOTIFICATION_SCAN_INTERVAL_MS,
  limit = IDLE_NOTIFICATION_SCAN_BATCH_SIZE,
  logError = console.error,
} = {}) {
  let running = null;

  async function run() {
    if (!running) {
      running = runIdleFeeNotificationBatch({ db, limit, logError })
        .catch((error) => {
          logError('[Notifications] Không thể quét phiên bắt đầu tính phí chiếm trụ:', sanitizeErrorMessage(error?.message || error));
        })
        .finally(() => { running = null; });
    }
    return running;
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  IDLE_NOTIFICATION_SCAN_BATCH_SIZE,
  IDLE_NOTIFICATION_SCAN_INTERVAL_MS,
  findSessionsPastIdleGrace,
  runIdleFeeNotificationBatch,
  startIdleFeeNotificationJob,
};
