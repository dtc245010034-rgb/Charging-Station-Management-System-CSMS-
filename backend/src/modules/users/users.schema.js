const { z } = require('zod');
const { ROLES } = require('../../lib/roles');

const INVALID = 'Dữ liệu không hợp lệ';

const base = {
  name: z.string({ message: 'Họ tên là bắt buộc' }).trim().min(1, 'Họ tên là bắt buộc'),
  email: z.string({ message: 'Email là bắt buộc' }).trim().toLowerCase().email('Email không hợp lệ'),
  password: z.string({ message: 'Mật khẩu là bắt buộc' }).min(8, 'Mật khẩu tối thiểu 8 ký tự'),
};

// Đăng ký công khai luôn tạo DRIVER: client gửi role (kể cả ADMIN) → 400.
const publicRegisterBody = z.object({
  ...base,
  role: z.never({ message: 'Đăng ký công khai không được chọn vai trò' }).optional(),
}, { message: INVALID });

const adminCreateUserBody = z.object({
  ...base,
  role: z.enum(ROLES, { message: 'Vai trò không hợp lệ' }),
}, { message: INVALID });

module.exports = { publicRegisterBody, adminCreateUserBody };
