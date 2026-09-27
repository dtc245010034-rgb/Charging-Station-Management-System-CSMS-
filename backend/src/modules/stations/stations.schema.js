const { z } = require('zod');

const REQUIRED = 'name và address là bắt buộc';
const normalizeString = (value) => (typeof value === 'string' ? value.trim() : value);
const normalizeStatus = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const status = z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'], { message: 'status không hợp lệ' });
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
  name: z.preprocess(normalizeString, z.string({ message: REQUIRED }).trim().min(1, REQUIRED)),
  address: z.preprocess(normalizeString, z.string({ message: REQUIRED }).trim().min(1, REQUIRED)),
  latitude: coordinate('Vĩ độ', -90, 90).nullish(),
  longitude: coordinate('Kinh độ', -180, 180).nullish(),
  status: z.preprocess(normalizeStatus, status.default('INACTIVE')),
}, { message: REQUIRED }).superRefine(validateCoordinatePair);

const updateBody = z.object({
  name: z.preprocess(normalizeString, z.string().trim().min(1).optional()),
  address: z.preprocess(normalizeString, z.string().trim().min(1).optional()),
  latitude: coordinate('Vĩ độ', -90, 90).nullish(),
  longitude: coordinate('Kinh độ', -180, 180).nullish(),
  status: z.preprocess(normalizeStatus, status.optional()),
}).superRefine((data, context) => {
  if ((data.latitude !== undefined) !== (data.longitude !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Vĩ độ và kinh độ phải được cập nhật cùng nhau', path: ['latitude'] });
  }
});

module.exports = { createBody, updateBody };
