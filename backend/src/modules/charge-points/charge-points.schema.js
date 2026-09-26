const { z } = require('zod');
const powerKw = z.preprocess(
  (value) => value === null || value === '' || value === undefined ? undefined : Number(value),
  z.number({ message: 'power_kw phải là số' }).finite('power_kw phải là số hữu hạn').nonnegative('power_kw không được âm').optional()
);

const createBody = z.object({
  code: z.string({ message: 'code là bắt buộc' }).min(1, 'code là bắt buộc'),
  model: z.string().nullish(),
  vendor: z.string().nullish(),
  status: z.string().default('UNKNOWN'),
  power_kw: powerKw,
}, { message: 'code là bắt buộc' });

const updateBody = z.object({
  code: z.string().min(1).optional(),
  model: z.string().nullish(),
  vendor: z.string().nullish(),
  status: z.string().optional(),
  power_kw: powerKw,
});

module.exports = { createBody, updateBody };
