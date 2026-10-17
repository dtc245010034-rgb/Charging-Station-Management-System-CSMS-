import { h, mount } from '../../app/dom.js';
import { validateRegister } from '../../app/validate.js';
import * as csms from '../../services/csms.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { toast } from '../../components/toast.js';

const ROLE_LABELS = {
  ADMIN: 'Quản trị', STATION_OWNER: 'Chủ trạm', OPERATOR: 'Vận hành viên', ACCOUNTANT: 'Kế toán', DRIVER: 'Tài xế',
};

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
      await refreshUsers();
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

  const search = h('input', { class: 'input', type: 'search', maxlength: '100', placeholder: 'Tìm theo tên hoặc email' });
  const userList = h('div', { class: 'card__body' }, loadingState(4));
  const searchForm = h('form', { class: 'toolbar', onsubmit: async (event) => {
    event.preventDefault();
    currentPage = 1;
    await refreshUsers();
  } },
  h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Tìm người dùng'), search),
  h('button', { class: 'btn btn--secondary', type: 'submit' }, 'Tìm kiếm'));
  let currentPage = 1;

  ctx.root.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { class: 'page-head__title' }, 'Quản lý tài khoản'), h('p', { class: 'page-head__sub' }, 'Tạo, tìm kiếm, phân quyền và khoá tài khoản.'))),
    h('section', { class: 'card', style: 'max-width:520px' },
      h('div', { class: 'card__body' }, h('h2', { class: 'card__title' }, 'Tạo tài khoản'), form)),
    h('section', { class: 'card', 'aria-label': 'Danh sách tài khoản' },
      h('div', { class: 'card__body' }, searchForm),
      userList)
  );
  await refreshUsers();

  async function refreshUsers() {
    mount(userList, loadingState(4));
    try {
      const result = await csms.admin.users(search.value.trim(), currentPage);
      if (!result.users.length) {
        mount(userList, emptyState({ iconName: 'users', title: 'Không tìm thấy tài khoản' }));
        return;
      }
      const rows = result.users.map((user) => {
        const assignedRole = h('select', { class: 'select', 'aria-label': `Vai trò ${user.email}` },
          roles.map((item) => h('option', {
            value: item.code,
            selected: user.roles.includes(item.code),
          }, ROLE_LABELS[item.code] ?? item.name ?? item.code)));
        const changeRole = h('button', { class: 'btn btn--secondary', type: 'button', onclick: async () => {
          changeRole.disabled = true;
          try {
            await csms.admin.changeUserRole(user.id, assignedRole.value);
            toast('Đã cập nhật vai trò.');
            await refreshUsers();
          } catch (error) {
            toast(error.message, { kind: 'error' });
          } finally {
            changeRole.disabled = false;
          }
        } }, 'Lưu vai trò');
        const toggleActive = h('button', { class: user.isActive ? 'btn btn--danger' : 'btn btn--secondary', type: 'button', onclick: async () => {
          toggleActive.disabled = true;
          try {
            await csms.admin.setUserActive(user.id, !user.isActive);
            toast(user.isActive ? 'Đã khoá tài khoản.' : 'Đã mở khoá tài khoản.');
            await refreshUsers();
          } catch (error) {
            toast(error.message, { kind: 'error' });
          } finally {
            toggleActive.disabled = false;
          }
        } }, user.isActive ? 'Khoá' : 'Mở khoá');
        return h('tr', {},
          h('td', {}, user.name),
          h('td', {}, user.email),
          h('td', {}, user.isActive ? 'Đang hoạt động' : 'Đã khoá'),
          h('td', {}, assignedRole),
          h('td', {}, h('div', { class: 'toolbar' }, changeRole, toggleActive))
        );
      });
      const previous = h('button', { class: 'btn btn--secondary', type: 'button', disabled: currentPage <= 1, onclick: async () => {
        currentPage -= 1;
        await refreshUsers();
      } }, 'Trước');
      const next = h('button', { class: 'btn btn--secondary', type: 'button', disabled: currentPage * result.pageSize >= result.total, onclick: async () => {
        currentPage += 1;
        await refreshUsers();
      } }, 'Sau');
      mount(userList,
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ['Tên', 'Email', 'Trạng thái', 'Vai trò', 'Thao tác'].map((label) => h('th', { scope: 'col' }, label)))),
          h('tbody', {}, rows)
        )),
        h('div', { class: 'toolbar' },
          h('span', { class: 'muted' }, `Trang ${result.page} · ${result.total} tài khoản`),
          previous,
          next)
      );
    } catch (error) {
      mount(userList, errorState({ message: error.message, onRetry: () => { void refreshUsers(); } }));
    }
  }
}
