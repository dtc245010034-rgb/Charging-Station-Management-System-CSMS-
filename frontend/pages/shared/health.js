import { h, mount } from '../../app/dom.js';
import { formatNumber } from '../../app/format.js';
import { healthOverview } from '../../services/csms.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';

function metric(label, value) {
  return h('article', { class: 'card' }, h('div', { class: 'card__body' },
    h('div', { class: 'muted' }, label),
    h('strong', { class: 'cell-strong' }, value)
  ));
}

function averageLatency(point) {
  if (!point.ocpp_calls) return '—';
  return `${formatNumber(Math.round(point.latency_sum_ms / point.ocpp_calls))} ms`;
}

export function render(ctx) {
  const content = h('div', { class: 'card__body' }, loadingState(5));
  ctx.root.replaceChildren(
    h('div', { class: 'page-stack' },
      h('header', { class: 'page-head' }, h('div', {},
        h('p', { class: 'eyebrow' }, 'Giám sát'),
        h('h1', { class: 'page-head__title' }, 'Sức khỏe hệ thống')
      )),
      h('section', { class: 'card', 'aria-label': 'Chỉ số sức khỏe hệ thống' }, content)
    )
  );
  void refresh();

  async function refresh() {
    mount(content, loadingState(5));
    try {
      const { points } = await healthOverview();
      if (!points.length) {
        mount(content, emptyState({ iconName: 'activity', title: 'Chưa có dữ liệu sức khỏe hệ thống' }));
        return;
      }

      const latest = points.at(-1);
      const rows = points.slice(-12).reverse().map((point) => h('tr', {},
        h('td', {}, new Date(point.at).toLocaleString('vi-VN')),
        h('td', {}, formatNumber(point.ocpp_calls)),
        h('td', {}, formatNumber(point.ocpp_errors)),
        h('td', {}, averageLatency(point)),
        h('td', {}, `${formatNumber(point.cps_online)} / ${formatNumber(point.cps_total)}`),
        h('td', {}, formatNumber(point.sessions_active))
      ));
      mount(content,
        h('section', { class: 'grid grid--4', 'aria-label': 'Chỉ số mới nhất' },
          metric('Trụ đang trực tuyến', `${formatNumber(latest.cps_online)} / ${formatNumber(latest.cps_total)}`),
          metric('Phiên đang sạc', formatNumber(latest.sessions_active)),
          metric('Lỗi OCPP trong 5 phút', formatNumber(latest.ocpp_errors)),
          metric('Độ trễ OCPP trung bình', averageLatency(latest))
        ),
        h('h2', { class: 'section-title' }, '12 khoảng gần nhất (mỗi khoảng 5 phút)'),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', {}, h('tr', {},
              ['Thời điểm', 'Lượt gọi OCPP', 'Lỗi OCPP', 'Độ trễ TB', 'Trụ trực tuyến', 'Phiên đang sạc'].map((label) => h('th', { scope: 'col' }, label))
            )),
            h('tbody', {}, rows)
          )
        )
      );
    } catch (error) {
      mount(content, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
    }
  }
}
