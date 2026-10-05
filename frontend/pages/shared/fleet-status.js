import { h } from '../../app/dom.js';
import { formatDateTime } from '../../app/format.js';
import { WORKSPACES } from '../../app/workspace.js';
import { fleetPointLabel } from '../../app/status.js';
import { statusBadge, stationBadge, stationLevelErrorBadge } from '../../components/badge.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { openModal } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { workspaceHero } from '../../components/hero.js';
import * as csms from '../../services/csms.js';
import { subscribe } from '../../services/realtime.js';

function chargePointBadge(point) {
  const { label, tone } = fleetPointLabel(point);
  return h('span', { class: `badge badge--${tone}` },
    h('span', { class: `dot dot--${tone}`, 'aria-hidden': 'true' }), label);
}

function openResetDialog(point, onRequested) {
  const formId = `reset-form-${point.id}-${Math.random().toString(36).slice(2, 8)}`;
  const type = h('select', { class: 'select', id: 'reset-type', name: 'type', required: true },
    h('option', { value: 'Soft' }, 'Mềm (Soft)'),
    h('option', { value: 'Hard' }, 'Cứng (Hard)'));
  const cancel = h('button', { class: 'btn', type: 'button' }, 'Hủy');
  const submit = h('button', { class: 'btn btn--primary', type: 'submit', form: formId }, 'Khởi động lại');
  let modal;
  const form = h('form', { id: formId, class: 'stack', onsubmit: async (event) => {
    event.preventDefault();
    submit.disabled = true;
    cancel.disabled = true;
    try {
      const result = await csms.chargePoints.reset(point.id, type.value);
      modal.close();
      toast(result.status === 'Accepted'
        ? `Đã gửi lệnh khởi động lại trụ ${point.code}.`
        : `Trụ ${point.code} đã nhận lệnh khởi động lại.`);
      onRequested();
    } catch (error) {
      toast(error.message, { kind: 'error' });
      submit.disabled = false;
      cancel.disabled = false;
    }
  } },
  h('p', {}, `Chọn kiểu khởi động lại trụ ${point.code}. Nếu trụ ngoại tuyến, hệ thống sẽ báo lỗi ngay.`),
  h('label', { class: 'field', for: 'reset-type' },
    h('span', { class: 'field__label' }, 'Kiểu khởi động lại'), type));
  modal = openModal({
    title: `Khởi động lại ${point.code}`,
    body: form,
    footer: [
      cancel,
      submit,
    ],
  });
  cancel.addEventListener('click', () => modal.close());
}

function chargePointCard(point, station, { canReset, onReset } = {}) {
  return h('article', { class: 'fleet-status__point' },
    h('div', { class: 'fleet-status__station-line' },
      h('p', { class: 'fleet-status__station-name' }, station.name),
      stationBadge(station.status)),
    h('header', { class: 'fleet-status__point-head' },
      h('h3', { class: 'fleet-status__code mono' }, point.code),
      chargePointBadge(point)),
    stationLevelErrorBadge(point),
    point.offline && h('p', { class: 'fleet-status__last-seen' },
      h('strong', {}, 'Liên lạc cuối: '),
      point.last_seen_at ? formatDateTime(point.last_seen_at) : 'Chưa từng liên lạc'),
    point.connectors.length
      ? h('ul', { class: 'fleet-status__connectors', 'aria-label': `Đầu nối của trụ ${point.code}` },
        point.connectors.map((connector) => h('li', { class: 'fleet-status__connector' },
          h('span', {}, `Đ${connector.connector_no}`),
          statusBadge(connector.status, connector.ocpp_status))))
      : h('p', { class: 'field__hint' }, 'Chưa có đầu nối'),
    canReset && h('div', { class: 'fleet-status__point-actions' },
      h('button', {
        class: 'btn',
        type: 'button',
        onclick: () => openResetDialog(point, () => onReset(point)),
      }, icon('refresh'), 'Khởi động lại')));
}

export function render(ctx) {
  const canReset = ctx.can('charge-points:reset');
  const hero = workspaceHero({
    user: ctx.user,
    roleLabel: WORKSPACES[ctx.workspace].role,
    subtitle: 'Theo dõi trạng thái các trạm, trụ sạc và đầu nối.',
  });
  const count = h('p', { class: 'fleet-status__count', 'aria-live': 'polite' }, 'Đang tải trạng thái…');
  const errorNotice = h('p', { class: 'form-alert', role: 'alert', hidden: true });
  const refreshButton = h('button', { class: 'btn', type: 'button' }, icon('refresh'), 'Làm mới');
  const toolbar = h('div', { class: 'fleet-status__toolbar' }, count, refreshButton);
  const body = h('div', { class: 'fleet-status__body' }, loadingState());
  let snapshot = null;
  let loadError = null;
  let realtime;

  function paint() {
    errorNotice.hidden = !loadError;
    errorNotice.textContent = loadError ?? '';
    if (!snapshot) {
      body.replaceChildren(loadError
        ? errorState({ message: loadError, onRetry: () => realtime.refresh() })
        : loadingState());
      return;
    }

    const stations = snapshot.stations;
    const points = stations.flatMap((station) => station.charge_points);
    count.textContent = `${points.length} trụ · ${stations.length} trạm`;
    body.replaceChildren(points.length
      ? h('div', { class: 'fleet-status__grid' }, stations.flatMap((station) =>
        station.charge_points.map((point) => chargePointCard(point, station, {
          canReset,
          onReset: () => realtime.refresh(),
        }))))
      : emptyState({ iconName: 'charger', title: 'Chưa có trụ sạc', text: 'Các trụ thuộc phạm vi của bạn sẽ xuất hiện tại đây.' }));
  }

  refreshButton.addEventListener('click', () => realtime.refresh());
  realtime = subscribe(
    () => csms.fleetStatus.snapshot(),
    (data) => { snapshot = data; loadError = null; paint(); },
    { eventsUrl: '/api/fleet-status/events', onError: (error) => { loadError = error.message; paint(); } },
  );

  ctx.root.append(hero.el, toolbar, errorNotice, body);
  return () => { realtime.stop(); hero.destroy(); };
}
