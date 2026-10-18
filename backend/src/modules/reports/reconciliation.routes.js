const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { reconciliationPeriodQuery } = require('../../lib/schemas');
const service = require('./reconciliation');

const router = secureRouter();

router.get('/reports/reconciliation', { access: access('reports:reconcile') }, async (req, res) => {
  res.json(await service.build(reconciliationPeriodQuery.parse(req.query)));
});

module.exports = router;
