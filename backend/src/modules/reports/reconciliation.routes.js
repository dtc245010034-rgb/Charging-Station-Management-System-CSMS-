const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { reconciliationPeriodQuery } = require('../../lib/schemas');
const service = require('./reconciliation');
const { toCsv } = require('../../lib/csv');

const router = secureRouter();

router.get('/reports/reconciliation', { access: access('reports:reconcile') }, async (req, res) => {
  res.json(await service.build(reconciliationPeriodQuery.parse(req.query)));
});

router.get('/reports/reconciliation.csv', { access: access('reports:reconcile') }, async (req, res) => {
  const period = reconciliationPeriodQuery.parse(req.query);
  const report = await service.build(period);
  const columns = [
    'session_id', 'type', 'station_name', 'charge_point_code', 'connector_no',
    'diff_dong', 'diff_wh', 'billing_status', 'billing_reason', 'meter_wh',
    'billed_wh', 'invoice_total_dong', 'recalculated_dong', 'ledger_amount_dong',
  ];
  const rows = report.issues.map((issue) => ({
    session_id: issue.sessionId,
    type: issue.type,
    station_name: issue.stationName,
    charge_point_code: issue.chargePointCode,
    connector_no: issue.connectorNo,
    diff_dong: issue.diffDong,
    diff_wh: issue.diffWh,
    billing_status: issue.billingStatus,
    billing_reason: issue.billingReason,
    meter_wh: issue.meterWh,
    billed_wh: issue.billedWh,
    invoice_total_dong: issue.invoiceTotalDong,
    recalculated_dong: issue.recalculatedDong,
    ledger_amount_dong: issue.ledgerAmountDong,
  }));
  res
    .status(200)
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="reconciliation-${period.from}-${period.to}.csv"`)
    .send(toCsv(columns, rows));
});

module.exports = router;
