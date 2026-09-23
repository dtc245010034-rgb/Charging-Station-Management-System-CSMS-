const { z } = require('zod');
const argon2 = require('argon2');
const { pool } = require('../src/db');

const input = z.object({
  ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
  ADMIN_PASSWORD: z.string().min(12),
}).safeParse(process.env);

if (!input.success) {
  const names = [...new Set(input.error.issues.map((issue) => issue.path.join('.')))];
  console.error(`ADMIN_EMAIL / ADMIN_PASSWORD thiếu hoặc không hợp lệ (mật khẩu ≥ 12 ký tự): ${names.join(', ')}`);
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
