function requireAdminCredentials(env = process.env) {
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Thiếu ADMIN_EMAIL hoặc ADMIN_PASSWORD trong biến môi trường. Đặt cả hai (mật khẩu mạnh, tài khoản ADMIN có sẵn) rồi chạy lại.');
    process.exit(1);
  }
  return { email, password };
}

module.exports = { requireAdminCredentials };
