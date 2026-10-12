const { z } = require('zod');

const tariffCreateBody = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày phải là YYYY-MM-DD'),
  periods: z.array(
    z.object({
      from: z.string().min(1, 'Thiếu giờ bắt đầu'),
      to: z.string().min(1, 'Thiếu giờ kết thúc'),
      pricePerKwh: z.number().int('Đơn giá phải là số nguyên').min(0, 'Đơn giá không được âm').max(1000000, 'Đơn giá tối đa 1.000.000 đ/kWh'),
      label: z.string().max(40, 'Nhãn khung tối đa 40 ký tự').optional(),
    })
  ).min(1, 'Cần ít nhất một khung giờ').max(48, 'Tối đa 48 khung giờ'),
  idle: z.object({
    graceMin: z.number().int('Thời gian ân hạn phải là số nguyên').min(0, 'Thời gian ân hạn không được âm').max(240, 'Thời gian ân hạn tối đa 240 phút').default(0),
    perMinDong: z.number().int('Phí chiếm trụ phải là số nguyên').min(0, 'Phí chiếm trụ không được âm').max(100000, 'Phí chiếm trụ tối đa 100.000 đ/phút').default(0),
  }).default({ graceMin: 0, perMinDong: 0 }),
});

module.exports = {
  tariffCreateBody,
};
