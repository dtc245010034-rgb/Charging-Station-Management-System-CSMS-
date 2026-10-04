import { h } from '../app/dom.js';
import { initials } from '../app/format.js';
import { getTheme, toggleTheme, onThemeChange } from '../app/theme.js';
import { WORKSPACES } from '../app/workspace.js';
import { icon } from './icons.js';
import { roleTag } from './badge.js';

// Popover đơn giản: bấm ngoài hoặc Esc để đóng, aria-expanded đồng bộ.
function popover(trigger, buildContent, { align = 'right' } = {}) {
  let panel = null;
  const anchor = h('div', { class: 'menu-anchor' }, trigger);
  const close = () => {
    panel?.remove();
    panel = null;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const outside = (event) => { if (!anchor.contains(event.target)) close(); };
  const onKey = (event) => { if (event.key === 'Escape') { close(); trigger.focus(); } };
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', () => {
    if (panel) return close();
    panel = h('div', { class: 'menu', style: align === 'left' ? 'left:0;right:auto' : null }, buildContent(close));
    anchor.append(panel);
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);
  });
  return anchor;
}

export function createTopbar({ user, workspaceId, onMenu, onSearch, onSwitch, onLogout, onAccount }) {
  const workspaceIds = user.roles.map((role) => Object.keys(WORKSPACES).find((id) => WORKSPACES[id].role === role)).filter(Boolean);
  const themeBtn = h('button', { class: 'btn btn--ghost btn--icon', type: 'button', onclick: toggleTheme });
  const renderTheme = () => {
    const light = getTheme() === 'light';
    themeBtn.replaceChildren(icon(light ? 'moon' : 'sun'));
    themeBtn.setAttribute('aria-label', light ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng');
  };
  renderTheme();
  const offTheme = onThemeChange(renderTheme);

  const searchBtn = h('button', { class: 'search-trigger', type: 'button', onclick: onSearch, 'aria-label': 'Tìm kiếm (Ctrl+K)' },
    icon('search'), h('span', { class: 'search-trigger__text' }, 'Tìm trạm, trụ sạc…'),
    h('span', { class: 'search-trigger__hint' }, h('kbd', {}, 'Ctrl'), ' ', h('kbd', {}, 'K')));

  // Chưa có nguồn thông báo (cảnh báo là S-46): không hiện số giả.
  const bell = popover(
    h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': 'Thông báo' }, icon('bell')),
    () => [h('div', { class: 'menu__head' }, h('strong', {}, 'Thông báo')),
      h('p', { class: 'muted', style: 'padding:8px 10px 12px' }, 'Chưa có thông báo nào.')],
  );

  const switcher = workspaceIds.length > 1
    ? h('select', { class: 'select', style: 'width:auto;min-height:34px', 'aria-label': 'Đổi workspace', onchange: (e) => onSwitch(e.target.value) },
      workspaceIds.map((id) => h('option', { value: id, selected: id === workspaceId }, WORKSPACES[id].label)))
    : roleTag(WORKSPACES[workspaceId].role);

  const userMenu = popover(
    h('button', { class: 'user-trigger', type: 'button' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(user.name)),
      h('span', { class: 'topbar__user-name' }, user.name), icon('chevron', { size: 16 })),
    (close) => [
      h('div', { class: 'menu__head' }, h('strong', {}, user.name), h('div', { class: 'cell-sub' }, user.email)),
      h('button', { class: 'menu__item', type: 'button', onclick: () => { close(); onAccount(); } }, icon('user'), 'Tài khoản'),
      h('button', { class: 'menu__item', type: 'button', onclick: onLogout }, icon('logout'), 'Đăng xuất'),
    ],
  );

  const el = h('header', { class: 'topbar' },
    h('button', { class: 'btn btn--ghost btn--icon topbar__menu', type: 'button', 'aria-label': 'Mở menu', 'aria-controls': 'sidebar', onclick: onMenu }, icon('menu')),
    switcher,
    h('div', { class: 'topbar__search' }, searchBtn),
    h('div', { class: 'topbar__actions' }, themeBtn, bell, userMenu));
  return { el, destroy: offTheme };
}
