const { z } = require('zod');

const REQUIRED = 'name và address là bắt buộc';
const status = z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'], { message: 'status không hợp lệ' });
const trimmedString = (label) => z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string({ message: `${label} là bắt buộc` }).min(1, `${label} là bắt buộc`));
const coordinate = (label, min, max) => z.union([
  z.number().finite(),
  z.string().trim().regex(/^-?\d+(?:\.\d{1,8})?$/, `${label} phải có tối đa 8 chữ số thập phân`),
]).refine((value) => Number(value) >= min && Number(value) <= max, `${label} phải từ ${min} đến ${max}`);
const validateCoordinatePair = (data, context) => {
  if ((data.latitude !== undefined) !== (data.longitude !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Vĩ độ và kinh độ phải được cung cấp cùng nhau', path: ['latitude'] });
  }
};

const createBody = z.object({
  name: trimmedString('Tên trạm'),
  address: trimmedString('Địa chỉ'),
  latitude: coordinate('Vĩ độ', -90, 90).nullish(),
  longitude: coordinate('Kinh độ', -180, 180).nullish(),
  status: status.default('INACTIVE'),
}, { message: REQUIRED }).superRefine(validateCoordinatePair);

const updateBody = z.object({
  name: trimmedString('Tên trạm').optional(),
  address: trimmedString('Địa chỉ').optional(),
  latitude: coordinate('Vĩ độ', -90, 90).nullish(),
  longitude: coordinate('Kinh độ', -180, 180).nullish(),
  status: status.optional(),
}).superRefine((data, context) => {
  if ((data.latitude !== undefined) !== (data.longitude !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Vĩ độ và kinh độ phải được cập nhật cùng nhau', path: ['latitude'] });
  }
});

module.exports = { createBody, updateBody };
