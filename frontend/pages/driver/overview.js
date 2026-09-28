import { h } from '../../app/dom.js';
import { emptyState } from '../../components/empty-state.js';

// Mobile-first: một cột, nút to, không có bảng rộng.
export function render(ctx) {
  const firstName = ctx.user.name.trim().split(/\s+/).slice(-1)[0];
  ctx.root.append(
    h('section', {}, h('p', { class: 'eyebrow' }, 'Tài xế'), h('h1', { class: 'page-head__title', style: 'margin-top:4px' }, `Xin chào, ${firstName}!`)),
    h('section', { class: 'card', 'aria-label': 'Phiên sạc' },
      h('div', { class: 'card__body' }, emptyState({
        iconName: 'bolt', title: 'Bạn chưa có phiên sạc nào',
        text: 'Tìm trạm, bắt đầu sạc và theo dõi phiên sạc sẽ có ở đây khi tính năng này được mở.',
      }))));
}
