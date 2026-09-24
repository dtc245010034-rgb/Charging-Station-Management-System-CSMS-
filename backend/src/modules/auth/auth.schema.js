const { z } = require('zod');
const { SYSTEM_ROLES } = require('./auth.service');

const REQUIRED = 'name, email và password >= 8 ký tự là bắt buộc';

const registerBody = z.object({
  name: z.string({ message: REQUIRED }).trim().min(1, REQUIRED),
  email: z.string({ message: REQUIRED }).trim().min(1, REQUIRED),
  password: z.string({ message: REQUIRED }).min(8, REQUIRED),
  role: z.enum(SYSTEM_ROLES, { message: 'Vai trò không hợp lệ' }).default('OPERATOR'),
}, { message: REQUIRED });

const loginBody = z.object({
  email: z.string().catch(''),
  password: z.string().catch(''),
}).catch({ email: '', password: '' });

module.exports = { registerBody, loginBody };
