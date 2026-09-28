import { h } from '../../app/dom.js';
import { formatKw, formatDateTime } from '../../app/format.js';
import { routeFor } from '../../app/workspace.js';
import { GROUPS, groupOf } from '../../app/status.js';
import * as csms from '../../services/csms.js';
import { dataTable } from '../../components/table.js';
import { statusBadge } from '../../components/badge.js';
import { openDrawer, openModal } from '../../components/modal.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { toast } from '../../components/toast.js';
import { createFleet, watch } from './fleet.js';

const silentHash = (hash) => history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
const GROUP_FILTERS = ['ready', 'charging', 'fault', 'offline'];

function openEditForm(point, onSaved) {
  const input = (id, props) => h('input', { class: 'input', id, ...props });
  const code = input('cp-e-code', { maxlength: 50, value: point.code, required: true });
  const model = input('cp-e-model', { maxlength: 100, value: point.model ?? '' });
  const vendor = input('cp-e-vendor', { maxlength: 100, value: point.vendor ?? '' });
  const power = input('cp-e-power', { type: 'number', min: 0, step: 'any', value: point.power_kw });
  const error = h('p', { class: 'form-alert', role: 'alert', hidden: true });
  const save = h('button', { class: 'btn btn--primary', type: 'submit', form: 'cp-edit-form' }, 'Lưu thay đổi');
  const modal = openModal({
    title: `Sửa trụ ${point.code}`,
    body: h('form', { id: 'cp-edit-form', class: 'stack', onsubmit: async (event) => {
      event.preventDefault();
      const next = { code: code.value.trim(), model: model.value.trim() || null, vendor: vendor.value.trim() || null, power_kw: power.value };
      const body = {};
      if (next.code !== point.code) body.code = next.code;
      if (next.model !== (point.model ?? null)) body.model = next.model;
      if (next.vendor !== (point.vendor ?? null)) body.vendor = next.vendor;
      if (Number(next.power_kw) !== Number(point.power_kw)) body.power_kw = next.power_kw;
      if (!Object.keys(body).length) { modal.close(); return; }
      save.disabled = true;
      try {
        await csms.chargePoints.update(point.id, body);
        modal.close();
        toast('Đã lưu thông tin trụ.');
        onSaved();
      } catch (e) { error.textContent = e.message; error.hidden = false; save.disabled = false; }
    } },
    h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Mã trụ'), code),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Công suất (kW)'), power),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Hãng'), vendor),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Mẫu'), model)),
    error),
    footer: [h('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'Hủy'), save],
  });
}

function openChargePointDrawer({ id, canWrite, workspace, onChanged, onClose }) {
  const drawer = openDrawer({ title: 'Chi tiết trụ sạc', body: loadingState(3), onClose });
  async function load() {
    try {
      const point = await csms.chargePoints.get(id);
      drawer.setTitle(point.code, h('div', { style: 'margin-top:6px' }, statusBadge(point.status)));
      drawer.setBody(
        h('dl', { class: 'kv' },
          h('dt', {}, 'Trạm'), h('dd', {}, h('a', { href: routeFor(workspace, 'stations', point.station_id), onclick: () => drawer.close() }, point.station_name)),
          h('dt', {}, 'Công suất'), h('dd', {}, formatKw(point.power_kw)),
          h('dt', {}, 'Hãng'), h('dd', {}, point.vendor || '—'),
          h('dt', {}, 'Mẫu'), h('dd', {}, point.model || '—'),
          h('dt', {}, 'Trạng thái gốc'), h('dd', {}, h('span', { class: 'mono' }, point.status)),
          h('dt', {}, 'Cập nhật'), h('dd', {}, formatDateTime(point.updated_at))),
        h('section', {},
          h('div', { class: 'section-title' }, `Đầu nối (${point.connectors.length})`),
          h('div', { class: 'list-rows' }, point.connectors.map((c) => h('div', { class: 'list-row' },
            h('div', {}, h('div', { class: 'cell-strong' }, `Đầu ${c.connector_no}`), h('div', { class: 'cell-sub' }, c.type)),
            statusBadge(c.status))))),
        canWrite && h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => openEditForm(point, async () => { await load(); onChanged(); }) }, icon('edit'), 'Sửa thông tin trụ')),
      );
    } catch (error) { drawer.setBody(errorState({ message: error.message, onRetry: load })); }
  }
  load();
  return drawer;
}

export function render(ctx) {
  const canWrite = ctx.can('charge-points:write');
  const fleet = createFleet();
  const filters = { query: '', group: GROUP_FILTERS.includes(ctx.params.query.status) ? ctx.params.query.status : '', station: '' };
  let drawer = null;
  let selectedId = null;

  const body = h('div', { class: 'card__body card__body--flush' });
  const count = h('p', { class: 'page-head__sub' }, 'Đang tải…');

  const table = dataTable({
    caption: 'Danh sách trụ sạc',
    rowId: (row) => row.id,
    onRowClick: (row) => open(row.id),
    columns: [
      { key: 'code', label: 'Mã trụ', render: (p) => h('span', { class: 'cell-strong mono' }, p.code) },
      { key: 'station', label: 'Trạm', render: (p) => p.station_name },
      { key: 'status', label: 'Trạng thái', render: (p) => statusBadge(p.status) },
      { key: 'power', label: 'Công suất', align: 'num', render: (p) => formatKw(p.power_kw) },
      { key: 'model', label: 'Hãng / mẫu', render: (p) => [p.vendor, p.model].filter(Boolean).join(' · ') || '—' },
    ],
  });

  function open(id) {
    drawer?.close();
    selectedId = id;
    silentHash(routeFor(ctx.workspace, 'charge-points', id));
    drawer = openChargePointDrawer({
      id, canWrite, workspace: ctx.workspace,
      onChanged: () => fleet.refresh(),
      onClose: () => { selectedId = null; drawer = null; silentHash(routeFor(ctx.workspace, 'charge-points')); paint(fleet.store.get()); },
    });
    paint(fleet.store.get());
  }

  function paint(state) {
    if (!state.loaded) {
      body.replaceChildren(state.error ? errorState({ message: state.error, onRetry: () => fleet.refresh() }) : loadingState());
      return;
    }
    const q = filters.query.toLowerCase();
    const rows = state.chargePoints.filter((p) => (!q || `${p.code} ${p.station_name} ${p.vendor ?? ''} ${p.model ?? ''}`.toLowerCase().includes(q))
      && (!filters.group || groupOf(p.status) === filters.group)
      && (!filters.station || String(p.station_id) === filters.station));
    count.textContent = `${state.chargePoints.length} trụ sạc${rows.length !== state.chargePoints.length ? ` · đang hiện ${rows.length}` : ''}`;
    if (!rows.length) {
      body.replaceChildren(emptyState({
        iconName: 'charger',
        title: state.chargePoints.length ? 'Không có trụ phù hợp' : 'Chưa có trụ sạc nào',
        text: state.chargePoints.length ? 'Thử đổi từ khoá hoặc bộ lọc.' : 'Trụ được thêm từ chi tiết của từng trạm.',
      }));
      return;
    }
    table.update(rows, selectedId);
    body.replaceChildren(table.el);
  }

  const stationSelect = h('select', { class: 'select', 'aria-label': 'Lọc theo trạm', onchange: (e) => { filters.station = e.target.value; paint(fleet.store.get()); } }, h('option', { value: '' }, 'Tất cả trạm'));
  const groupSelect = h('select', { class: 'select', 'aria-label': 'Lọc theo trạng thái', onchange: (e) => { filters.group = e.target.value; paint(fleet.store.get()); } },
    h('option', { value: '' }, 'Tất cả trạng thái'),
    GROUP_FILTERS.map((g) => h('option', { value: g, selected: g === filters.group }, GROUPS[g].label)));

  ctx.root.append(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', { class: 'page-head__title' }, 'Trụ sạc'), count),
      h('div', { class: 'page-head__actions' }, h('button', { class: 'btn', type: 'button', onclick: () => fleet.refresh() }, icon('refresh'), 'Làm mới'))),
    h('div', { class: 'toolbar' },
      h('input', { class: 'input toolbar__grow', type: 'search', placeholder: 'Tìm theo mã trụ, trạm, hãng…', 'aria-label': 'Tìm trụ', oninput: (e) => { filters.query = e.target.value.trim(); paint(fleet.store.get()); } }),
      stationSelect, groupSelect),
    h('section', { class: 'card', 'aria-label': 'Danh sách trụ sạc' }, body));

  const offStations = watch(fleet.store, (s) => s.stations.map((st) => [st.id, st.name]), (list) => {
    stationSelect.replaceChildren(h('option', { value: '' }, 'Tất cả trạm'), ...list.map(([id, name]) => h('option', { value: id, selected: String(id) === filters.station }, name)));
  });
  const off = watch(fleet.store, (s) => s, paint);
  if (ctx.params.id) open(ctx.params.id);
  return () => { off(); offStations(); fleet.stop(); drawer?.close(); };
}
