// Bảng tài khoản demo DUY NHẤT: seed (scripts/seed-demo.js), kiểm khói (tools/demo-smoke.js) và tài liệu demo đều lấy từ đây.
// Mật khẩu không nằm trong mã: đọc từ biến môi trường DEMO_PASSWORD.
const DEFAULT_EMAIL_DOMAIN = 'demo.csms.local';
const DEMO_PASSWORD_MIN_LENGTH = 12;

const ACCOUNTS = [
  { key: 'admin', name: 'Quản trị viên Demo', roles: ['ADMIN'] },
  { key: 'owner', name: 'Chủ trạm Demo A', roles: ['STATION_OWNER'] },
  { key: 'owner2', name: 'Chủ trạm Demo B', roles: ['STATION_OWNER'] },
  { key: 'operator', name: 'Vận hành viên Demo', roles: ['OPERATOR'] },
  { key: 'accountant', name: 'Kế toán Demo', roles: ['ACCOUNTANT'] },
  { key: 'driver', name: 'Tài xế Demo', roles: ['DRIVER'] },
  { key: 'multi', name: 'Vận hành kiêm chủ trạm Demo', roles: ['OPERATOR', 'STATION_OWNER'] },
];

const emailOf = (key, domain = DEFAULT_EMAIL_DOMAIN) => `${key}@${domain}`;

module.exports = { ACCOUNTS, DEFAULT_EMAIL_DOMAIN, DEMO_PASSWORD_MIN_LENGTH, emailOf };
