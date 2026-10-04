import { h } from '../../app/dom.js';
import { coordinate } from '../../app/format.js';
import { routeFor } from '../../app/workspace.js';
import { stationStatusLabels } from '../../app/status.js';
import { dataTable } from '../../components/table.js';
import { stationBadge } from '../../components/badge.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { createFleet, watch } from './fleet.js';
import { openStationDrawer } from './station-drawer.js';
import { openStationForm } from './station-form.js';

// Đổi hash mà không kích hoạt render lại trang: giữ được đường dẫn sâu tới drawer.
const silentHash = (hash) => history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);

export function render(ctx) {
  const canWrite = ctx.can('stations:write');
  const fleet = createFleet();
  const filters = { query: '', status: '' };
  let drawer = null;
  let selectedId = null;

  const title = ctx.role === 'STATION_OWNER' ? 'Trạm sạc của tôi' : 'Trạm sạc';
  const body = h('div', { class: 'card__body card__body--flush' });
  const count = h('p', { class: 'page-head__sub' }, 'Đang tải…');

  const table = dataTable({
    caption: title,
    rowId: (row) => row.id,
    onRowClick: (row) => open(row.id),
    columns: [
      { key: 'name', label: 'Trạm', render: (s) => h('div', {}, h('div', { class: 'cell-strong' }, s.name), h('div', { class: 'cell-sub' }, s.address)) },
      { key: 'status', label: 'Trạng thái', render: (s) => stationBadge(s.status) },
      { key: 'cps', label: 'Số trụ', align: 'num', render: (s) => s.charge_point_count },
      { key: 'coords', label: 'Toạ độ', render: (s) => h('span', { class: 'mono' }, s.latitude === null ? '—' : `${coordinate(s.latitude)}, ${coordinate(s.longitude)}`) },
      canWrite && { key: 'edit', label: '', align: 'num', render: (s) => h('button', { class: 'btn btn--ghost', type: 'button', 'aria-label': `Sửa trạm ${s.name}`, onclick: (e) => { e.stopPropagation(); openStationForm({ station: s, onSaved: () => fleet.refresh() }); } }, icon('edit'), 'Sửa') },
    ].filter(Boolean),
  });

  function open(id) {
    drawer?.close();
    selectedId = id;
    silentHash(routeFor(ctx.workspace, 'stations', id));
    drawer = openStationDrawer({
      id, canWrite,
      onChanged: () => fleet.refresh(),
      onOpenChargePoint: (cpId) => { location.hash = routeFor(ctx.workspace, 'charge-points', cpId); },
      onClose: () => { selectedId = null; drawer = null; silentHash(routeFor(ctx.workspace, 'stations')); paint(fleet.store.get()); },
    });
    paint(fleet.store.get());
  }

  function paint(state) {
    if (!state.loaded) {
      body.replaceChildren(state.error ? errorState({ message: state.error, onRetry: () => fleet.refresh() }) : loadingState());
      return;
    }
    const q = filters.query.toLowerCase();
    const rows = state.stations.filter((s) => (!q || `${s.name} ${s.address}`.toLowerCase().includes(q)) && (!filters.status || s.status === filters.status));
    count.textContent = `${state.stations.length} trạm sạc${filters.query || filters.status ? ` · đang hiện ${rows.length}` : ''}`;
    if (!rows.length) {
      body.replaceChildren(emptyState({
        iconName: 'station',
        title: state.stations.length ? 'Không có trạm phù hợp' : 'Chưa có trạm sạc nào',
        text: state.stations.length ? 'Thử đổi từ khoá hoặc bộ lọc.' : (canWrite ? 'Tạo trạm đầu tiên để bắt đầu khai báo trụ và đầu nối.' : 'Chưa có trạm nào trong hệ thống.'),
        action: !state.stations.length && canWrite ? h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openStationForm({ onSaved: () => fleet.refresh() }) }, icon('plus'), 'Thêm trạm') : null,
      }));
      return;
    }
    table.update(rows, selectedId);
    body.replaceChildren(table.el);
  }

  const search = h('input', { class: 'input toolbar__grow', type: 'search', placeholder: 'Tìm theo tên hoặc địa chỉ…', 'aria-label': 'Tìm trạm', oninput: (e) => { filters.query = e.target.value.trim(); paint(fleet.store.get()); } });
  const status = h('select', { class: 'select', 'aria-label': 'Lọc theo trạng thái', onchange: (e) => { filters.status = e.target.value; paint(fleet.store.get()); } },
    h('option', { value: '' }, 'Tất cả trạng thái'), Object.entries(stationStatusLabels).map(([v, l]) => h('option', { value: v }, l)));

  ctx.root.append(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', { class: 'page-head__title' }, title), count),
      h('div', { class: 'page-head__actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => fleet.refresh() }, icon('refresh'), 'Làm mới'),
        canWrite && h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openStationForm({ onSaved: () => fleet.refresh() }) }, icon('plus'), 'Thêm trạm'))),
    h('div', { class: 'toolbar' }, search, status),
    h('section', { class: 'card', 'aria-label': title }, body));

  const off = watch(fleet.store, (s) => s, paint);
  if (ctx.params.id) open(ctx.params.id);
  return () => { off(); fleet.stop(); drawer?.close(); };
}
