const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { reportPeriodQuery } = require('../../lib/schemas');
const service = require('./reports.service');

const router = secureRouter();

router.get('/reports/revenue', { access: access('reports:revenue') }, async (req, res) => {
  res.json(await service.revenue(req.user, reportPeriodQuery.parse(req.query)));
});

module.exports = router;
