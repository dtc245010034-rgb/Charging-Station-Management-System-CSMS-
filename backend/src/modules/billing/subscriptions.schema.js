'use strict';

const { z } = require('zod');

const periodSchema = z.object({
  from: z.union([z.string(), z.number()]),
  to: z.union([z.string(), z.number()]),
  pricePerKwh: z.coerce.number().int().min(0),
  label: z.string().trim().min(1).max(64),
});

const createPlanSchema = z.object({
  code: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/, 'Mã gói chỉ chứa chữ, số, dấu gạch nối hoặc gạch dưới'),
  name: z.string().trim().min(1).max(128),
  priceDong: z.coerce.number().int().positive('Giá gói phải lớn hơn 0'),
  durationDays: z.coerce.number().int().min(1).max(366).default(30),
  idleGraceMin: z.coerce.number().int().min(0).nullish(),
  idlePerMinDong: z.coerce.number().int().min(0).nullish(),
  periods: z.array(periodSchema).min(1, 'Phải có ít nhất 1 khung giờ'),
});

const buySubscriptionSchema = z.object({
  planId: z.coerce.number().int().positive('Mã gói không hợp lệ'),
});

module.exports = {
  createPlanSchema,
  buySubscriptionSchema,
};
