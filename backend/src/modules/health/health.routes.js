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

module.exports = router;
