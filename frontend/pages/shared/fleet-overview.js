import { h } from '../../app/dom.js';
import { routeFor, WORKSPACES } from '../../app/workspace.js';
import { workspaceHero } from '../../components/hero.js';
import { icon } from '../../components/icons.js';
import { createFleet, kpiRow, mapCard, statusCard } from './fleet.js';
import { openStationDrawer } from './station-drawer.js';

// Tổng quan cho Chủ trạm và Quản trị: chỉ số, bản đồ và trạng thái trụ trong phạm vi quyền của họ.
export function render(ctx) {
  const canWrite = ctx.can('stations:write');
  const fleet = createFleet();
  let drawer = null;
  const isOwner = ctx.role === 'STATION_OWNER';

  const hero = workspaceHero({
    user: ctx.user,
    roleLabel: WORKSPACES[ctx.workspace].role,
    subtitle: isOwner ? 'Theo dõi các trạm và trụ sạc của bạn.' : 'Theo dõi toàn bộ trạm, trụ sạc và tài khoản trong hệ thống.',
  });
  const kpis = kpiRow(fleet);
  const status = statusCard(fleet, { onSelectGroup: (group) => { location.hash = `${routeFor(ctx.workspace, 'charge-points')}?status=${group}`; } });
  const map = mapCard(fleet, {
    onSelectStation: (id) => {
      drawer?.close();
      drawer = openStationDrawer({
        id, canWrite, onChanged: () => fleet.refresh(), onClose: () => { drawer = null; },
        onOpenChargePoint: (cpId) => { location.hash = routeFor(ctx.workspace, 'charge-points', cpId); },
      });
    },
  });

  ctx.root.append(
    hero.el, kpis.el,
    h('div', { class: 'dash-main dash-main--fill' }, map.el,
      h('div', { class: 'stack' }, status.el,
        canWrite && h('a', { class: 'btn btn--primary', href: routeFor(ctx.workspace, 'stations') }, icon('station'), 'Quản lý trạm và trụ sạc'))));
  setTimeout(() => map.invalidate(), 50);
  setTimeout(() => map.invalidate(), 200);
  return () => { hero.destroy(); kpis.destroy(); status.destroy(); map.destroy(); fleet.stop(); drawer?.close(); };
}
