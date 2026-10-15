import { h } from '../app/dom.js';
import { api } from '../services/api.js';
import { icon } from './icons.js';

export function createNotificationBell() {
  let disposed = false;
  const count = h('span', {
    class: 'badge badge--danger',
    style: 'position:absolute;top:-5px;right:-5px;min-width:18px;padding:2px 5px;font-size:11px',
    hidden: true,
  });
  const button = h('button', {
    class: 'btn btn--ghost btn--icon',
    type: 'button',
    'aria-label': 'Thông báo',
    style: 'position:relative',
    onclick: () => { location.hash = '#/driver/notifications'; },
  }, icon('bell'), count);

  async function refresh() {
    try {
      const result = await api('/api/me/notifications?unread=1');
      if (disposed) return;
      count.textContent = result.unreadCount > 99 ? '99+' : String(result.unreadCount);
      count.hidden = result.unreadCount === 0;
      button.setAttribute('aria-label', result.unreadCount
        ? `Thông báo chưa đọc: ${result.unreadCount}`
        : 'Thông báo');
    } catch (error) {
      if (!disposed) {
        button.setAttribute('aria-label', 'Không tải được thông báo');
        console.warn('[Notifications] Không thể tải số thông báo chưa đọc:', error.message);
      }
    }
  }

  void refresh();
  const timer = setInterval(() => { void refresh(); }, 30_000);
  return {
    el: button,
    destroy() {
      disposed = true;
      clearInterval(timer);
    },
  };
}
