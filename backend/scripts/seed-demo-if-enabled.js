// Dùng trong `npm run start:staging`: chỉ seed dữ liệu demo khi ALLOW_DEMO_SEED=1.
// Viết bằng Node (không dùng `[ ... ] || ...` của shell) để chạy được cả trên Windows.
if (process.env.ALLOW_DEMO_SEED !== '1') {
  console.log('Bỏ qua seed demo (ALLOW_DEMO_SEED chưa bằng 1).');
  process.exit(0);
}
require('./seed-demo');
