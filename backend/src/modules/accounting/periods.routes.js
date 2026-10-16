const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { accountingPeriodMonth, reopenPeriodBody } = require('../../lib/schemas');
const service = require('./periods.service');

const router = secureRouter();

router.get('/accounting/periods', { access: access('periods:manage') }, async (req, res) => {
  res.json({ periods: await service.list() });
});

router.post('/accounting/periods/:month/close', { access: access('periods:manage') }, async (req, res) => {
  const month = accountingPeriodMonth.parse(req.params.month);
  res.json(await service.close(req.user, month));
});

router.post('/accounting/periods/:month/reopen', { access: access('periods:reopen') }, async (req, res) => {
  const month = accountingPeriodMonth.parse(req.params.month);
  const body = reopenPeriodBody.parse(req.body ?? {});
  res.json(await service.reopen(req.user, month, body.reason));
});

module.exports = router;
