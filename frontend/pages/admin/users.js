import { h } from '../../app/dom.js';
import { validateRegister } from '../../app/validate.js';
import * as csms from '../../services/csms.js';
import { emptyState } from '../../components/empty-state.js';
import { toast } from '../../components/toast.js';

const ROLE_LABELS = {
  ADMIN: 'Quản trị', STATION_OWNER: 'Chủ trạm', OPERATOR: 'Vận hành viên', ACCOUNTANT: 'Kế toán', DRIVER: 'Tài xế',
};

export async function render(ctx) {
  let roles;
  let users;
  try {
    const [roleList, userResult] = await Promise.all([csms.admin.roles(), csms.admin.listUsers()]);
    roles = roleList;
    users = userResult.users;
  } catch (error) {
    ctx.root.append(emptyState({ iconName: 'alert', title: 'Không tải được tài khoản quản trị', text: error.message }));
    return;
  }

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Tìm theo tên hoặc email', 'aria-label': 'Tìm người dùng' });
  const userRows = h('tbody');
  const renderUsers = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = users.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase().includes(query));
    if (!filtered.length) {
      userRows.replaceChildren(h('tr', {}, h('td', { colspan: '5' }, query ? 'Không tìm thấy người dùng' : 'Chưa có tài khoản')));
      return;
    }
    userRows.replaceChildren(...filtered.map((user) => {
      const rowError = h('span', { class: 'field__error', role: 'alert' });
      const assignedRole = user.role || user.roles?.[0] || '';
      const selectedRole = h('select', { class: 'select', 'aria-label': `Vai trò của ${user.email}` },
        roles.map((item) => h('option', { value: item.code, selected: item.code === assignedRole }, ROLE_LABELS[item.code] ?? item.name ?? item.code))
      );
      const saveRole = h('button', { class: 'btn btn--secondary', type: 'button', onclick: async () => {
        rowError.textContent = '';
        saveRole.disabled = true;
        try {
          const result = await csms.admin.setUserRole(user.id, selectedRole.value);
          users = users.map((item) => String(item.id) === String(user.id) ? result.user : item);
          toast('Đã cập nhật vai trò.');
          renderUsers();
        } catch (error) {
          rowError.textContent = error.message;
        } finally {
          saveRole.disabled = false;
        }
      } }, 'Lưu vai trò');
      const action = user.disabled_at
        ? h('button', { class: 'btn btn--secondary', type: 'button', onclick: async () => {
          rowError.textContent = '';
          try {
            const result = await csms.admin.enableUser(user.id);
            users = users.map((item) => String(item.id) === String(user.id) ? result.user : item);
            toast('Đã mở khóa tài khoản.');
            renderUsers();
          } catch (error) {
            rowError.textContent = error.message;
          }
        } }, 'Mở khóa')
        : h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
          rowError.textContent = '';
          try {
            const result = await csms.admin.disableUser(user.id);
            users = users.map((item) => String(item.id) === String(user.id) ? result.user : item);
            toast('Đã khóa tài khoản.');
            renderUsers();
          } catch (error) {
            rowError.textContent = error.message;
          }
        } }, 'Khóa');
      return h('tr', {},
        h('td', {}, user.name),
        h('td', {}, user.email),
        h('td', {}, user.disabled_at ? 'Đã khóa' : 'Đang hoạt động'),
        h('td', {}, selectedRole, saveRole, rowError),
        h('td', {}, action)
      );
    }));
  };
  search.addEventListener('input', renderUsers);

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
      users = [...users, user];
      renderUsers();
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
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { class: 'page-head__title' }, 'Quản lý tài khoản'), h('p', { class: 'page-head__sub' }, 'Tạo tài khoản, tìm kiếm người dùng, đổi vai trò và khóa hoặc mở khóa tài khoản.'))),
    h('section', { class: 'card', style: 'max-width:520px' },
      h('div', { class: 'card__body' },
        h('h2', { class: 'section-title' }, 'Tạo tài khoản'),
        form
      )
    ),
    h('section', { class: 'card', 'aria-label': 'Danh sách người dùng' },
      h('div', { class: 'card__body' },
        h('div', { class: 'toolbar' }, search),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', {}, h('tr', {}, ['Họ và tên', 'Email', 'Trạng thái', 'Vai trò', 'Thao tác'].map((label) => h('th', { scope: 'col' }, label)))),
            userRows
          )
        )
      )
    )
  );
  renderUsers();
}
