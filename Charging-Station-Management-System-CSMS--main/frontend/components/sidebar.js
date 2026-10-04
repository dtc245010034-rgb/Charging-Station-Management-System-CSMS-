import { h } from '../app/dom.js';
import { visibleNav, routeFor, WORKSPACES } from '../app/workspace.js';
import { icon } from './icons.js';

export function createSidebar({ workspaceId, role, can, onNavigate }) {
  const links = new Map();
  const groups = visibleNav(workspaceId, role, can).map((group) => h('div', { class: 'nav-group' },
    group.title && h('div', { class: 'nav-group__title' }, group.title),
    group.items.map((item) => {
      const link = h('a', { class: 'nav-link', href: routeFor(workspaceId, item.page), onclick: onNavigate }, icon(item.icon), item.label);
      links.set(item.page, link);
      return link;
    })));

  const el = h('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Điều hướng chính' },
    h('div', { class: 'brand' }, h('span', { class: 'brand__mark' }, icon('bolt', { size: 20 })), 'CSMS'),
    h('nav', {}, groups),
    h('div', { class: 'sidebar__foot' }, h('div', { class: 'eyebrow' }, WORKSPACES[workspaceId].label)));

  function setCurrent(page) {
    for (const [name, link] of links) {
      if (name === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }
  return { el, setCurrent };
}
