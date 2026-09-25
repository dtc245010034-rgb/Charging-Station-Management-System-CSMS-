import '../theme.js';
import { login, register, me } from '../auth.js';
import { goHome } from '../router.js';
import { validateLogin, validateRegister } from '../validate.js';

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

// Lỗi hiển thị ngay dưới ô nhập tương ứng.
function setFieldError(inputId, message) {
  const slot = document.querySelector(`[data-error-for="${inputId}"]`);
  const input = document.getElementById(inputId);
  slot.textContent = message || '';
  slot.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}
function showFieldErrors(ids, errors) {
  for (const [field, inputId] of Object.entries(ids)) setFieldError(inputId, errors[field]);
}
const clearFieldErrors = (ids) => showFieldErrors(ids, {});

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

// Gửi form: kiểm tra client → lỗi dưới ô nhập; khoá nút khi đang gửi (chống bấm hai lần);
// lỗi từ backend gắn vào ô theo `details`, lỗi chung (401/429/mạng) ở khung alert.
function bindForm({ form, submitId, busyText, ids, read, validate, action }) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();
    const values = read();
    const errors = validate(values);
    showFieldErrors(ids, errors);
    if (Object.keys(errors).length) return;

    const button = document.getElementById(submitId);
    const original = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
    try {
      await action(values);
    } catch (error) {
      if (!error.status) return showAlert('Không thể kết nối tới máy chủ backend. Vui lòng kiểm tra dịch vụ.');
      const fieldErrors = {};
      for (const { field, message } of error.details) if (ids[field]) fieldErrors[field] ??= message;
      if (error.status === 409 && ids.email) fieldErrors.email = error.message;
      showFieldErrors(ids, fieldErrors);
      if (!Object.keys(fieldErrors).length) showAlert(error.message);
    } finally {
      button.textContent = original;
      button.disabled = false;
    }
  });
  form.addEventListener('input', () => clearFieldErrors(ids));
}

const value = (id) => document.getElementById(id).value;

const loginForm = document.getElementById('loginForm');
bindForm({
  form: loginForm,
  submitId: 'loginSubmitBtn',
  busyText: 'Đang xác thực...',
  ids: { email: 'loginEmail', password: 'loginPassword' },
  read: () => ({ email: value('loginEmail'), password: value('loginPassword') }),
  validate: validateLogin,
  action: async ({ email, password }) => {
    const { user } = await login(email.trim(), password);
    loginForm.reset();
    goHome(user);
  },
});

const registerForm = document.getElementById('registerForm');
bindForm({
  form: registerForm,
  submitId: 'regSubmitBtn',
  busyText: 'Đang đăng ký...',
  ids: { name: 'regName', email: 'regEmail', password: 'regPassword' },
  read: () => ({ name: value('regName'), email: value('regEmail'), password: value('regPassword') }),
  validate: validateRegister,
  action: async ({ name, email, password }) => {
    // Đăng ký công khai luôn là tài xế; backend đã đặt cookie phiên nên vào thẳng trang chính.
    const { user } = await register({ name: name.trim(), email: email.trim(), password });
    registerForm.reset();
    goHome(user);
  },
});
