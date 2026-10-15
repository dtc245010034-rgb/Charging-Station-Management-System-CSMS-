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
const walletReason = z.string()
  .trim()
  .min(10, 'Lý do phải có ít nhất 10 ký tự')
  .max(500, 'Lý do quá dài');
const walletAdjustmentBody = z.object({
  amountDong: z.union([
    z.number().int().safe().transform((value) => BigInt(value)),
    z.string().regex(/^-?\d{1,19}$/, 'Số tiền phải là số nguyên có dấu').transform((value) => BigInt(value)),
  ]).refine((value) => value !== 0n && value >= -9223372036854775808n && value <= 9223372036854775807n, 'Số tiền điều chỉnh không hợp lệ'),
  reason: walletReason,
});
const walletUnlockBody = z.object({ reason: walletReason });
const walletSearchQuery = z.object({
  query: z.string().trim().max(200, 'Từ khóa tìm kiếm quá dài').optional().transform((value) => value || ''),
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD');

const revenueQuery = z.object({
  from: dateString,
  to: dateString,
  stationId: z.string().regex(/^[1-9]\d*$/, 'stationId phải là số nguyên dương').optional().transform((val) => val ? Number(val) : undefined),
}).refine((data) => data.from <= data.to, { message: 'Khoảng ngày không hợp lệ (from phải <= to)' });

const periodMonthParam = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Tháng phải có định dạng YYYY-MM'),
});

const reopenPeriodBody = z.object({
  reason: z.string().trim().min(10, 'Lý do mở lại phải có ít nhất 10 ký tự').max(500, 'Lý do quá dài'),
});

module.exports = {
  idParam,
  stationIdParam,
  walletDriverIdParam,
  walletTransactionsQuery,
  manualTopupBody,
  walletAdjustmentBody,
  walletUnlockBody,
  walletSearchQuery,
  revenueQuery,
  periodMonthParam,
  reopenPeriodBody,
};
