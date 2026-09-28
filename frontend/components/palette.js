import { h } from '../app/dom.js';
import { routeFor, visibleNav } from '../app/workspace.js';
import * as csms from '../services/csms.js';
import { icon } from './icons.js';

const normalize = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

async function loadIndex({ workspaceId, role, can }) {
  const entries = visibleNav(workspaceId, role, can).flatMap((group) => group.items)
    .map((item) => ({ kind: 'Trang', title: item.label, sub: '', href: routeFor(workspaceId, item.page), iconName: item.icon }));
  if (can(role, 'stations:read')) {
    const [stations, points] = await Promise.all([
      csms.stations.list().catch(() => []),
      can(role, 'charge-points:read') ? csms.chargePoints.list().catch(() => []) : [],
    ]);
    entries.push(...stations.map((s) => ({ kind: 'Trạm', title: s.name, sub: s.address, href: routeFor(workspaceId, 'stations', s.id), iconName: 'station' })));
    entries.push(...points.map((p) => ({ kind: 'Trụ', title: p.code, sub: p.station_name, href: routeFor(workspaceId, 'charge-points', p.id), iconName: 'charger' })));
  }
  return entries;
}

export function openPalette(context) {
  let entries = [];
  let results = [];
  let active = 0;
  const list = h('div', { class: 'palette__list', role: 'listbox', id: 'palette-list' });
  const input = h('input', { class: 'palette__input', type: 'search', placeholder: 'Tìm trạm, trụ sạc, trang…', 'aria-label': 'Tìm kiếm', 'aria-controls': 'palette-list', autocomplete: 'off' });
  const dialog = h('dialog', { class: 'palette', 'aria-label': 'Tìm kiếm nhanh' }, input, list);

  const go = (entry) => { dialog.close(); location.hash = entry.href; };
  function paint() {
    const query = normalize(input.value.trim());
    results = (query ? entries.filter((e) => normalize(`${e.title} ${e.sub} ${e.kind}`).includes(query)) : entries).slice(0, 30);
    active = Math.min(active, Math.max(results.length - 1, 0));
    list.replaceChildren(...(results.length
      ? results.map((entry, index) => h('button', {
        class: 'palette__item', type: 'button', role: 'option', 'aria-selected': String(index === active), onclick: () => go(entry),
      }, icon(entry.iconName), h('span', {}, h('div', { class: 'cell-strong' }, entry.title), entry.sub && h('div', { class: 'cell-sub' }, entry.sub)),
      h('span', { class: 'badge badge--neutral palette__kind' }, entry.kind)))
      : [h('p', { class: 'muted', style: 'padding:14px' }, 'Không có kết quả phù hợp.')]));
  }
  input.addEventListener('input', () => { active = 0; paint(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { active = Math.min(active + 1, results.length - 1); paint(); event.preventDefault(); }
    else if (event.key === 'ArrowUp') { active = Math.max(active - 1, 0); paint(); event.preventDefault(); }
    else if (event.key === 'Enter' && results[active]) go(results[active]);
    list.children[active]?.scrollIntoView?.({ block: 'nearest' });
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('mousedown', (event) => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
  paint();
  loadIndex(context).then((loaded) => { entries = loaded; paint(); });
}
