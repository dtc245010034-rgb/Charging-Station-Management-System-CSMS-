const { z } = require('zod');

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

const ownerIdParam = z.object({
  ownerId: z.string()
    .regex(/^[1-9]\d*$/, 'ownerId phải là số nguyên dương')
    .refine((value) => Number.isSafeInteger(Number(value)), 'ownerId vượt giới hạn'),
});

const shareRateBody = z.object({
  shareBp: z.number().int().min(0).max(10000),
  includeIdle: z.boolean(),
  effectiveFrom: z.string().refine(validDate, 'Ngày hiệu lực không hợp lệ YYYY-MM-DD'),
  note: z.string().trim().max(500).optional(),
});

module.exports = { ownerIdParam, shareRateBody };
