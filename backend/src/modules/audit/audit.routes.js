const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { BadRequestError } = require('../../lib/errors');
const audit = require('./audit.repository');

const router = secureRouter();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function queryText(value, label, maxLength) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new BadRequestError(`${label} không hợp lệ`);
  }
  return value.trim() || null;
}

function queryDate(value, label) {
  const date = queryText(value, label, 10);
  if (date === null) return null;
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new BadRequestError(`${label} phải có định dạng YYYY-MM-DD`);
  }
  return date;
}

router.get('/audit-logs', { access: access('audit-logs:read') }, async (req, res) => {
  const chargePoint = queryText(req.query.charge_point, 'Mã trụ', 100);
  const user = queryText(req.query.user, 'Người thực hiện', 200);
  const from = queryDate(req.query.from, 'Ngày bắt đầu');
  const to = queryDate(req.query.to, 'Ngày kết thúc');
  const pageValue = queryText(req.query.page, 'Trang', 10);
  const page = pageValue === null ? 1 : Number(pageValue);
  if (!Number.isSafeInteger(page) || page < 1 || page > 42949672) {
    throw new BadRequestError('Trang phải là số nguyên dương hợp lệ');
  }
  if (from && to && from > to) {
    throw new BadRequestError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
  }

  res.json(await audit.list({ chargePoint, user, from, to, page }));
});

module.exports = router;
