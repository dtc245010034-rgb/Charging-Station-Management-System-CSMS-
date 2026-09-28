import { h } from '../../app/dom.js';
import { coordinate } from '../../app/format.js';
import * as csms from '../../services/csms.js';
import { openDrawer } from '../../components/modal.js';
import { stationBadge, statusBadge } from '../../components/badge.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { toast } from '../../components/toast.js';
import { openStationForm } from './station-form.js';

const slug = (text) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 24) || 'STATION';

function chargePointForm(station, canWrite, reload) {
  if (!canWrite) return null;
  const code = h('input', { class: 'input', id: 'cp-code', maxlength: 50, autocomplete: 'off', required: true, 'aria-describedby': 'cp-hint' });
  const hint = h('span', { class: 'field__hint', id: 'cp-hint', 'aria-live': 'polite' });
  const count = h('select', { class: 'select', id: 'cp-count', 'aria-label': 'Số đầu nối' }, [1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === 2 }, `${n} đầu nối`)));
  const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, icon('plus'), 'Thêm trụ');
  const error = h('p', { class: 'form-alert', role: 'alert', hidden: true });
  let available = null;
  let timer; let sequence = 0;

  code.addEventListener('input', () => {
    clearTimeout(timer);
    available = null;
    const mine = ++sequence;
    const value = code.value.trim();
    hint.textContent = value ? 'Đang kiểm tra…' : '';
    hint.dataset.state = '';
    if (!value) return;
    timer = setTimeout(async () => {
      try {
        const result = await csms.chargePoints.checkCode(value);
        if (mine !== sequence) return;
        available = result.is_available;
        hint.textContent = available ? 'Mã có thể dùng' : 'Mã trụ này đã tồn tại trên hệ thống';
        hint.dataset.state = available ? 'ok' : 'bad';
      } catch (e) { if (mine === sequence) hint.textContent = e.message; }
    }, 400);
  });

  const suggest = () => {
    const serial = String((station.charge_points?.length ?? 0) + 1).padStart(2, '0');
    code.value = `${slug(station.name)}-CP${serial}`.slice(0, 50);
    code.dispatchEvent(new Event('input', { bubbles: true }));
  };

  return h('form', { class: 'stack', novalidate: true, onsubmit: async (event) => {
    event.preventDefault();
    const value = code.value.trim();
    if (!value) { hint.textContent = 'Mã trụ là bắt buộc'; hint.dataset.state = 'bad'; return; }
    if (available === false) return;
    submit.disabled = true;
    error.hidden = true;
    try {
      const created = await csms.chargePoints.create(station.id, { code: value, connector_count: Number(count.value) });
      toast(`Đã thêm trụ ${created.code}.`);
      await reload();
    } catch (e) { error.textContent = e.message; error.hidden = false; } finally { submit.disabled = false; }
  } },
  h('div', { class: 'section-title' }, 'Thêm trụ sạc'),
  h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Mã trụ'), code, hint),
  h('div', { class: 'toolbar' }, count, h('button', { class: 'btn', type: 'button', onclick: suggest }, 'Tạo mã gợi ý'), submit),
  error);
}

function render(station, { canWrite, onEdit, reload, onOpenChargePoint }) {
  const points = station.charge_points ?? [];
  return [
    h('dl', { class: 'kv' },
      h('dt', {}, 'Địa chỉ'), h('dd', {}, station.address),
      h('dt', {}, 'Vĩ độ'), h('dd', {}, coordinate(station.latitude)),
      h('dt', {}, 'Kinh độ'), h('dd', {}, coordinate(station.longitude))),
    h('section', {},
      h('div', { class: 'section-title' }, `Trụ sạc (${points.length})`),
      points.length
        ? h('div', { class: 'list-rows' }, points.map((point) => h('div', { class: 'list-row' },
          h('div', { style: 'min-width:0' },
            h('button', { class: 'row-link mono', type: 'button', onclick: () => onOpenChargePoint(point.id) }, point.code),
            h('div', { class: 'chips' }, (point.connectors ?? []).map((c) => h('span', { class: 'badge badge--neutral', title: `Trạng thái gốc: ${c.status}` }, `Đầu ${c.connector_no}: ${c.status}`)))),
          statusBadge(point.status))))
        : emptyState({ iconName: 'charger', title: 'Trạm chưa có trụ sạc', text: canWrite ? 'Thêm trụ đầu tiên ở bên dưới.' : undefined })),
    chargePointForm(station, canWrite, reload),
    canWrite && h('div', {}, h('button', { class: 'btn', type: 'button', onclick: onEdit }, icon('edit'), 'Sửa thông tin trạm')),
  ];
}

// Drawer chi tiết trạm: mở từ bản đồ, danh sách hoặc tìm kiếm mà không rời trang hiện tại.
export function openStationDrawer({ id, canWrite, onChanged, onClose, onOpenChargePoint }) {
  const drawer = openDrawer({ title: 'Chi tiết trạm', body: loadingState(3), onClose });

  async function load() {
    try {
      const station = await csms.stations.get(id);
      drawer.setTitle(station.name, h('div', { style: 'margin-top:6px' }, stationBadge(station.status)));
      drawer.setBody(...render(station, {
        canWrite,
        reload: async () => { await load(); onChanged?.(); },
        onEdit: () => openStationForm({ station, onSaved: async () => { await load(); onChanged?.(); } }),
        onOpenChargePoint: (cpId) => { drawer.close(); onOpenChargePoint?.(cpId); },
      }).filter(Boolean));
    } catch (error) {
      drawer.setBody(errorState({ message: error.message, onRetry: load }));
    }
  }
  load();
  return drawer;
}
