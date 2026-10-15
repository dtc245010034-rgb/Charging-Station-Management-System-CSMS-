const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { periodMonthParam, reopenPeriodBody } = require('../../lib/schemas');
const periodsService = require('./periods.service');

const router = secureRouter();

router.get('/accounting/periods', {
  access: access('periods:manage'),
}, async (req, res) => {
  const periods = await periodsService.listPeriods();
  res.json(periods);
});

router.post('/accounting/periods/:month/close', {
  access: access('periods:manage'),
}, async (req, res) => {
  const { month } = periodMonthParam.parse(req.params);
  const result = await periodsService.closePeriod(req.user, month);
  res.json(result);
});

router.post('/accounting/periods/:month/reopen', {
  access: access('periods:reopen'),
}, async (req, res) => {
  const { month } = periodMonthParam.parse(req.params);
  const { reason } = reopenPeriodBody.parse(req.body);
  const result = await periodsService.reopenPeriod(req.user, month, reason);
  res.json(result);
});

module.exports = router;
