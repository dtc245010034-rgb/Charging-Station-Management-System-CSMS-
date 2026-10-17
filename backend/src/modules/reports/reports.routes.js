const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { reportPeriodQuery } = require('../../lib/schemas');
const service = require('./reports.service');
const { toCsv } = require('../../lib/csv');

const router = secureRouter();

router.get('/reports/revenue', { access: access('reports:revenue') }, async (req, res) => {
  res.json(await service.revenue(req.user, reportPeriodQuery.parse(req.query)));
});

router.get('/reports/revenue.csv', { access: access('reports:revenue') }, async (req, res) => {
  const period = reportPeriodQuery.parse(req.query);
  const report = await service.revenue(req.user, period);
  const columns = [
    'station_name', 'charge_point_code', 'connector_no', 'sessions',
    'total_wh', 'energy_dong', 'idle_dong', 'total_dong',
  ];
  const rows = report.rows.map((row) => ({
    station_name: row.stationName,
    charge_point_code: row.chargePointCode,
    connector_no: row.connectorNo,
    sessions: row.sessions,
    total_wh: row.totalWh,
    energy_dong: row.energyDong,
    idle_dong: row.idleDong,
    total_dong: row.totalDong,
  }));
  rows.push({
    station_name: 'TOTAL',
    charge_point_code: '',
    connector_no: '',
    sessions: report.total.sessions,
    total_wh: report.total.totalWh,
    energy_dong: report.total.energyDong,
    idle_dong: report.total.idleDong,
    total_dong: report.total.totalDong,
  });
  res
    .status(200)
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="revenue-${period.from}-${period.to}.csv"`)
    .send(toCsv(columns, rows));
});

module.exports = router;
