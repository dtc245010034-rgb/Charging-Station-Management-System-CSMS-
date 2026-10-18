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

function powerWindowsSection(station, canWrite, reload) {
  if (!canWrite) return null;
  const container = h('section', { class: 'stack' });
  const title = h('div', { class: 'section-title' }, 'Hạn mức theo giờ');
  const errorEl = h('p', { class: 'form-alert', role: 'alert', hidden: true });

  if (station.power?.limitKw === null || station.power?.limitKw === undefined) {
    container.append(
      title,
      h('p', { class: 'field__hint' }, 'Cần khai báo hạn mức nền của trạm trước khi cài đặt hạn mức theo giờ.')
    );
    return container;
  }

  const listEl = h('div', { class: 'stack' });

  async function refreshWindows() {
    errorEl.hidden = true;
    try {
      const windows = await csms.stations.powerWindows.list(station.id);
      listEl.replaceChildren();
      if (!windows.length) {
        listEl.append(h('p', { class: 'field__hint' }, 'Chưa có khung giờ nào được thiết lập.'));
        return;
      }
      for (const w of windows) {
        const delBtn = h('button', {
          class: 'btn btn--sm btn--danger',
          type: 'button',
          onclick: async () => {
            delBtn.disabled = true;
            try {
              await csms.stations.powerWindows.delete(station.id, w.id);
              toast('Đã xoá khung giờ.');
              await refreshWindows();
              await reload();
            } catch (err) {
              errorEl.textContent = err.message;
              errorEl.hidden = false;
              delBtn.disabled = false;
            }
          },
        }, 'Xoá');

        const row = h('div', {
          class: 'list-row',
          style: 'display:flex;justify-content:space-between;align-items:center',
        },
          h('span', {}, `${w.startTime} – ${w.endTime}: ${formatKw(w.limitKw)}`),
          delBtn
        );
        listEl.append(row);
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  }

  const startInput = h('input', { class: 'input', type: 'time', required: true, style: 'width:120px' });
  const endInput = h('input', { class: 'input', type: 'time', required: true, style: 'width:120px' });
  const kwInput = h('input', { class: 'input', type: 'number', step: '0.1', min: '0.1', max: '100000', placeholder: 'kW', required: true, style: 'width:100px' });

  const addBtn = h('button', { class: 'btn btn--primary', type: 'button' }, 'Thêm khung');
  const overnightBtn = h('button', { class: 'btn', type: 'button' }, 'Qua nửa đêm');

  addBtn.onclick = async () => {
    errorEl.hidden = true;
    const startTime = startInput.value.trim();
    const endTime = endInput.value.trim();
    const limitKw = Number(kwInput.value);
    if (!startTime || !endTime) {
      errorEl.textContent = 'Vui lòng nhập giờ bắt đầu và kết thúc';
      errorEl.hidden = false;
      return;
    }
    if (!limitKw || limitKw <= 0) {
      errorEl.textContent = 'Hạn mức công suất (kW) phải lớn hơn 0';
      errorEl.hidden = false;
      return;
    }
    addBtn.disabled = true;
    try {
      await csms.stations.powerWindows.create(station.id, { startTime, endTime, limitKw });
      toast('Đã thêm khung giờ.');
      startInput.value = '';
      endInput.value = '';
      kwInput.value = '';
      await refreshWindows();
      await reload();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      addBtn.disabled = false;
    }
  };

  overnightBtn.onclick = async () => {
    errorEl.hidden = true;
    const startTime = startInput.value.trim();
    const endTime = endInput.value.trim();
    const limitKw = Number(kwInput.value);
    if (!startTime || !endTime) {
      errorEl.textContent = 'Vui lòng nhập giờ bắt đầu và kết thúc';
      errorEl.hidden = false;
      return;
    }
    if (!limitKw || limitKw <= 0) {
      errorEl.textContent = 'Hạn mức công suất (kW) phải lớn hơn 0';
      errorEl.hidden = false;
      return;
    }
    overnightBtn.disabled = true;
    try {
      await csms.stations.powerWindows.create(station.id, { startTime, endTime: '24:00', limitKw });
      await csms.stations.powerWindows.create(station.id, { startTime: '00:00', endTime, limitKw });
      toast('Đã tạo 2 khung giờ qua nửa đêm.');
      startInput.value = '';
      endInput.value = '';
      kwInput.value = '';
      await refreshWindows();
      await reload();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      overnightBtn.disabled = false;
    }
  };

  const formEl = h('div', { class: 'stack', style: 'margin-top:8px' },
    h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
      h('label', { style: 'display:flex;flex-direction:column;font-size:12px' }, 'Bắt đầu', startInput),
      h('label', { style: 'display:flex;flex-direction:column;font-size:12px' }, 'Kết thúc', endInput),
      h('label', { style: 'display:flex;flex-direction:column;font-size:12px' }, 'Công suất (kW)', kwInput),
    ),
    h('div', { style: 'display:flex;gap:8px;margin-top:4px' }, addBtn, overnightBtn)
  );

  container.append(title, listEl, formEl, errorEl);
  void refreshWindows();
  return container;
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
    powerWindowsSection(station, canWrite, reload),
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
