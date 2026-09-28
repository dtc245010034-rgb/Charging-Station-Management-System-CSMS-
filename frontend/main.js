import './app/theme.js';
import { me, logout, toSessionUser } from './app/auth.js';
import { session } from './app/state.js';
import { can } from './app/permissions.js';
import { parseHash, pageLoader, PAGE_NEEDS } from './app/router.js';
import { WORKSPACES, workspacesFor, routeFor, visibleNav } from './app/workspace.js';
import { h } from './app/dom.js';
import { createSidebar } from './components/sidebar.js';
import { createTopbar } from './components/topbar.js';
import { openPalette } from './components/palette.js';
import { emptyState, errorState, loadingState } from './components/empty-state.js';
import { icon } from './components/icons.js';
import { getTheme, toggleTheme, onThemeChange } from './app/theme.js';

const root = document.getElementById('root');
let shell = null;
let cleanup = null;
let navigation = 0;

async function signOut() {
  try { await logout(); } finally { location.replace('/index.html'); }
}

// ---------- Shell cho workspace desktop (Admin / Operator / Owner / Accountant) ----------
function buildDeskShell(workspaceId, user) {
  const role = WORKSPACES[workspaceId].role;
  const app = h('div', { class: 'app', 'data-nav-open': 'false' });
  const closeNav = () => { app.dataset.navOpen = 'false'; };
  const sidebar = createSidebar({ workspaceId, role, can, onNavigate: closeNav });
  const context = { workspaceId, role, can };
  const topbar = createTopbar({
    user, workspaceId,
    onMenu: () => { app.dataset.navOpen = app.dataset.navOpen === 'true' ? 'false' : 'true'; },
    onSearch: () => openPalette(context),
    onSwitch: (target) => { location.hash = routeFor(target); },
    onLogout: signOut,
    onAccount: () => { location.hash = routeFor(workspaceId, 'account'); },
  });
  const main = h('main', { class: 'workspace', id: 'workspace', tabindex: '-1' });
  app.append(
    h('a', { class: 'skip-link', href: '#workspace', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Bỏ qua điều hướng'),
    sidebar.el,
    h('div', { class: 'sidebar-backdrop', onclick: closeNav }),
    h('div', { class: 'main' }, topbar.el, main));
  root.replaceChildren(app);

  const onKey = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(context); }
    if (event.key === 'Escape') closeNav();
  };
  document.addEventListener('keydown', onKey);
  return { workspaceId, role, main, setCurrent: sidebar.setCurrent, destroy() { document.removeEventListener('keydown', onKey); topbar.destroy(); } };
}

// ---------- Shell mobile-first cho Tài xế ----------
function buildMobileShell(workspaceId, user) {
  const role = WORKSPACES[workspaceId].role;
  const links = new Map();
  const tabs = visibleNav(workspaceId, role, can).flatMap((group) => group.items).map((item) => {
    const link = h('a', { class: 'tabbar__link', href: routeFor(workspaceId, item.page) }, icon(item.icon, { size: 22 }), item.label);
    links.set(item.page, link);
    return link;
  });
  const themeBtn = h('button', { class: 'btn btn--ghost btn--icon', type: 'button', onclick: toggleTheme });
  const paintTheme = () => {
    const light = getTheme() === 'light';
    themeBtn.replaceChildren(icon(light ? 'moon' : 'sun'));
    themeBtn.setAttribute('aria-label', light ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng');
  };
  paintTheme();
  const offTheme = onThemeChange(paintTheme);
  const main = h('main', { class: 'driver-app__content', id: 'workspace', tabindex: '-1' });
  root.replaceChildren(h('div', { class: 'driver-app' },
    h('header', { class: 'driver-app__bar' },
      h('div', { class: 'brand', style: 'padding:0' }, h('span', { class: 'brand__mark' }, icon('bolt', { size: 20 })), 'CSMS'),
      h('div', { class: 'toolbar' }, themeBtn)),
    main,
    h('nav', { class: 'tabbar', 'aria-label': 'Điều hướng chính' }, tabs)));
  return {
    workspaceId, role, main,
    setCurrent(page) {
      for (const [name, link] of links) {
        if (name === page) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      }
    },
    destroy: offTheme,
    user,
  };
}

async function showPage(route) {
  const token = ++navigation;
  cleanup?.();
  cleanup = null;
  const { main } = shell;
  const ctx = {
    user: session.get().user, workspace: route.workspace, role: shell.role, root: main, params: route,
    can: (key) => can(shell.role, key),
  };
  const needs = PAGE_NEEDS[route.page];
  const loader = pageLoader(route.page, route.workspace);
  shell.setCurrent(route.page);

  if (!loader) {
    main.replaceChildren(emptyState({ iconName: 'search', title: 'Không tìm thấy trang', text: 'Trang này không tồn tại hoặc chưa được mở cho vai trò của bạn.' }));
    return;
  }
  if (needs && !can(shell.role, needs)) {
    main.replaceChildren(emptyState({ iconName: 'alert', title: 'Bạn không có quyền mở trang này', text: 'Nếu cần dùng, hãy liên hệ Quản trị viên.' }));
    return;
  }
  main.replaceChildren(loadingState());
  try {
    const module = await loader();
    if (token !== navigation) return;
    main.replaceChildren();
    const teardown = await module.render(ctx);
    if (token !== navigation) { teardown?.(); return; }
    cleanup = teardown ?? null;
    if (document.activeElement === document.body) main.focus({ preventScroll: true });
  } catch (error) {
    if (token !== navigation) return;
    main.replaceChildren(errorState({ message: error.message, onRetry: () => showPage(route) }));
  }
}

function onRoute() {
  const user = session.get().user;
  const allowed = workspacesFor(user.roles);
  const route = parseHash(location.hash);
  if (!allowed.includes(route.workspace)) {
    location.replace(routeFor(allowed[0]));
    return;
  }
  if (!shell || shell.workspaceId !== route.workspace) {
    cleanup?.();
    cleanup = null;
    shell?.destroy?.();
    shell = WORKSPACES[route.workspace].layout === 'mobile' ? buildMobileShell(route.workspace, user) : buildDeskShell(route.workspace, user);
  }
  showPage(route);
}

async function boot() {
  let user;
  try {
    user = toSessionUser(await me());
  } catch (error) {
    // 401 đã được api.js chuyển về /index.html; lỗi mạng thì báo tại chỗ.
    if (error.status !== 401) root.replaceChildren(errorState({ message: 'Không kết nối được máy chủ.', onRetry: () => location.reload() }));
    return;
  }
  if (!workspacesFor(user.roles).length) {
    root.replaceChildren(emptyState({ iconName: 'alert', title: 'Tài khoản chưa có vai trò hợp lệ', text: 'Hãy liên hệ Quản trị viên.' }));
    return;
  }
  session.set({ user });
  window.addEventListener('hashchange', onRoute);
  onRoute();
}

boot();
