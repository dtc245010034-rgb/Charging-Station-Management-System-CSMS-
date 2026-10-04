import '../../app/theme.js';
import { getTheme, toggleTheme, setTheme, onThemeChange } from '../../app/theme.js';
import { login, register, me } from '../../app/auth.js';
import { goHome } from '../../app/workspace.js';
import { validateLogin, validateRegister } from '../../app/validate.js';
import { icon } from '../../components/icons.js';

const get = (id) => document.getElementById(id);
const alertBox = get('authAlert');
const tabs = document.querySelectorAll('[data-tab]');
const panels = document.querySelectorAll('[data-form]');

for (const slot of document.querySelectorAll('[data-icon]')) slot.replaceChildren(icon(slot.dataset.icon, { size: slot.classList.contains('brand__mark') ? 20 : 18 }));

const themeBtn = get('themeToggle');
const themeButtons = document.querySelectorAll('.theme button');
const paintTheme = () => {
  const light = getTheme() === 'light';
  if (themeBtn) {
    themeBtn.replaceChildren(icon(light ? 'moon' : 'sun'));
    themeBtn.setAttribute('aria-label', light ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng');
  }
  for (const b of themeButtons) {
    b.classList.toggle('on', (b.dataset.t === 'light') === light);
  }
};
paintTheme();
onThemeChange(paintTheme);
if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
for (const b of themeButtons) {
  b.addEventListener('click', () => setTheme(b.dataset.t));
}

const showAlert = (message) => { alertBox.textContent = message; alertBox.hidden = false; };
const hideAlert = () => { alertBox.hidden = true; alertBox.textContent = ''; };

// Lỗi hiển thị ngay dưới ô nhập tương ứng.
function setFieldError(inputId, message) {
  const slot = document.querySelector(`[data-error-for="${inputId}"]`);
  const input = get(inputId);
  slot.textContent = message || '';
  slot.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}
function showFieldErrors(ids, errors) {
  for (const [field, inputId] of Object.entries(ids)) setFieldError(inputId, errors[field]);
}

function switchTab(target) {
  hideAlert();
  for (const tab of tabs) {
    const isSelected = tab.dataset.tab === target || tab.dataset.go === target;
    tab.setAttribute('aria-selected', String(isSelected));
    tab.classList.toggle('on', isSelected);
  }
  for (const panel of panels) panel.hidden = panel.dataset.form !== target;
}
for (const tab of tabs) {
  tab.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab(tab.dataset.tab || tab.dataset.go);
  });
}
for (const el of document.querySelectorAll('[data-go]')) {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab(el.dataset.go);
  });
}

for (const toggle of document.querySelectorAll('.password-toggle')) {
  const input = toggle.parentElement.querySelector('input');
  const span = toggle.querySelector('span');
  if (span) span.textContent = 'Hiện';
  else {
    toggle.textContent = 'Hiện';
    toggle.classList.add('input-group__btn--text');
  }
  toggle.addEventListener('click', () => {
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    if (span) span.textContent = visible ? 'Hiện' : 'Ẩn';
    else toggle.textContent = visible ? 'Hiện' : 'Ẩn';
    toggle.setAttribute('aria-pressed', String(!visible));
    toggle.setAttribute('aria-label', visible ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
  });
}

// Đã có phiên hợp lệ thì vào thẳng workspace.
me({ redirectOn401: false }).then((user) => goHome(user), () => {});

// Gửi form: kiểm tra client → lỗi dưới ô nhập; khoá nút khi đang gửi (chống bấm hai lần);
// lỗi từ backend gắn vào ô theo `details`, lỗi chung (401/429/mạng) ở khung alert.
function bindForm({ form, submitId, busyText, ids, read, validate, action }) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();
    const errors = validate(read());
    showFieldErrors(ids, errors);
    if (Object.keys(errors).length) return;

    const button = get(submitId);
    const original = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
    try {
      await action(read());
    } catch (error) {
      if (!error.status) return showAlert('Không thể kết nối tới máy chủ backend. Vui lòng kiểm tra dịch vụ.');
      const fieldErrors = {};
      for (const { field, message } of error.details ?? []) if (ids[field]) fieldErrors[field] ??= message;
      if (error.status === 409 && ids.email) fieldErrors.email = error.message;
      showFieldErrors(ids, fieldErrors);
      if (!Object.keys(fieldErrors).length) showAlert(error.message);
    } finally {
      button.textContent = original;
      button.disabled = false;
    }
  });
  form.addEventListener('input', () => showFieldErrors(ids, {}));
}

const value = (id) => get(id).value;

const loginForm = get('loginForm');
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

const registerForm = get('registerForm');
bindForm({
  form: registerForm,
  submitId: 'regSubmitBtn',
  busyText: 'Đang đăng ký...',
  ids: { name: 'regName', email: 'regEmail', password: 'regPassword' },
  read: () => ({ name: value('regName'), email: value('regEmail'), password: value('regPassword') }),
  validate: validateRegister,
  action: async ({ name, email, password }) => {
    // Đăng ký công khai luôn là tài xế; backend đã đặt cookie phiên nên vào thẳng workspace.
    const { user } = await register({ name: name.trim(), email: email.trim(), password });
    registerForm.reset();
    goHome(user);
  },
});
