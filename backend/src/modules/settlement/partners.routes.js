const { z } = require('zod');
const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { BadRequestError } = require('../../lib/errors');
const service = require('./partners.service');

const router = secureRouter();

const ownerIdParam = z.object({
  ownerId: z.string().regex(/^[1-9]\d*$/, 'ownerId phải là số nguyên dương').transform((v) => Number(v)),
});

const shareRateBody = z.object({
  shareBp: z.number().int().min(0, 'shareBp phải từ 0 đến 10000').max(10000, 'shareBp phải từ 0 đến 10000'),
  includeIdle: z.boolean().optional().default(true),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom phải có định dạng YYYY-MM-DD'),
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional(),
});

router.get('/partners', { access: access('partner-rates:read') }, async (req, res) => {
  const partners = await service.listPartners(req.user);
  res.json({ partners });
});

router.get('/partners/:ownerId/share-rates', { access: access('partner-rates:read') }, async (req, res) => {
  const parseResult = ownerIdParam.safeParse(req.params);
  if (!parseResult.success) {
    throw new BadRequestError('ownerId không hợp lệ', parseResult.error.errors);
  }
  const shareRates = await service.listShareRates(req.user, parseResult.data.ownerId);
  res.json({ share_rates: shareRates });
});

router.post('/partners/:ownerId/share-rates', { access: access('partner-rates:manage') }, async (req, res) => {
  const paramResult = ownerIdParam.safeParse(req.params);
  if (!paramResult.success) {
    throw new BadRequestError('ownerId không hợp lệ', paramResult.error.errors);
  }
  const bodyResult = shareRateBody.safeParse(req.body);
  if (!bodyResult.success) {
    throw new BadRequestError('Dữ liệu không hợp lệ', bodyResult.error.errors);
  }

  const created = await service.createShareRate(req.user, paramResult.data.ownerId, bodyResult.data);
  res.status(201).json(created);
});

module.exports = router;
