const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { reportPeriodQuery, reconciliationPeriodQuery } = require('../../lib/schemas');
const { BadRequestError } = require('../../lib/errors');
const service = require('./reports.service');
const reconciliation = require('./reconciliation');
const { toCsv } = require('./csv');

const router = secureRouter();
const audit = require('../audit/audit.repository');

const revenueHeaders = ['Trạm', 'Mã trụ', 'Đầu nối', 'Số phiên', 'Điện năng (Wh)', 'Tiền điện (đ)', 'Phí chiếm trụ (đ)', 'Tổng (đ)'];
const revenueTextColumns = ['Trạm', 'Mã trụ'];
const reconciliationHeaders = [
  'Mã phiên', 'Loại lệch', 'Trạm', 'Mã trụ', 'Đầu nối', 'Chênh lệch tiền (đ)',
  'Chênh lệch điện (Wh)', 'Trạng thái hoá đơn', 'Lý do', 'Tiền hoá đơn (đ)', 'Tiền tính lại (đ)',
  'Điện công tơ (Wh)', 'Điện tính tiền (Wh)',
];
const reconciliationTextColumns = ['Loại lệch', 'Trạm', 'Mã trụ', 'Trạng thái hoá đơn', 'Lý do'];

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
  const parsedQuery = reportPeriodQuery.parse(req.query);
  const result = await service.revenue(req.user, parsedQuery);

  const rows = result.rows.map((r) => ({
    'Trạm': r.stationName,
    'Mã trụ': r.chargePointCode,
    'Đầu nối': r.connectorNo,
    'Số phiên': r.sessions,
    'Điện năng (Wh)': r.totalWh,
    'Tiền điện (đ)': r.energyDong,
    'Phí chiếm trụ (đ)': r.idleDong,
    'Tổng (đ)': r.totalDong,
  }));

  rows.push({
    'Trạm': 'TỔNG',
    'Mã trụ': '',
    'Đầu nối': '',
    'Số phiên': result.total.sessions,
    'Điện năng (Wh)': result.total.totalWh,
    'Tiền điện (đ)': result.total.energyDong,
    'Phí chiếm trụ (đ)': result.total.idleDong,
    'Tổng (đ)': result.total.totalDong,
  });

  const csv = toCsv(revenueHeaders, rows, { delimiter, textColumns: revenueTextColumns });
  await audit.record(req.user.id, 'REPORT_EXPORTED', 'report', null, { type: 'REVENUE', from: parsedQuery.from, to: parsedQuery.to, delimiter: req.query.delimiter ?? 'semicolon' }, req.ip);

  res.setHeader('Cache-Control', 'no-store');
  res.attachment(`doanh-thu_${parsedQuery.from}_${parsedQuery.to}.csv`)
    .set('Content-Type', 'text/csv; charset=utf-8')
    .send(csv);
});

router.get('/reports/reconciliation.csv', { access: access('reports:reconcile') }, async (req, res) => {
  const delimiter = csvDelimiter(req.query);
  const parsedQuery = reconciliationPeriodQuery.parse(req.query);
  const result = await reconciliation.build(parsedQuery);

  const rows = result.issues.map((issue) => ({
    'Mã phiên': issue.sessionId,
    'Loại lệch': issue.type,
    'Trạm': issue.stationName,
    'Mã trụ': issue.chargePointCode,
    'Đầu nối': issue.connectorNo,
    'Chênh lệch tiền (đ)': issue.diffDong,
    'Chênh lệch điện (Wh)': issue.diffWh,
    'Trạng thái hoá đơn': issue.billingStatus,
    'Lý do': issue.billingReason,
    'Tiền hoá đơn (đ)': issue.invoiceTotalDong,
    'Tiền tính lại (đ)': issue.recalculatedDong,
    'Điện công tơ (Wh)': issue.meterWh,
    'Điện tính tiền (Wh)': issue.billedWh,
  }));

  const diffWhTotal = (BigInt(result.summary.whMeter || 0) - BigInt(result.summary.whBilled || 0)).toString();
  rows.push({
    'Mã phiên': 'TỔNG',
    'Loại lệch': '',
    'Trạm': '',
    'Mã trụ': '',
    'Đầu nối': '',
    'Chênh lệch tiền (đ)': result.summary.totalDiffDong,
    'Chênh lệch điện (Wh)': diffWhTotal,
    'Trạng thái hoá đơn': '',
    'Lý do': '',
    'Tiền hoá đơn (đ)': '',
    'Tiền tính lại (đ)': '',
    'Điện công tơ (Wh)': result.summary.whMeter,
    'Điện tính tiền (Wh)': result.summary.whBilled,
  });

  const csv = toCsv(reconciliationHeaders, rows, { delimiter, textColumns: reconciliationTextColumns });
  await audit.record(req.user.id, 'REPORT_EXPORTED', 'report', null, { type: 'RECONCILIATION', from: parsedQuery.from, to: parsedQuery.to, delimiter: req.query.delimiter ?? 'semicolon' }, req.ip);

  res.setHeader('Cache-Control', 'no-store');
  res.attachment(`doi-soat_${parsedQuery.from}_${parsedQuery.to}.csv`)
    .set('Content-Type', 'text/csv; charset=utf-8')
    .send(csv);
});

module.exports = router;
