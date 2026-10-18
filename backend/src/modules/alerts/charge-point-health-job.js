const { sanitizeErrorMessage } = require('../../lib/constants');

const HEALTH_SCAN_INTERVAL_MS = 60_000;

async function scanChargePointHealth({
  db = require('../../db/pool').pool,
  offlineMinutes = Number(process.env.ALERT_OFFLINE_THRESHOLD_MINUTES || 10),
  errorMinutes = Number(process.env.ALERT_ERROR_WINDOW_MINUTES || 30),
  errorThreshold = Number(process.env.ALERT_ERROR_THRESHOLD || 5),
  logWarning = console.warn,
  simulateEmailFailure = false,
} = {}) {
  // 1. Quét trụ OFFLINE > offlineMinutes trên các trạm ACTIVE (A06)
  const offlineCandidates = await db.query(
    `SELECT cp.id AS charge_point_id, cp.station_id, s.owner_id
     FROM charge_points cp
     JOIN stations s ON s.id = cp.station_id
     WHERE s.status = 'ACTIVE'
       AND cp.status = 'OFFLINE'
       AND cp.last_seen_at < CURRENT_TIMESTAMP - ($1 || ' minutes')::interval
     ORDER BY cp.id`,
    [offlineMinutes]
  );

  // 2. Quét trụ có >= errorThreshold lỗi trong errorMinutes trên trạm ACTIVE
  const errorCandidates = await db.query(
    `SELECT cp.id AS charge_point_id, cp.station_id, s.owner_id, COUNT(e.id)::int AS recent_errors
     FROM charge_points cp
     JOIN stations s ON s.id = cp.station_id
     JOIN connector_errors e
       ON (e.charge_point_id = cp.id OR e.connector_id IN (SELECT id FROM connectors WHERE charge_point_id = cp.id))
      AND e.recorded_at >= CURRENT_TIMESTAMP - ($1 || ' minutes')::interval
     WHERE s.status = 'ACTIVE'
     GROUP BY cp.id, cp.station_id, s.owner_id
     HAVING COUNT(e.id) >= $2
     ORDER BY cp.id`,
    [errorMinutes, errorThreshold]
  );

  const alertsToProcess = [];
  for (const c of offlineCandidates.rows) {
    alertsToProcess.push({
      kind: 'CP_OFFLINE',
      charge_point_id: c.charge_point_id,
      station_id: c.station_id,
      owner_id: c.owner_id,
      message: `Trụ sạc đã ngoại tuyến hơn ${offlineMinutes} phút`,
      details: { offlineMinutes },
      dedupKey: `cp:${c.charge_point_id}`,
    });
  }
  for (const c of errorCandidates.rows) {
    alertsToProcess.push({
      kind: 'CP_ERRORS',
      charge_point_id: c.charge_point_id,
      station_id: c.station_id,
      owner_id: c.owner_id,
      message: `Trụ sạc báo lỗi ít nhất ${errorThreshold} lần trong ${errorMinutes} phút`,
      details: { recentErrors: c.recent_errors, errorMinutes, errorThreshold },
      dedupKey: `cp:${c.charge_point_id}`,
    });
  }

  let created = 0;

  for (const item of alertsToProcess) {
    let alertId = null;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO alerts (kind, severity, station_id, charge_point_id, message, details, dedup_key)
         VALUES ($1, 'WARNING', $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (kind, dedup_key) WHERE closed_at IS NULL DO NOTHING
         RETURNING id`,
        [
          item.kind,
          item.station_id,
          item.charge_point_id,
          item.message,
          JSON.stringify(item.details),
          item.dedupKey,
        ]
      );
      created += inserted.rowCount;
      if (inserted.rowCount) {
        alertId = inserted.rows[0].id;
      } else {
        const existing = await client.query(
          `SELECT id FROM alerts
           WHERE kind = $1 AND dedup_key = $2 AND closed_at IS NULL AND notified_at IS NULL`,
          [item.kind, item.dedupKey]
        );
        if (existing.rowCount) alertId = existing.rows[0].id;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logWarning(`[Alert] Tạo cảnh báo thất bại: ${sanitizeErrorMessage(err?.message || err)}`);
      continue;
    } finally {
      client.release();
    }

    // K4 / A08: Thao tác email độc lập, lỗi không làm mất cảnh báo
    if (alertId) {
      const emailClient = await db.connect();
      try {
        if (simulateEmailFailure) {
          throw new Error('Simulated email enqueue failure');
        }
        await emailClient.query('BEGIN');
        await emailClient.query(
          `INSERT INTO email_outbox (user_id, subject, body)
           SELECT DISTINCT u.id, 'Trụ sạc cần kiểm tra', $1
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
           WHERE u.disabled_at IS NULL
             AND (r.code IN ('ADMIN', 'OPERATOR') OR u.id = $2)`,
          [item.message, item.owner_id]
        );
        await emailClient.query(
          'UPDATE alerts SET notified_at = CURRENT_TIMESTAMP WHERE id = $1 AND notified_at IS NULL',
          [alertId]
        );
        await emailClient.query('COMMIT');
      } catch (emailErr) {
        await emailClient.query('ROLLBACK');
        logWarning(`[Alert] Gửi email cảnh báo thất bại, sẽ gửi bù sau | alertId=${alertId}: ${sanitizeErrorMessage(emailErr?.message || emailErr)}`);
      } finally {
        emailClient.release();
      }
    }
  }

  return { created };
}

function startChargePointHealthJob({
  db,
  intervalMs = HEALTH_SCAN_INTERVAL_MS,
  logError = console.error,
} = {}) {
  let running = false;
  async function run() {
    if (running) return;
    running = true;
    try {
      await scanChargePointHealth({ db });
    } catch (error) {
      logError(`[Job] Failed to scan charge-point health: ${sanitizeErrorMessage(error?.message || error)}`);
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  HEALTH_SCAN_INTERVAL_MS,
  scanChargePointHealth,
  startChargePointHealthJob,
};
