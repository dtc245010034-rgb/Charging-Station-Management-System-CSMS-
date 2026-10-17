const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { pool } = require('../../db/pool');
const { AppError } = require('../../lib/errors');
const service = require('./health-metrics');

const router = secureRouter();

router.get('/health', { access: access('health:read') }, async (req, res) => {
  try {
    await pool.query('SELECT 1');
  } catch {
    throw new AppError(503, 'DB_UNAVAILABLE', 'Cơ sở dữ liệu không sẵn sàng');
  }
  res.json({ ok: true, service: 'csms-backend', database: 'postgresql', time: new Date().toISOString() });
});

router.get('/health/overview', { access: access('health:overview') }, async (req, res) => {
  res.json({ points: await service.overview({ db: pool }) });
});

module.exports = router;
