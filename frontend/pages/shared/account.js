import { h } from '../../app/dom.js';
import { initials } from '../../app/format.js';
import { getTheme, toggleTheme } from '../../app/theme.js';
import { logout } from '../../app/auth.js';
import { WORKSPACES, workspaceForRole } from '../../app/workspace.js';
import { roleTag } from '../../components/badge.js';
import { icon } from '../../components/icons.js';
import { api } from '../../services/api.js';
import { mount } from '../../app/dom.js';

export function render(ctx) {
  const { user } = ctx;
  const themeLabel = () => (getTheme() === 'light' ? 'Đang dùng giao diện sáng' : 'Đang dùng giao diện tối');
  const themeText = h('span', { class: 'muted' }, themeLabel());
  let erasureButton;
  let erasureStatus;
  let erasureRequests;

  if (ctx.can('erasure:request')) {
    erasureStatus = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' }, 'Đang tải trạng thái yêu cầu…');
    erasureButton = h('button', {
      class: 'btn btn--danger',
      type: 'button',
      disabled: true,
      onclick: async () => {
        if (!window.confirm('Gửi yêu cầu ẩn danh hóa dữ liệu cá nhân và lịch sử sạc?')) return;
        erasureButton.disabled = true;
        try {
          const created = await api('/api/me/erasure-requests', { method: 'POST', body: {} });
          mount(erasureStatus, `Đã gửi yêu cầu #${created.id}. Quản trị viên sẽ xem xét trước khi xử lý.`);
          erasureRequests = [...erasureRequests, created];
        } catch (error) {
          mount(erasureStatus, error.message);
          erasureButton.disabled = false;
        }
      },
    }, 'Yêu cầu xóa dữ liệu');
  }

  ctx.root.append(
    h('div', { class: 'page-head' }, h('h1', { class: 'page-head__title' }, 'Tài khoản')),
    h('section', { class: 'card', style: 'max-width:560px' },
      h('div', { class: 'card__body stack' },
        h('div', { class: 'toolbar', style: 'gap:14px' },
          h('span', { class: 'avatar', style: 'width:48px;height:48px;font-size:16px' }, initials(user.name)),
          h('div', {}, h('div', { class: 'cell-strong' }, user.name), h('div', { class: 'cell-sub' }, user.email))),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Vai trò'),
          h('dd', {}, h('div', { class: 'chips', style: 'margin:0' }, user.roles.map((role) => roleTag(WORKSPACES[workspaceForRole(role)]?.label ?? role))))),
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn', type: 'button', onclick: () => { toggleTheme(); themeText.textContent = themeLabel(); } }, icon(getTheme() === 'light' ? 'moon' : 'sun'), 'Đổi giao diện'),
          themeText),
        ctx.can('erasure:request') ? h('section', { class: 'stack', 'aria-label': 'Dữ liệu cá nhân' },
          h('h2', { class: 'cell-strong' }, 'Dữ liệu cá nhân'),
          h('p', { class: 'muted' }, 'Khi được duyệt, phiên và hóa đơn được ẩn danh hóa; dữ liệu sổ sách tài chính được giữ ở dạng ẩn danh. Phạm vi lưu giữ cần người có thẩm quyền xác nhận.'),
          erasureStatus,
          erasureButton
        ) : null,
        h('div', {}, h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => { try { await logout(); } finally { location.replace('/index.html'); } } }, icon('logout'), 'Đăng xuất')))));

  if (ctx.can('erasure:request')) {
    void api('/api/me/erasure-requests').then(({ requests }) => {
      erasureRequests = requests;
      const latest = requests[0];
      if (latest) {
        mount(erasureStatus, `Yêu cầu gần nhất: ${latest.status}.`);
      } else {
        mount(erasureStatus, 'Chưa có yêu cầu nào.');
      }
      erasureButton.disabled = requests.some((item) => ['REQUESTED', 'APPROVED', 'COMPLETED'].includes(item.status));
    }).catch((error) => {
      mount(erasureStatus, error.message);
      erasureButton.disabled = true;
    });
  }
}
