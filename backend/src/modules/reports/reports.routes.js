const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { reportPeriodQuery, reconciliationPeriodQuery } = require('../../lib/schemas');
const { BadRequestError } = require('../../lib/errors');
const service = require('./reports.service');
const reconciliation = require('./reconciliation');
const { toCsv } = require('./csv');

const router = secureRouter();
const revenueTextColumns = ['stationName', 'chargePointCode'];
const reconciliationTextColumns = ['type', 'stationName', 'chargePointCode', 'billingStatus', 'billingReason'];
const revenueHeaders = ['stationName', 'chargePointCode', 'connectorNo', 'sessions', 'totalWh', 'energyDong', 'idleDong', 'totalDong'];
const reconciliationHeaders = [
  'sessionId', 'type', 'stationName', 'chargePointCode', 'connectorNo', 'diffDong',
  'diffWh', 'billingStatus', 'billingReason', 'invoiceTotalDong', 'recalculatedDong',
  'meterWh', 'billedWh',
];

function csvDelimiter(query) {
  const value = query.delimiter ?? 'semicolon';
  if (value === 'semicolon') return ';';
  if (value === 'comma') return ',';
  throw new BadRequestError('Delimiter CSV không hợp lệ');
}

router.get('/reports/revenue', { access: access('reports:revenue') }, async (req, res) => {
  res.json(await service.revenue(req.user, reportPeriodQuery.parse(req.query)));
});

router.get('/reports/revenue.csv', { access: access('reports:revenue') }, async (req, res) => {
  const delimiter = csvDelimiter(req.query);
  const result = await service.revenue(req.user, reportPeriodQuery.parse(req.query));
  const csv = toCsv(revenueHeaders, result.rows, { delimiter, textColumns: revenueTextColumns });
  res.attachment('bao-cao-doanh-thu.csv').set('Content-Type', 'text/csv; charset=utf-8').send(csv);
});

router.get('/reports/reconciliation.csv', { access: access('reports:reconcile') }, async (req, res) => {
  const delimiter = csvDelimiter(req.query);
  const result = await reconciliation.build(reconciliationPeriodQuery.parse(req.query));
  const csv = toCsv(reconciliationHeaders, result.issues, { delimiter, textColumns: reconciliationTextColumns });
  res.attachment('bao-cao-doi-soat.csv').set('Content-Type', 'text/csv; charset=utf-8').send(csv);
});

module.exports = router;
