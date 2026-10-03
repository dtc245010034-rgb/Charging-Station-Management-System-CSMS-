import { h } from '../../app/dom.js';
import { formatDateTime } from '../../app/format.js';
import { WORKSPACES } from '../../app/workspace.js';
import { statusBadge, stationBadge } from '../../components/badge.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { workspaceHero } from '../../components/hero.js';
import * as csms from '../../services/csms.js';
import { subscribe } from '../../services/realtime.js';

function chargePointBadge(point) {
  const online = !point.offline && point.status === 'ONLINE';
  const label = point.offline ? 'Ngoại tuyến' : online ? 'Trực tuyến' : 'Chưa rõ';
  const tone = online ? 'ready' : 'offline';
  return h('span', { class: `badge badge--${tone}` },
    h('span', { class: `dot dot--${tone}`, 'aria-hidden': 'true' }), label);
}

function chargePointCard(point, station) {
  return h('article', { class: 'fleet-status__point' },
    h('div', { class: 'fleet-status__station-line' },
      h('p', { class: 'fleet-status__station-name' }, station.name),
      stationBadge(station.status)),
    h('header', { class: 'fleet-status__point-head' },
      h('h3', { class: 'fleet-status__code mono' }, point.code),
      chargePointBadge(point)),
    point.offline && h('p', { class: 'fleet-status__last-seen' },
      h('strong', {}, 'Liên lạc cuối: '),
      point.last_seen_at ? formatDateTime(point.last_seen_at) : 'Chưa từng liên lạc'),
    point.connectors.length
      ? h('ul', { class: 'fleet-status__connectors', 'aria-label': `Đầu nối của trụ ${point.code}` },
        point.connectors.map((connector) => h('li', { class: 'fleet-status__connector' },
          h('span', {}, `Đ${connector.connector_no}`),
          statusBadge(connector.status, connector.ocpp_status))))
      : h('p', { class: 'field__hint' }, 'Chưa có đầu nối'));
}

export function render(ctx) {
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
        station.charge_points.map((point) => chargePointCard(point, station))))
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
