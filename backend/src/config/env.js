const path = require('node:path');
const { z } = require('zod');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().min(1),
  LOGIN_IP_MAX_FAILURES: z.coerce.number().int().positive().default(20),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
  console.error(`Cấu hình môi trường không hợp lệ hoặc thiếu: ${names.join(', ')}`);
  process.exit(1);
}

module.exports = parsed.data;
