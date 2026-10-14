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
const manualTopupBody = z.object({
  amountDong: z.union([
    z.number().int().safe().transform((value) => BigInt(value)),
    z.string().regex(/^\d{1,9}$/, 'Số tiền phải là số nguyên không âm').transform((value) => BigInt(value)),
  ]).refine((value) => value >= 1n && value <= 100000000n, 'Số tiền nạp phải từ 1 đến 100.000.000 đồng'),
  receiptCode: z.string()
    .min(3, 'Mã phiếu thu phải có từ 3 đến 40 ký tự')
    .max(40, 'Mã phiếu thu phải có từ 3 đến 40 ký tự')
    .regex(/^[A-Za-z0-9._-]+$/, 'Mã phiếu thu chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang'),
  note: z.string().max(500, 'Ghi chú quá dài').optional().transform((value) => value?.trim() || null),
});

module.exports = {
  idParam,
  stationIdParam,
  walletDriverIdParam,
  walletTransactionsQuery,
  manualTopupBody,
};
