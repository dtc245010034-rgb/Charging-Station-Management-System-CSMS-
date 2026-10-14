const { z } = require('zod');

const positiveInt = (label) => z.string()
  .regex(/^[1-9]\d*$/, `${label} phải là số nguyên dương`)
  .refine((value) => Number.isSafeInteger(Number(value)), `${label} phải là số nguyên dương`);

const idParam = z.object({ id: positiveInt('id') });
const stationIdParam = z.object({ stationId: positiveInt('stationId') });
const walletDriverIdParam = z.object({ driverId: positiveInt('driverId') });
const walletTransactionsQuery = z.object({
  page: z.string()
    .regex(/^[1-9]\d*$/, 'page phải là số nguyên dương')
    .refine((value) => Number.isSafeInteger((Number(value) - 1) * 50), 'page vượt giới hạn')
    .optional()
    .transform((value) => value === undefined ? 1 : Number(value)),
});

module.exports = { idParam, stationIdParam, walletDriverIdParam, walletTransactionsQuery };
