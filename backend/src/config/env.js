const path = require('node:path');
const { z } = require('zod');
const { assertNode } = require('./nodeVersion');
try {
  assertNode(process.versions.node);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const requiredEnvKeys = ['DATABASE_URL', 'JWT_SECRET', 'APP_ORIGIN'];
const hasExplicitEnv = requiredEnvKeys.some((key) => process.env[key] !== undefined);
if (!hasExplicitEnv) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().min(1),
  LOGIN_IP_MAX_FAILURES: z.coerce.number().int().positive().default(20),
  // Số proxy tin cậy đứng trước app (0 = không tin X-Forwarded-For).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
  console.error(`Cấu hình môi trường không hợp lệ hoặc thiếu: ${names.join(', ')}`);
  process.exit(1);
}

module.exports = parsed.data;
