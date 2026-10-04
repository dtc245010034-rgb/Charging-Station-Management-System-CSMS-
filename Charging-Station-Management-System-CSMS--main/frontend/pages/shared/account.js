import { h } from '../../app/dom.js';
import { initials } from '../../app/format.js';
import { getTheme, toggleTheme } from '../../app/theme.js';
import { logout } from '../../app/auth.js';
import { WORKSPACES, workspaceForRole } from '../../app/workspace.js';
import { roleTag } from '../../components/badge.js';
import { icon } from '../../components/icons.js';

export function render(ctx) {
  const { user } = ctx;
  const themeLabel = () => (getTheme() === 'light' ? 'Đang dùng giao diện sáng' : 'Đang dùng giao diện tối');
  const themeText = h('span', { class: 'muted' }, themeLabel());

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
        h('div', {}, h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => { try { await logout(); } finally { location.replace('/index.html'); } } }, icon('logout'), 'Đăng xuất')))));
}
