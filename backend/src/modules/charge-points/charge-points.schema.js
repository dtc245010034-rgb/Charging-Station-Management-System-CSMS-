const { z } = require('zod');

const createBody = z.object({
  code: z.string({ message: 'code là bắt buộc' }).min(1, 'code là bắt buộc'),
  model: z.string().nullish(),
  vendor: z.string().nullish(),
  status: z.string().default('UNKNOWN'),
  power_kw: z.unknown().optional(),
}, { message: 'code là bắt buộc' });

const updateBody = z.object({
  code: z.string().min(1).optional(),
  model: z.string().nullish(),
  vendor: z.string().nullish(),
  status: z.string().optional(),
  power_kw: z.unknown().optional(),
});

module.exports = { createBody, updateBody };
