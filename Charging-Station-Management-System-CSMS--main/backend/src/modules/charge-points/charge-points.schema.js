const { z } = require('zod');
const { CHARGE_POINT_CODE_PATTERN, CHARGE_POINT_CODE_MESSAGE } = require('../../lib/constants');

const NO_STATUS = 'Trạng thái trụ do hệ thống cập nhật, không được chỉ định';
const code = z.string({ message: 'code là bắt buộc' })
  .trim()
  .min(1, 'code là bắt buộc')
  .max(50, 'Mã trụ tối đa 50 ký tự')
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(CHARGE_POINT_CODE_PATTERN, CHARGE_POINT_CODE_MESSAGE));
const powerKw = z.coerce.number({ message: 'power_kw phải là số' }).min(0, 'power_kw phải >= 0');

const createBody = z.object({
  code,
  model: z.string().nullish(),
  vendor: z.string().nullish(),
  status: z.undefined({ message: NO_STATUS }).optional(),
  power_kw: powerKw.optional().default(0),
  connector_count: z.number().int().min(1).max(4).default(4),
}, { message: 'code là bắt buộc' });

const updateBody = z.object({
  code: code.optional(),
  model: z.string().nullish(),
  vendor: z.string().nullish(),
  status: z.undefined({ message: NO_STATUS }).optional(),
  power_kw: powerKw.optional(),
});

module.exports = { createBody, updateBody };
