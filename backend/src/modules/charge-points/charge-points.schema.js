const { z } = require('zod');

const createBody = z.object({
  code: z.string({ message: 'code là bắt buộc' }).trim().min(1, 'code là bắt buộc').max(50, 'Mã trụ tối đa 50 ký tự'),
  model: z.string().nullish(),
  vendor: z.string().nullish(),
  status: z.string().default('UNKNOWN'),
  power_kw: z.unknown().optional(),
  connector_count: z.number().int().min(1).max(4).default(4),
}, { message: 'code là bắt buộc' });

const updateBody = z.object({
  code: z.string().trim().min(1).max(50).optional(),
  model: z.string().nullish(),
  vendor: z.string().nullish(),
  status: z.string().optional(),
  power_kw: z.unknown().optional(),
});

module.exports = { createBody, updateBody };
