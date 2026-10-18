import { h } from '../../app/dom.js';
import { coordinate, formatKw } from '../../app/format.js';
import * as csms from '../../services/csms.js';
import { openDrawer, openModal } from '../../components/modal.js';
import { pointStatusBadge, stationBadge } from '../../components/badge.js';
import { pointGroup } from '../../app/status.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { toast } from '../../components/toast.js';
import { openStationForm } from './station-form.js';

const slug = (text) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 24) || 'STATION';

function powerWindowSection(station, canWrite, reload) {
  if (!canWrite) return null;
  const start = h('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: '08:00', pattern: '(?:[01]\\d|2[0-3]):[0-5]\\d', required: true, 'aria-label': 'Giờ bắt đầu' });
  const end = h('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: '18:00 hoặc 24:00', pattern: '(?:(?:[01]\\d|2[0-3]):[0-5]\\d|24:00)', required: true, 'aria-label': 'Giờ kết thúc' });
  const limit = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Ví dụ 30.0', required: true, 'aria-label': 'Hạn mức kW' });
  const error = h('p', { class: 'form-alert', role: 'alert', hidden: true });
  const rows = h('div', { class: 'list-rows' }, loadingState());
  const baseLimitRequired = station.power?.limitKw === null || station.power?.limitKw === undefined;
  const form = h('form', {
    class: 'stack',
    novalidate: true,
    onsubmit: async (event) => {
      event.preventDefault();
      error.hidden = true;
      const startMatch = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start.value);
      const endMatch = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(end.value);
      const toMinute = (value) => value === '24:00' ? 1440 : Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
      if (!startMatch || !endMatch || toMinute(end.value) <= toMinute(start.value)) {
        error.textContent = 'Nhập giờ hợp lệ và giờ kết thúc phải sau giờ bắt đầu.';
        error.hidden = false;
        return;
      }
      if (!/^\d+(?:\.\d)?$/.test(limit.value.trim()) || Number(limit.value) <= 0 || Number(limit.value) > 100000) {
        error.textContent = 'Hạn mức phải lớn hơn 0 và tối đa 100.000 kW, tối đa 1 chữ số thập phân.';
        error.hidden = false;
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        await csms.stations.createPowerWindow(station.id, {
          startTime: start.value,
          endTime: end.value,
          limitKw: limit.value.trim(),
        });
        toast('Đã thêm khung giờ hạn mức.');
        await reload();
      } catch (requestError) {
        error.textContent = requestError.message;
        error.hidden = false;
        submit.disabled = false;
      }
    },
  },
  h('div', { class: 'form-grid' },
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Bắt đầu'), start),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Kết thúc'), end),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Hạn mức (kW)'), limit)),
  h('div', { class: 'toolbar' }, h('button', { class: 'btn btn--primary', type: 'submit', disabled: baseLimitRequired }, icon('plus'), 'Thêm khung giờ')),
  error);

  async function load() {
    try {
      const windows = await csms.stations.powerWindows(station.id);
      const windowRows = windows.length
        ? windows.map((window) => {
          const remove = h('button', {
            class: 'btn btn--ghost',
            type: 'button',
            'aria-label': `Xoá khung ${window.startTime}–${window.endTime}`,
            onclick: () => {
              const cancel = h('button', { class: 'btn', type: 'button' }, 'Giữ lại');
              const confirm = h('button', { class: 'btn btn--danger', type: 'button' }, 'Xoá khung giờ');
              const modal = openModal({
                title: 'Xoá khung giờ hạn mức?',
                body: h('p', {}, `Khung ${window.startTime}–${window.endTime} sẽ không còn được áp dụng.`),
                footer: [cancel, confirm],
              });
              cancel.addEventListener('click', () => modal.close());
              confirm.addEventListener('click', async () => {
                confirm.disabled = true;
                try {
                  await csms.stations.deletePowerWindow(station.id, window.id);
                  modal.close();
                  toast('Đã xoá khung giờ hạn mức.');
                  await reload();
                } catch (requestError) {
                  modal.close();
                  error.textContent = requestError.message;
                  error.hidden = false;
                }
              });
            },
          }, icon('x'), 'Xoá');
          return h('div', { class: 'list-row' },
            h('div', {}, h('div', { class: 'cell-strong' }, `${window.startTime}–${window.endTime}`),
              h('div', { class: 'cell-sub' }, `${window.limitKw} kW · giờ địa phương của trạm`)),
            remove);
        })
        : [emptyState({ iconName: 'calendar', title: 'Chưa có khung giờ hạn mức' })];
      rows.replaceChildren(...windowRows);
    } catch (requestError) {
      rows.replaceChildren(errorState({
        message: requestError.message,
        onRetry: load,
      }));
    }
  }

  const section = h('section', { class: 'stack' },
    h('div', { class: 'section-title' }, 'Hạn mức theo khung giờ'),
    h('p', { class: 'field__hint' }, `Khung lặp lại hằng ngày theo múi giờ ${station.timezone || 'Asia/Ho_Chi_Minh'}.`),
    baseLimitRequired && h('p', { class: 'field__hint' }, 'Cần khai hạn mức nền trong “Sửa thông tin trạm” trước khi thêm khung giờ.'),
    rows,
    form);
  load();
  return section;
}

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

function lockSection(station, reload) {
  const locked = Boolean(station.locked_at);
  const error = h('p', { class: 'form-alert', role: 'alert', hidden: true });

  async function apply(next, button) {
    button.disabled = true;
    error.hidden = true;
    try {
      await csms.stations.setLock(station.id, next);
      toast(next ? `Đã khoá trạm ${station.name}.` : `Đã mở khoá trạm ${station.name}.`);
      await reload();
    } catch (e) { error.textContent = e.message; error.hidden = false; button.disabled = false; }
  }

  function confirmLock(button) {
    const cancel = h('button', { class: 'btn', type: 'button' }, 'Huỷ');
    const ok = h('button', { class: 'btn btn--primary', type: 'button' }, icon('alert'), 'Khoá trạm');
    const modal = openModal({
      title: `Khoá trạm ${station.name}?`,
      body: h('p', {}, 'Mọi trụ của trạm đang kết nối sẽ bị ngắt, và trụ không thể khởi động lại (Boot) cho tới khi mở khoá.'),
      footer: [cancel, ok],
    });
    cancel.addEventListener('click', () => modal.close());
    ok.addEventListener('click', async () => { ok.disabled = true; modal.close(); await apply(true, button); });
  }

  const button = h('button', { class: 'btn', type: 'button' }, icon(locked ? 'refresh' : 'alert'), locked ? 'Mở khoá trạm' : 'Khoá trạm');
  button.addEventListener('click', () => (locked ? apply(false, button) : confirmLock(button)));
  return h('section', { class: 'stack' },
    h('div', { class: 'section-title' }, 'Khoá trạm (Quản trị)'),
    h('p', { class: 'field__hint' }, locked
      ? `Trạm đang bị khoá từ ${new Date(station.locked_at).toLocaleString('vi-VN')}: trụ không kết nối được.`
      : 'Trạm đang hoạt động bình thường. Khoá trạm sẽ ngắt kết nối các trụ và từ chối Boot.'),
    button, error);
}

function operatingStatusSection(station, canWrite, reload) {
  if (!canWrite) return null;
  const active = station.status === 'ACTIVE';
  const nextStatus = active ? 'MAINTENANCE' : 'ACTIVE';
  const actionLabel = active ? 'Tạm ngừng' : 'Đưa vào hoạt động';
  const error = h('p', { class: 'form-alert', role: 'alert', hidden: true });
  const button = h('button', {
    class: active ? 'btn btn--danger' : 'btn btn--primary',
    type: 'button',
    onclick: async () => {
      button.disabled = true;
      error.hidden = true;
      try {
        await csms.stations.update(station.id, { status: nextStatus });
        toast(active ? 'Trạm đã tạm ngừng.' : 'Trạm đã được đưa vào hoạt động.');
        await reload();
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        button.disabled = false;
      }
    },
  }, icon(active ? 'alert' : 'station'), actionLabel);
  return h('section', { class: 'stack' },
    h('div', { class: 'section-title' }, 'Trạng thái trạm'),
    h('div', {}, stationBadge(station.status)),
    button,
    error);
}

function render(station, { canWrite, canLock, onEdit, reload, onOpenChargePoint }) {
  const points = station.charge_points ?? [];
  return [
    station.power?.oversubscribed && h('div', { class: 'badge badge--warning', role: 'status' }, 'Trạm đang quá đăng ký'),
    h('dl', { class: 'kv' },
      h('dt', {}, 'Địa chỉ'), h('dd', {}, station.address),
      h('dt', {}, 'Hạn mức công suất'), h('dd', {}, station.power?.limitKw === null ? 'Không giới hạn' : formatKw(station.power?.limitKw)),
      h('dt', {}, 'Tổng công suất danh định'), h('dd', {}, formatKw(station.power?.ratedTotalKw ?? 0)),
      h('dt', {}, 'Vĩ độ'), h('dd', {}, coordinate(station.latitude)),
      h('dt', {}, 'Kinh độ'), h('dd', {}, coordinate(station.longitude))),
    operatingStatusSection(station, canWrite, reload),
    powerWindowSection(station, canWrite, reload),
    h('section', {},
      h('div', { class: 'section-title' }, `Trụ sạc (${points.length})`),
      points.length
        ? h('div', { class: 'list-rows' }, points.map((point) => h('div', { class: 'list-row' },
          h('div', { style: 'min-width:0' },
            h('button', { class: 'row-link mono', type: 'button', onclick: () => onOpenChargePoint(point.id) }, point.code),
            h('div', { class: 'chips' }, (point.connectors ?? []).map((c) => h('span', { class: 'badge badge--neutral', title: `Trạng thái gốc: ${c.status}` }, `Đầu ${c.connector_no}: ${c.status}`)))),
          pointStatusBadge(point, pointGroup({ ...point, connector_statuses: (point.connectors ?? []).map((c) => c.status) })))))
        : emptyState({ iconName: 'charger', title: 'Trạm chưa có trụ sạc', text: canWrite ? 'Thêm trụ đầu tiên ở bên dưới.' : undefined })),
    chargePointForm(station, canWrite, reload),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      canWrite && h('button', { class: 'btn', type: 'button', onclick: onEdit }, icon('edit'), 'Sửa thông tin trạm'),
      h('button', {
        class: 'btn',
        type: 'button',
        onclick: () => {
          const ws = location.hash.split('/')[1] || 'owner';
          location.hash = `#/${ws}/tariffs/${station.id}`;
        },
      }, icon('sliders') || 'Biểu giá', 'Biểu giá trạm')
    ),
    canLock && lockSection(station, reload),
  ];
}

// Drawer chi tiết trạm: mở từ bản đồ, danh sách hoặc tìm kiếm mà không rời trang hiện tại.
export function openStationDrawer({ id, canWrite, canLock = false, onChanged, onClose, onOpenChargePoint }) {
  const drawer = openDrawer({ title: 'Chi tiết trạm', body: loadingState(3), onClose });

  async function load() {
    try {
      const station = await csms.stations.get(id);
      drawer.setTitle(station.name, h('div', { style: 'margin-top:6px' }, stationBadge(station.status)));
      drawer.setBody(...render(station, {
        canWrite, canLock,
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
