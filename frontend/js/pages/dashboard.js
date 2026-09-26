import '../theme.js';
import { me, logout } from '../auth.js';
import { goHome } from '../router.js';

// Phiên hết hạn → api.js nhận 401 và tự chuyển về /index.html; lỗi mạng khác thì vẫn hiện khung trang.
me().then((user) => {
  if (user.role !== document.body.dataset.role) return goHome(user);
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userEmail').textContent = user.email;
  document.getElementById('userBadge').textContent = user.role;
  document.body.hidden = false;
  if (user.role === 'STATION_OWNER') import('./station-owner.js').then(({ init }) => init());
}, () => { document.body.hidden = false; });

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await logout(); } finally { location.replace('/index.html'); }
});
