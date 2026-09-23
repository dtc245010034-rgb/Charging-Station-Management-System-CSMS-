import '../theme.js';
import { login, register, me } from '../auth.js';
import { goHome } from '../router.js';

const alertBox = document.getElementById('authAlert');
const tabButtons = document.querySelectorAll('.tab-btn');
const formSections = document.querySelectorAll('.auth-form');

const showAlert = (message, type = 'error') => {
  alertBox.textContent = message;
  alertBox.className = `auth-alert ${type}`;
  alertBox.style.display = 'block';
};
const hideAlert = () => {
  alertBox.style.display = 'none';
  alertBox.textContent = '';
};

function switchTab(target) {
  hideAlert();
  tabButtons.forEach((button) => {
    const active = button.dataset.tab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  formSections.forEach((section) => section.classList.toggle('active', section.dataset.form === target));
}
tabButtons.forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));

document.querySelectorAll('.password-toggle').forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const input = toggle.previousElementSibling;
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    toggle.textContent = visible ? '👁' : '🙈';
    toggle.setAttribute('aria-label', visible ? 'Hiển thị mật khẩu' : 'Ẩn mật khẩu');
    toggle.setAttribute('title', visible ? 'Hiển thị mật khẩu' : 'Ẩn mật khẩu');
  });
});

// Đã có phiên hợp lệ thì vào thẳng trang của vai trò.
me({ redirectOn401: false }).then((user) => goHome(user), () => {});

// Gửi form: khoá nút khi đang gửi (chống bấm hai lần), hiện thông báo chung từ backend.
function bindForm(form, submitId, busyText, action) {
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();
    const button = document.getElementById(submitId);
    const original = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      showAlert(error.status ? error.message : 'Không thể kết nối tới máy chủ backend. Vui lòng kiểm tra dịch vụ.');
    } finally {
      button.textContent = original;
      button.disabled = false;
    }
  });
}

const loginForm = document.getElementById('loginForm');
bindForm(loginForm, 'loginSubmitBtn', 'Đang xác thực...', async () => {
  const { user } = await login(document.getElementById('loginEmail').value.trim(), document.getElementById('loginPassword').value);
  loginForm.reset();
  goHome(user);
});

const registerForm = document.getElementById('registerForm');
bindForm(registerForm, 'regSubmitBtn', 'Đang đăng ký...', async () => {
  const { user } = await register({
    name: document.getElementById('regName').value.trim(),
    role: document.getElementById('regRole').value,
    email: document.getElementById('regEmail').value.trim(),
    password: document.getElementById('regPassword').value,
  });
  registerForm.reset();
  switchTab('login');
  showAlert(`Tạo tài khoản thành công cho ${user.name} (${user.role}). Vui lòng đăng nhập.`, 'success');
});
