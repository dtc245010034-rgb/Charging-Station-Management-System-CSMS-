const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { reportPeriodQuery, reconciliationPeriodQuery } = require('../../lib/schemas');
const service = require('./reports.service');
const reconciliation = require('./reconciliation');
const { toCsv } = require('./csv');

const router = secureRouter();
const revenueHeaders = ['stationName', 'chargePointCode', 'connectorNo', 'sessions', 'totalWh', 'energyDong', 'idleDong', 'totalDong'];
const reconciliationHeaders = [
  'sessionId', 'type', 'stationName', 'chargePointCode', 'connectorNo', 'diffDong',
  'diffWh', 'billingStatus', 'billingReason', 'invoiceTotalDong', 'recalculatedDong',
  'meterWh', 'billedWh',
];

router.get('/reports/revenue', { access: access('reports:revenue') }, async (req, res) => {
  res.json(await service.revenue(req.user, reportPeriodQuery.parse(req.query)));
});

router.get('/reports/revenue.csv', { access: access('reports:revenue') }, async (req, res) => {
  const result = await service.revenue(req.user, reportPeriodQuery.parse(req.query));
  const csv = toCsv(revenueHeaders, result.rows);
  res.attachment('bao-cao-doanh-thu.csv').set('Content-Type', 'text/csv; charset=utf-8').send(csv);
});

router.get('/reports/reconciliation.csv', { access: access('reports:reconcile') }, async (req, res) => {
  const result = await reconciliation.build(reconciliationPeriodQuery.parse(req.query));
  const csv = toCsv(reconciliationHeaders, result.issues);
  res.attachment('bao-cao-doi-soat.csv').set('Content-Type', 'text/csv; charset=utf-8').send(csv);
});

module.exports = router;
