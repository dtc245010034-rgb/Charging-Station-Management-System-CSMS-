const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { pool } = require('../../db/pool');
const { AppError } = require('../../lib/errors');

const router = secureRouter();

router.get('/health', { access: access('health:read') }, async (req, res) => {
  try {
    await pool.query('SELECT 1');
  } catch {
    throw new AppError(503, 'DB_UNAVAILABLE', 'Cơ sở dữ liệu không sẵn sàng');
  }
  res.json({ ok: true, service: 'csms-backend', database: 'postgresql', time: new Date().toISOString() });
});

router.get('/health/dashboard', { access: access('health:dashboard') }, async (req, res) => {
  const result = await pool.query(
    `SELECT CURRENT_TIMESTAMP AS measured_at,
            (SELECT COUNT(*)::int FROM charge_points WHERE status = 'ONLINE') AS online_charge_points,
            (SELECT COUNT(*)::int FROM charging_sessions WHERE status = 'CHARGING') AS active_sessions,
            (SELECT COUNT(*)::int
             FROM alerts
             WHERE opened_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') AS recent_errors_count,
            COALESCE((
              SELECT JSONB_AGG(recent.alert ORDER BY recent.opened_at DESC, recent.id DESC)
              FROM (
                SELECT a.id, a.opened_at,
                       JSONB_BUILD_OBJECT(
                         'id', a.id::text,
                         'kind', a.kind,
                         'severity', a.severity,
                         'stationName', s.name,
                         'chargePointCode', cp.code,
                         'message', a.message,
                         'openedAt', a.opened_at,
                         'closedAt', a.closed_at
                       ) AS alert
                FROM alerts a
                JOIN stations s ON s.id = a.station_id
                LEFT JOIN charge_points cp ON cp.id = a.charge_point_id
                WHERE a.opened_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
                ORDER BY a.opened_at DESC, a.id DESC
                LIMIT 20
              ) recent
            ), '[]'::jsonb) AS recent_errors`
  );
  const row = result.rows[0];
  res.json({
    measuredAt: row.measured_at,
    onlineChargePoints: row.online_charge_points,
    activeSessions: row.active_sessions,
    recentErrorsCount: row.recent_errors_count,
    recentErrors: row.recent_errors,
  });
});

module.exports = router;
