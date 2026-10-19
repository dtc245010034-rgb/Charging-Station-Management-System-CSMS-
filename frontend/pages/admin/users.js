import { h } from '../../app/dom.js';
import { validateRegister } from '../../app/validate.js';
import * as csms from '../../services/csms.js';
import { emptyState } from '../../components/empty-state.js';
import { toast } from '../../components/toast.js';

const ROLE_LABELS = {
  ADMIN: 'Quản trị', STATION_OWNER: 'Chủ trạm', OPERATOR: 'Vận hành viên', ACCOUNTANT: 'Kế toán', DRIVER: 'Tài xế',
};

const PAGE_SIZES = [10, 20, 50, 100];
const SEARCH_DEBOUNCE_MS = 300;

export async function render(ctx) {
  let roles;
  try {
    roles = await csms.admin.roles();
  } catch (error) {
    ctx.root.append(emptyState({ iconName: 'alert', title: 'Không tải được tài khoản quản trị', text: error.message }));
    return;
  }

  let users = [];
  let total = 0;
  let page = 1;
  let limit = 20;
  let query = '';
  let loading = false;
  let requestSeq = 0;

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Tìm theo tên hoặc email', 'aria-label': 'Tìm người dùng' });
  const pageSizeSelect = h('select', { class: 'select', 'aria-label': 'Số tài khoản mỗi trang' },
    PAGE_SIZES.map((size) => h('option', { value: String(size), selected: size === limit }, `${size} / trang`)));
  const userRows = h('tbody');
  const listError = h('p', { class: 'form-alert', role: 'alert', hidden: true });
  const previousButton = h('button', { class: 'btn', type: 'button', onclick: () => goTo(page - 1) }, 'Trang trước');
  const nextButton = h('button', { class: 'btn', type: 'button', onclick: () => goTo(page + 1) }, 'Trang sau');
  const pageStatus = h('span', { class: 'muted', 'aria-live': 'polite' });
  const pagination = h('div', { class: 'pagination' }, previousButton, pageStatus, nextButton);

  const pageCount = () => Math.max(1, Math.ceil(total / limit));
  const renderPagination = () => {
    const from = total ? (page - 1) * limit + 1 : 0;
    const to = Math.min(page * limit, total);
    pageStatus.textContent = `Hiện ${from}–${to} / ${total} · Trang ${page} / ${pageCount()}`;
    previousButton.disabled = loading || page <= 1;
    nextButton.disabled = loading || page >= pageCount();
  };

  // Chỉ kết quả của lần gọi mới nhất được dùng, tránh trả lời cũ ghi đè khi gõ tìm kiếm nhanh.
  async function load() {
    const seq = ++requestSeq;
    loading = true;
    renderPagination();
    try {
      const result = await csms.admin.listUsers({ page, limit, q: query });
      if (seq !== requestSeq) return;
      users = result.users;
      total = result.total;
      listError.hidden = true;
      if (!users.length && total > 0 && page > 1) { page = pageCount(); loading = false; await load(); return; }
    } catch (error) {
      if (seq !== requestSeq) return;
      listError.textContent = error.message;
      listError.hidden = false;
    }
    loading = false;
    renderUsers();
    renderPagination();
  }
  function goTo(next) {
    page = Math.min(Math.max(1, next), pageCount());
    void load();
  }

  const renderUsers = () => {
    const filtered = users;
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
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = search.value.trim(); page = 1; void load(); }, SEARCH_DEBOUNCE_MS);
  });
  pageSizeSelect.addEventListener('change', () => { limit = Number(pageSizeSelect.value); page = 1; void load(); });

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
      await load();
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
        h('div', { class: 'toolbar' }, search, pageSizeSelect),
        listError,
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', {}, h('tr', {}, ['Họ và tên', 'Email', 'Trạng thái', 'Vai trò', 'Thao tác'].map((label) => h('th', { scope: 'col' }, label)))),
            userRows
          )
        ),
        pagination
      )
    )
  );
  await load();
}
