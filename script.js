const panels = document.querySelectorAll('.auth-card');
const switchButtons = document.querySelectorAll('[data-target]');
const toast = document.getElementById('toast');
const themeToggle = document.getElementById('themeToggle');

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.setAttribute('data-theme', theme);
  themeToggle.querySelector('.theme-icon').textContent = isLight ? '🌙' : '☀️';
  themeToggle.querySelector('.theme-label').textContent = isLight ? 'Chế độ tối' : 'Chế độ sáng';
  localStorage.setItem('csms-theme', theme);
}

const savedTheme = localStorage.getItem('csms-theme') || 'dark';
applyTheme(savedTheme);

function showPanel(targetId) {
  panels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === targetId);
  });
}

switchButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showPanel(button.dataset.target);
  });
});

themeToggle.addEventListener('click', () => {
  const nextTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

document.getElementById('loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  showToast('Đăng nhập thành công');
});

document.getElementById('registerForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const password = document.getElementById('register-password').value;
  const confirm = document.getElementById('register-confirm').value;

  if (password !== confirm) {
    showToast('Mật khẩu xác nhận không khớp');
    return;
  }

  showToast('Tạo tài khoản thành công');
  showPanel('login-panel');
  event.target.reset();
});
