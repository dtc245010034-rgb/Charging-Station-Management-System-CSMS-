const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { revenueQuery } = require('../../lib/schemas');
const reportsService = require('./reports.service');

const router = secureRouter();

router.get('/reports/revenue', {
  access: access('reports:revenue'),
}, async (req, res) => {
  const query = revenueQuery.parse(req.query);
  const data = await reportsService.getRevenueReport(req.user, query);
  res.json(data);
});

module.exports = router;
