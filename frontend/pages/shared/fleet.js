import { h } from '../../app/dom.js';
import { createStore } from '../../app/state.js';
import { GROUPS, countByGroup, stationStatusLabels, worstGroup } from '../../app/status.js';
import * as csms from '../../services/csms.js';
import { subscribe } from '../../services/realtime.js';
import { kpiCard } from '../../components/kpi-card.js';
import { donut } from '../../components/donut.js';
import { createStationMap } from '../../components/station-map.js';
import { emptyState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';

// Kho dữ liệu trạm + trụ dùng chung cho các màn hình giám sát. Chỉ báo thay đổi khi dữ liệu thật sự đổi.
export function createFleet({ withChargePoints = true } = {}) {
  const store = createStore({ stations: [], chargePoints: [], loaded: false, error: null });
  let last = '';
  const poll = subscribe(
    async () => {
      const [stations, chargePoints] = await Promise.all([csms.stations.list(), withChargePoints ? csms.chargePoints.list() : []]);
      return { stations, chargePoints };
    },
    (data) => {
      const key = JSON.stringify(data);
      if (key === last && store.get().loaded) { if (store.get().error) store.set({ error: null }); return; }
      last = key;
      store.set({ ...data, loaded: true, error: null });
    },
    { onError: (error) => store.set({ error: error.message }) },
  );
  return { store, refresh: poll.refresh, stop: poll.stop };
}

// Chỉ gọi cb khi phần dữ liệu được chọn thật sự đổi → chỉ component bị ảnh hưởng mới vẽ lại.
export function watch(store, selector, cb) {
  let previous;
  const run = (state) => {
    const value = selector(state);
    const key = JSON.stringify(value);
    if (key === previous) return;
    previous = key;
    cb(value);
  };
  run(store.get());
  return store.subscribe(run);
}

export const stationPoints = (state) => state.stations
  .filter((s) => s.latitude !== null && s.longitude !== null)
  .map((s) => ({
    id: s.id, name: s.name, lat: Number(s.latitude), lng: Number(s.longitude), status: s.status, address: s.address,
    count: s.charge_point_count,
    group: worstGroup(state.chargePoints.filter((cp) => cp.station_id === s.id).map((cp) => cp.status)),
  }));

// ---------- Widgets ----------
export function kpiRow(fleet) {
  const cards = {
    total: kpiCard({ label: 'Tổng số trụ', iconName: 'charger', value: null }),
    charging: kpiCard({ label: 'Đang sạc', iconName: 'bolt', tone: 'charging', value: null }),
    ready: kpiCard({ label: 'Sẵn sàng', iconName: 'check', tone: 'ready', value: null }),
    warning: kpiCard({ label: 'Cảnh báo', iconName: 'alert', tone: 'warning', value: null, note: 'Chưa có nguồn cảnh báo' }),
    fault: kpiCard({ label: 'Lỗi', iconName: 'alert', tone: 'fault', value: null }),
    offline: kpiCard({ label: 'Ngoại tuyến / chưa rõ', iconName: 'wifi', tone: 'offline', value: null }),
  };
  const el = h('section', { class: 'kpi-row', 'aria-label': 'Chỉ số chính' }, Object.values(cards).map((card) => card.el));
  const off = watch(fleet.store, (s) => ({ loaded: s.loaded, n: s.chargePoints.length, stations: s.stations.length, groups: countByGroup(s.chargePoints.map((c) => c.status)) }), (v) => {
    if (!v.loaded) return;
    cards.total.update(v.n, `${v.stations} trạm`);
    for (const key of ['charging', 'ready', 'fault', 'offline']) cards[key].update(v.groups[key]);
  });
  return { el, destroy: off };
}

const DONUT_SEGMENTS = ['ready', 'charging', 'fault', 'offline'].map((key) => ({ key, label: GROUPS[key].label, tone: key }));

export function statusCard(fleet, { onSelectGroup } = {}) {
  const chart = donut({ segments: DONUT_SEGMENTS, onSelect: onSelectGroup });
  const hint = h('p', { class: 'field__hint', style: 'margin-top:10px' });
  const el = h('section', { class: 'card', 'aria-labelledby': 'status-title' },
    h('div', { class: 'card__head' }, h('h2', { class: 'card__title', id: 'status-title' }, 'Trạng thái trụ')),
    h('div', { class: 'card__body' }, chart.el, hint));
  const off = watch(fleet.store, (s) => ({ loaded: s.loaded, groups: countByGroup(s.chargePoints.map((c) => c.status)) }), (v) => {
    chart.update(v.groups);
    const total = Object.values(v.groups).reduce((a, b) => a + b, 0);
    hint.textContent = !v.loaded ? '' : total ? (onSelectGroup ? 'Bấm một nhóm để lọc danh sách trụ.' : '') : 'Chưa có trụ nào được khai báo.';
  });
  return { el, destroy: off };
}

export function mapCard(fleet, { onSelectStation, title = 'Bản đồ trạm sạc' }) {
  const mapEl = h('div', { class: 'map', role: 'application', 'aria-label': 'Bản đồ các trạm sạc' });
  const list = h('div', { class: 'item-list' });
  const state = { query: '', group: '' };
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Tìm trạm…', 'aria-label': 'Tìm trạm', style: 'min-width:150px;min-height:34px', oninput: (e) => { state.query = e.target.value.trim().toLowerCase(); paint(); } });
  const filter = h('select', { class: 'select', 'aria-label': 'Lọc theo trạng thái', style: 'width:auto;min-height:34px', onchange: (e) => { state.group = e.target.value; paint(); } },
    h('option', { value: '' }, 'Tất cả trạng thái'),
    ['ready', 'charging', 'fault', 'offline'].map((key) => h('option', { value: key }, GROUPS[key].label)));

  const map = createStationMap(mapEl, { onSelect: onSelectStation });
  let points = [];
  let missing = 0;

  function visible() {
    return points.filter((p) => (!state.query || `${p.name} ${p.address}`.toLowerCase().includes(state.query)) && (!state.group || p.group === state.group));
  }
  function paint() {
    const shown = visible();
    map.update(shown);
    list.replaceChildren(...(shown.length
      ? shown.map((p) => h('button', { class: 'item', type: 'button', onclick: () => onSelectStation(p.id) },
        h('span', { class: `dot dot--${p.group}`, 'aria-hidden': 'true' }),
        h('span', { class: 'item__main' }, h('div', { class: 'item__title' }, p.name), h('div', { class: 'cell-sub' }, `${p.count} trụ · ${stationStatusLabels[p.status] ?? p.status}`))))
      : [emptyState({ iconName: 'station', title: points.length ? 'Không có trạm phù hợp' : 'Chưa có trạm có toạ độ', text: points.length ? 'Thử đổi từ khoá hoặc bộ lọc.' : 'Trạm được tạo kèm toạ độ sẽ hiện trên bản đồ.' })]));
    note.textContent = missing ? `${missing} trạm chưa có toạ độ nên không hiện trên bản đồ.` : '';
  }
  const note = h('p', { class: 'field__hint', style: 'padding:0 4px' });

  const legend = h('div', { class: 'stack', style: 'gap:6px' },
    h('div', { class: 'section-title', style: 'margin:0' }, 'Chú thích trạng thái'),
    ['ready', 'charging', 'warning', 'fault', 'offline'].map((key) => h('div', { class: 'toolbar', style: 'gap:8px' }, h('span', { class: `dot dot--${key}` }), GROUPS[key].label)));

  const el = h('section', { class: 'card', 'aria-labelledby': 'map-title' },
    h('div', { class: 'card__head' }, h('h2', { class: 'card__title', id: 'map-title' }, title), h('div', { class: 'toolbar' }, search, filter)),
    h('div', { class: 'card__body map-card__body', style: 'margin-top:14px' },
      mapEl,
      h('div', { class: 'map-side' }, legend, h('div', {}, h('div', { class: 'section-title' }, 'Danh sách trạm'), list, note))));

  const off = watch(fleet.store, (s) => ({ loaded: s.loaded, points: stationPoints(s), total: s.stations.length }), (v) => {
    if (!v.loaded) return;
    points = v.points;
    missing = v.total - v.points.length;
    paint();
  });
  return { el, invalidate: () => map.invalidate(), destroy() { off(); map.destroy(); } };
}

export function placeholderCard({ title, iconName, headline, text, id }) {
  return h('section', { class: 'card', 'aria-labelledby': id },
    h('div', { class: 'card__head' }, h('h2', { class: 'card__title', id }, title)),
    h('div', { class: 'card__body' }, emptyState({ iconName: iconName ?? 'inbox', title: headline, text })));
}

export const refreshButton = (fleet) => h('button', { class: 'btn', type: 'button', onclick: () => fleet.refresh() }, icon('refresh'), 'Làm mới');
