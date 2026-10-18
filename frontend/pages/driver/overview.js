import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { icon } from '../../components/icons.js';
import { emptyState, loadingState } from '../../components/empty-state.js';
import { formatNumber } from '../../app/format.js';
import { routeFor } from '../../app/workspace.js';

// Mobile-first: một cột, nút to, không có bảng rộng.
export function render(ctx) {
  let isUnmounted = false;
  const firstName = ctx.user.name.trim().split(/\s+/).slice(-1)[0];

  const sessionContainer = h('div', {}, loadingState(2));
  const notificationsContainer = h('div', {}, loadingState(1));

  ctx.root.append(
    h('section', {},
      h('p', { class: 'eyebrow' }, 'Tài xế'),
      h('h1', { class: 'page-head__title', style: 'margin-top:4px' }, `Xin chào, ${firstName}!`)
    ),
    h('section', { class: 'card', 'aria-label': 'Phiên sạc' },
      h('div', { class: 'card__body' }, sessionContainer)),
    h('section', { class: 'card', 'aria-label': 'Thông báo mới' },
      h('div', { class: 'card__body', style: 'display:grid;gap:10px' },
        h('h2', { style: 'margin:0;font-size:16px' }, 'Thông báo mới'),
        notificationsContainer,
        h('a', { class: 'btn btn--ghost', href: routeFor('driver', 'notifications') }, 'Xem tất cả thông báo')))
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
  void api('/api/me/notifications?unread=1').then((result) => {
    if (isUnmounted) return;
    if (result.notifications.length === 0) {
      mount(notificationsContainer, h('p', { class: 'muted' }, 'Bạn chưa có thông báo mới.'));
      return;
    }
    mount(notificationsContainer, ...result.notifications.slice(0, 3).map((item) => h('p', {
      style: 'margin:0',
    }, item.kind === 'SESSION_REMOTE_STOPPED'
      ? 'Phiên sạc đã bị dừng từ xa'
      : item.kind === 'IDLE_FEE_STARTED'
        ? 'Phiên sạc bắt đầu tính phí chiếm trụ'
        : 'Phiên sạc đã kết thúc')));
  }).catch((error) => {
    if (!isUnmounted) mount(notificationsContainer, h('p', { class: 'badge badge--fault', role: 'alert' }, `Không thể tải thông báo: ${error.message}`));
  });

  return () => {
    isUnmounted = true;
  };
}
