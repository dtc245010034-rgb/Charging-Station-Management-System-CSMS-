const { z } = require('zod');

const REQUIRED = 'name và address là bắt buộc';
const coordinate = (label, min, max) => z.union([
  z.number().finite(),
  z.string().trim().regex(/^-?\d+(?:\.\d{1,8})?$/, `${label} phải có tối đa 8 chữ số thập phân`),
]).refine((value) => Number(value) >= min && Number(value) <= max, `${label} phải từ ${min} đến ${max}`);
const createBody = z.object({
  name: z.string({ message: REQUIRED }).min(1, REQUIRED),
  address: z.string({ message: REQUIRED }).min(1, REQUIRED),
  latitude: coordinate('Vĩ độ', -90, 90),
  longitude: coordinate('Kinh độ', -180, 180),
}, { message: REQUIRED }).strict();

const updateBody = z.object({
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  latitude: coordinate('Vĩ độ', -90, 90).nullish(),
  longitude: coordinate('Kinh độ', -180, 180).nullish(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'], { message: 'status không hợp lệ' }).optional(),
}).strict().superRefine((data, context) => {
  if ((data.latitude !== undefined) !== (data.longitude !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Vĩ độ và kinh độ phải được cập nhật cùng nhau', path: ['latitude'] });
  }
});

module.exports = { createBody, updateBody };
