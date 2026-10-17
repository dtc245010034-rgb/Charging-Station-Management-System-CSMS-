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
const adminUsersQuery = z.object({
  search: z.string().trim().max(100, 'Từ khoá tìm kiếm quá dài').optional().transform((value) => value || ''),
  page: z.string().regex(/^[1-9]\d*$/, 'page phải là số nguyên dương')
    .refine((value) => Number.isSafeInteger((Number(value) - 1) * 50), 'page vượt giới hạn')
    .optional().transform((value) => Number(value || 1)),
});
const adminUserIdParam = z.object({
  id: z.string().regex(/^[1-9]\d*$/, 'id phải là số nguyên dương')
    .refine((value) => Number.isSafeInteger(Number(value)), 'id vượt giới hạn'),
});
const adminUserRoleBody = z.object({
  role: z.enum(ROLES, { message: 'Vai trò không hợp lệ' }),
});
const adminUserStatusBody = z.object({
  isActive: z.boolean(),
});

module.exports = {
  publicRegisterBody,
  adminCreateUserBody,
  adminUsersQuery,
  adminUserIdParam,
  adminUserRoleBody,
  adminUserStatusBody,
};
