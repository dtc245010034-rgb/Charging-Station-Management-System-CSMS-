const { z } = require('zod');

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : value);
const normalizeUpper = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

const createBody = z.object({
  code: z.preprocess(normalizeUpper, z.string({ message: 'code là bắt buộc' }).min(1, 'code là bắt buộc').max(50, 'Mã trụ tối đa 50 ký tự')),
  model: z.preprocess(normalizeString, z.string().trim().min(1).nullish()),
  vendor: z.preprocess(normalizeString, z.string().trim().min(1).nullish()),
  status: z.preprocess(normalizeUpper, z.string().default('UNKNOWN')),
  power_kw: z.unknown().optional(),
  connector_count: z.number().int().min(1).max(4).default(4),
}, { message: 'code là bắt buộc' });

const updateBody = z.object({
  code: z.preprocess(normalizeUpper, z.string().min(1).max(50).optional()),
  model: z.preprocess(normalizeString, z.string().trim().min(1).nullish()),
  vendor: z.preprocess(normalizeString, z.string().trim().min(1).nullish()),
  status: z.preprocess(normalizeUpper, z.string().optional()),
  power_kw: z.unknown().optional(),
});

module.exports = { createBody, updateBody };
