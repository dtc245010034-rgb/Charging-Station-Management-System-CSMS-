import { h } from '../../app/dom.js';
import { workspaceHero } from '../../components/hero.js';
import { emptyState } from '../../components/empty-state.js';

export function render(ctx) {
  const hero = workspaceHero({ user: ctx.user, roleLabel: 'ACCOUNTANT', subtitle: 'Đối soát doanh thu với sản lượng điện đã cấp.' });
  ctx.root.append(
    hero.el,
    h('section', { class: 'card', 'aria-label': 'Đối soát' },
      h('div', { class: 'card__body' }, emptyState({
        iconName: 'activity', title: 'Chưa có dữ liệu để đối soát',
        text: 'Doanh thu, sản lượng kWh và kỳ đối soát xuất hiện khi hệ thống có phiên sạc đã tính tiền.',
      }))));
  return hero.destroy;
}
