'use strict';

const { z } = require('zod');

// Cận của gói thuê bao. Cùng thang với biểu giá trạm (tariffs.schema.js: đơn giá ≤ 1.000.000 đ/kWh,
// phí chiếm trụ ≤ 100.000 đ/phút); ân hạn chiếm trụ tối đa 1 ngày; thời hạn theo CHECK của bảng (1..366 ngày).
const PLAN_LIMITS = Object.freeze({
  PRICE_DONG_MIN: 1,
  PRICE_DONG_MAX: 100000000,
  DURATION_DAYS_MIN: 1,
  DURATION_DAYS_MAX: 366,
  IDLE_GRACE_MIN_MAX: 1440,
  IDLE_PER_MIN_DONG_MAX: 100000,
  PRICE_PER_KWH_DONG_MAX: 1000000,
});

// Chỉ nhận số nguyên JSON (typeof number, an toàn); chuỗi như "1e3" bị từ chối thay vì bị ép kiểu.
const strictInt = (label, min, max) => z
  .number({ error: `${label} phải là số nguyên (kiểu số, không phải chuỗi)` })
  .int(`${label} phải là số nguyên`)
  .safe(`${label} vượt giới hạn cho phép`)
  .min(min, `${label} phải từ ${min.toLocaleString('vi-VN')} trở lên`)
  .max(max, `${label} tối đa ${max.toLocaleString('vi-VN')}`);

const periodSchema = z.object({
  from: z.union([z.string(), z.number()], { error: 'Giờ bắt đầu của khung giờ không hợp lệ' }),
  to: z.union([z.string(), z.number()], { error: 'Giờ kết thúc của khung giờ không hợp lệ' }),
  pricePerKwh: strictInt('Đơn giá điện (đ/kWh)', 0, PLAN_LIMITS.PRICE_PER_KWH_DONG_MAX),
  label: z.string({ error: 'Nhãn khung giờ phải là chuỗi' }).trim().min(1, 'Nhãn khung giờ không được để trống').max(64, 'Nhãn khung giờ tối đa 64 ký tự'),
});

const createPlanSchema = z.object({
  code: z.string({ error: 'Mã gói phải là chuỗi' }).trim().min(1, 'Mã gói không được để trống').max(64, 'Mã gói tối đa 64 ký tự').regex(/^[A-Za-z0-9._-]+$/, 'Mã gói chỉ chứa chữ, số, dấu gạch nối hoặc gạch dưới'),
  name: z.string({ error: 'Tên gói phải là chuỗi' }).trim().min(1, 'Tên gói không được để trống').max(128, 'Tên gói tối đa 128 ký tự'),
  priceDong: strictInt('Giá gói (đồng)', PLAN_LIMITS.PRICE_DONG_MIN, PLAN_LIMITS.PRICE_DONG_MAX),
  durationDays: strictInt('Thời hạn gói (ngày)', PLAN_LIMITS.DURATION_DAYS_MIN, PLAN_LIMITS.DURATION_DAYS_MAX).default(30),
  idleGraceMin: strictInt('Thời gian ân hạn chiếm trụ (phút)', 0, PLAN_LIMITS.IDLE_GRACE_MIN_MAX).nullish(),
  idlePerMinDong: strictInt('Phí chiếm trụ (đồng/phút)', 0, PLAN_LIMITS.IDLE_PER_MIN_DONG_MAX).nullish(),
  periods: z.array(periodSchema, { error: 'Danh sách khung giờ không hợp lệ' }).min(1, 'Phải có ít nhất 1 khung giờ').max(48, 'Tối đa 48 khung giờ'),
});

// Mã gói là số nguyên dương: nhận số JSON hoặc chuỗi chỉ gồm chữ số (giao diện gửi id dạng chuỗi), không nhận "1e3", "1.5", " 1".
const buySubscriptionSchema = z.object({
  planId: z.union([
    z.number().int().safe().positive(),
    z.string().regex(/^[1-9]\d{0,14}$/),
  ], { error: 'Mã gói không hợp lệ' }).transform(Number),
});

module.exports = {
  PLAN_LIMITS,
  createPlanSchema,
  buySubscriptionSchema,
};
