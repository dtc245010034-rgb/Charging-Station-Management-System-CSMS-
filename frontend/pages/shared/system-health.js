import { h, mount } from '../../app/dom.js';
import { formatNumber } from '../../app/format.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';

const REFRESH_INTERVAL_MS = 30_000;

export function render(ctx) {
  const content = h('div', { class: 'card__body' }, loadingState(4));
  ctx.root.replaceChildren(
    h('div', { class: 'page-stack' },
      h('header', { class: 'page-head' }, h('div', {},
        h('p', { class: 'eyebrow' }, 'Giám sát'),
        h('h1', { class: 'page-head__title' }, 'Sức khoẻ hệ thống')
      )),
      h('section', { class: 'card', 'aria-label': 'Chỉ số sức khoẻ hệ thống' }, content)
    )
  );

  let refreshing = false;
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const health = await api('/api/health/dashboard');
      const metrics = h('div', { class: 'grid grid--3' },
        metric('Trụ đang trực tuyến', health.onlineChargePoints),
        metric('Phiên đang sạc', health.activeSessions),
        metric('Cảnh báo trong 24 giờ', health.recentErrorsCount)
      );
      const errors = health.recentErrors.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ['Thời gian', 'Mức độ', 'Trạm', 'Trụ', 'Thông tin'].map((label) => h('th', { scope: 'col' }, label)))),
          h('tbody', {}, health.recentErrors.map((alert) => h('tr', {},
            h('td', {}, new Date(alert.openedAt).toLocaleString('vi-VN')),
            h('td', {}, alert.severity),
            h('td', {}, alert.stationName),
            h('td', {}, alert.chargePointCode || '—'),
            h('td', {}, alert.message)
          )))
        ))
        : emptyState({ iconName: 'check', title: 'Không có cảnh báo trong 24 giờ gần nhất' });
      mount(content, metrics, h('h2', { class: 'card__title' }, 'Cảnh báo gần đây'), errors);
    } catch (error) {
      mount(content, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
    } finally {
      refreshing = false;
    }
  }

  function metric(label, value) {
    return h('article', { class: 'card' }, h('div', { class: 'card__body' },
      h('div', { class: 'muted' }, label),
      h('strong', { class: 'cell-strong' }, formatNumber(value))
    ));
  }

  void refresh();
  const timer = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
  return () => clearInterval(timer);
}
