const { z } = require('zod');
const argon2 = require('argon2');
const { pool } = require('../src/db/pool');

// Chỉ dành cho máy cá nhân (python run.py): ALLOW_WEAK_ADMIN_PASSWORD=1 hạ ngưỡng mật khẩu xuống 4 ký tự.
// Bị từ chối tuyệt đối khi NODE_ENV=production, nên không thể dùng trên staging/production.
const weakAllowed = process.env.ALLOW_WEAK_ADMIN_PASSWORD === '1' && process.env.NODE_ENV !== 'production';
const MIN_PASSWORD = weakAllowed ? 4 : 12;
if (process.env.ALLOW_WEAK_ADMIN_PASSWORD === '1' && !weakAllowed) {
  console.error('ALLOW_WEAK_ADMIN_PASSWORD không được dùng khi NODE_ENV=production.');
  process.exit(1);
}

const input = z.object({
  ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
  ADMIN_PASSWORD: z.string().min(MIN_PASSWORD),
}).safeParse(process.env);

if (!input.success) {
  const names = [...new Set(input.error.issues.map((issue) => issue.path.join('.')))];
  console.error(`ADMIN_EMAIL / ADMIN_PASSWORD thiếu hoặc không hợp lệ (mật khẩu ≥ ${MIN_PASSWORD} ký tự): ${names.join(', ')}`);
  process.exit(1);
}

(async () => {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = input.data;
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Administrator', $1, $2) ON CONFLICT (email) DO NOTHING RETURNING id",
      [email, hash]
    );
    if (!created.rowCount) {
      await client.query('ROLLBACK');
      console.log('Tài khoản đã tồn tại, không thay đổi.');
      return;
    }
    await client.query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'ADMIN'", [created.rows[0].id]);
    await client.query('COMMIT');
    if (weakAllowed && password.length < 12) console.warn('CẢNH BÁO: mật khẩu yếu chỉ dành cho máy cá nhân.');
    console.log(`Đã tạo admin ${email}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
