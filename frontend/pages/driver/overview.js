import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { icon } from '../../components/icons.js';
import { emptyState, loadingState } from '../../components/empty-state.js';
import { formatNumber } from '../../app/format.js';

// Mobile-first: một cột, nút to, không có bảng rộng.
export function render(ctx) {
  let isUnmounted = false;
  const firstName = ctx.user.name.trim().split(/\s+/).slice(-1)[0];

  const sessionContainer = h('div', {}, loadingState(2));

  ctx.root.append(
    h('section', {},
      h('p', { class: 'eyebrow' }, 'Tài xế'),
      h('h1', { class: 'page-head__title', style: 'margin-top:4px' }, `Xin chào, ${firstName}!`)
    ),
    h('section', { class: 'card', 'aria-label': 'Phiên sạc' },
      h('div', { class: 'card__body' }, sessionContainer)
    )
  );

  async function checkSession() {
    try {
      const session = await api('/api/me/sessions/current');
      if (isUnmounted) return;

      if (session) {
        mount(sessionContainer,
          h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px' },
            h('span', { class: 'badge badge--charging' },
              h('span', { class: 'dot dot--charging' }),
              'ĐANG SẠC'
            ),
            h('span', { class: 'muted', style: 'font-size:12px' }, session.station_name || '')
          ),
          h('div', { style: 'display:flex;align-items:baseline;gap:6px;margin-bottom:8px' },
            h('span', { style: 'font-size:28px;font-weight:800;color:var(--brand-primary)' },
              formatNumber(session.current_kwh || 0)
            ),
            h('span', { style: 'font-weight:600;color:var(--text-secondary)' }, 'kWh')
          ),
          h('p', { class: 'muted', style: 'font-size:13px;margin-bottom:14px' },
            `Trụ ${session.charge_point_code} · Cổng ${session.connector_no}`
          ),
          h('a', {
            class: 'btn btn--primary btn--block',
            href: '#/driver/sessions',
          }, icon('bolt'), 'Theo dõi phiên sạc trực tiếp')
        );
      } else {
        mount(sessionContainer, emptyState({
          iconName: 'bolt',
          title: 'Bạn chưa có phiên sạc nào',
          text: 'Hiện không có phiên sạc nào đang chạy. Bạn có thể kiểm tra trang Phiên sạc để xem chi tiết.',
          action: h('a', {
            class: 'btn',
            href: '#/driver/sessions',
            style: 'margin-top:10px',
          }, icon('bolt'), 'Trang phiên sạc'),
        }));
      }
    } catch {
      if (isUnmounted) return;
      mount(sessionContainer, emptyState({
        iconName: 'bolt',
        title: 'Bạn chưa có phiên sạc nào',
        text: 'Kiểm tra trạng thái phiên sạc trên xe hoặc bắt đầu phiên sạc mới.',
      }));
    }
  }

  checkSession();

  return () => {
    isUnmounted = true;
  };
}
