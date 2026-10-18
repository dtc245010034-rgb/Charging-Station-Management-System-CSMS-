const { z } = require('zod');
const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { BadRequestError } = require('../../lib/errors');
const service = require('./settlements.service');

const router = secureRouter();
const monthParam = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month phải có định dạng YYYY-MM'),
});

function parseMonth(params) {
  const parsed = monthParam.safeParse(params);
  if (!parsed.success) throw new BadRequestError('Tháng không hợp lệ', parsed.error.issues);
  return parsed.data.month;
}

router.post('/settlements/:month/generate', { access: access('settlements:manage') }, async (req, res) => {
  const result = await service.generate(req.user, parseMonth(req.params));
  res.status(result.duplicate ? 200 : 201).json(result);
});

router.get('/settlements/:month', { access: access('settlements:read') }, async (req, res) => {
  res.json(await service.getStatement(req.user, parseMonth(req.params)));
});

module.exports = router;
