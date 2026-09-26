const { z } = require('zod');

const REQUIRED = 'name và address là bắt buộc';
const NO_STATUS = 'Trạm mới luôn ở trạng thái chưa hoạt động, không được chỉ định status';
const status = z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'], { message: 'status không hợp lệ' });
const text = (message) => z.string({ message }).trim().min(1, message);
const coordinate = (label, min, max) => z.union([
  z.number().finite(),
  z.string().trim().regex(/^-?\d+(?:\.\d{1,8})?$/, `${label} phải có tối đa 8 chữ số thập phân`),
]).refine((value) => Number(value) >= min && Number(value) <= max, `${label} phải từ ${min} đến ${max}`);

const createBody = z.object({
  name: text(REQUIRED),
  address: text(REQUIRED),
  latitude: coordinate('Vĩ độ', -90, 90),
  longitude: coordinate('Kinh độ', -180, 180),
  status: z.undefined({ message: NO_STATUS }).optional(),
}, { message: REQUIRED });

const updateBody = z.object({
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  latitude: coordinate('Vĩ độ', -90, 90).optional(),
  longitude: coordinate('Kinh độ', -180, 180).optional(),
  status: status.optional(),
}).superRefine((data, context) => {
  if ((data.latitude !== undefined) !== (data.longitude !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Vĩ độ và kinh độ phải được cập nhật cùng nhau', path: ['latitude'] });
  }
});

module.exports = { createBody, updateBody };
