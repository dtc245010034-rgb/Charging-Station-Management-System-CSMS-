import { h } from '../../app/dom.js';
import { validateRegister } from '../../app/validate.js';
import * as csms from '../../services/csms.js';
import { emptyState } from '../../components/empty-state.js';
import { toast } from '../../components/toast.js';

const ROLE_LABELS = {
  ADMIN: 'Quản trị', STATION_OWNER: 'Chủ trạm', OPERATOR: 'Vận hành viên', ACCOUNTANT: 'Kế toán', DRIVER: 'Tài xế',
};

// Quản trị tạo tài khoản mọi vai trò (POST /api/admin/users). Danh sách/khoá tài khoản là S-61 — chưa có API.
export async function render(ctx) {
  let roles;
  try {
    roles = await csms.admin.roles();
  } catch (error) {
    ctx.root.append(emptyState({ iconName: 'alert', title: 'Không tải được danh sách vai trò', text: error.message }));
    return;
  }

  const name = h('input', { class: 'input', id: 'u-name', autocomplete: 'off', required: true });
  const email = h('input', { class: 'input', id: 'u-email', type: 'email', autocomplete: 'off', required: true });
  const password = h('input', { class: 'input', id: 'u-password', type: 'password', autocomplete: 'new-password', required: true, placeholder: 'Tối thiểu 8 ký tự' });
  const role = h('select', { class: 'select', id: 'u-role' }, roles.map((r) => h('option', { value: r.code, selected: r.code === 'OPERATOR' }, ROLE_LABELS[r.code] ?? r.name ?? r.code)));
  const errors = { name: h('p', { class: 'field__error', hidden: true }), email: h('p', { class: 'field__error', hidden: true }), password: h('p', { class: 'field__error', hidden: true }) };
  const alert = h('p', { class: 'form-alert', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Tạo tài khoản');
  const setErrors = (map) => { for (const [k, el] of Object.entries(errors)) { el.textContent = map[k] ?? ''; el.hidden = !map[k]; } };

  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const values = { name: name.value, email: email.value, password: password.value };
    const problems = validateRegister(values);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    submit.disabled = true;
    try {
      const { user } = await csms.admin.createUser({ name: values.name.trim(), email: values.email.trim(), password: values.password, role: role.value });
      toast(`Đã tạo tài khoản ${user.email} (${ROLE_LABELS[user.role] ?? user.role}).`);
      form.reset();
    } catch (error) {
      const fieldErrors = {};
      for (const { field, message } of error.details ?? []) if (errors[field]) fieldErrors[field] ??= message;
      if (error.status === 409) fieldErrors.email = error.message;
      setErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) { alert.textContent = error.message; alert.hidden = false; }
    } finally { submit.disabled = false; }
  } },
  h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Họ và tên'), name, errors.name),
  h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Email'), email, errors.email),
  h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Mật khẩu tạm'), password, errors.password),
  h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Vai trò'), role),
  alert, h('div', {}, submit));

  ctx.root.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { class: 'page-head__title' }, 'Tạo tài khoản'), h('p', { class: 'page-head__sub' }, 'Tạo tài khoản cho bất kỳ vai trò nào. Người dùng nên đổi mật khẩu sau lần đăng nhập đầu.'))),
    h('section', { class: 'card', style: 'max-width:520px' }, h('div', { class: 'card__body' }, form)));
}
