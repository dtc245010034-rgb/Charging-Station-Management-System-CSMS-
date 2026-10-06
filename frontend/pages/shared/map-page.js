import { h } from '../../app/dom.js';
import { routeFor } from '../../app/workspace.js';
import { createFleet, mapCard } from './fleet.js';
import { openStationDrawer } from './station-drawer.js';

export function render(ctx) {
  const canWrite = ctx.can('stations:write');
  const fleet = createFleet();
  let drawer = null;
  const map = mapCard(fleet, {
    title: 'Bản đồ trạm sạc',
    onSelectStation: (id) => {
      drawer?.close();
      drawer = openStationDrawer({
        id, canWrite, canLock: ctx.can('stations:lock'), onChanged: () => fleet.refresh(), onClose: () => { drawer = null; },
        onOpenChargePoint: (cpId) => { location.hash = routeFor(ctx.workspace, 'charge-points', cpId); },
      });
    },
  });
  map.el.classList.add('map-card--full');
  ctx.root.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { class: 'page-head__title' }, 'Bản đồ'), h('p', { class: 'page-head__sub' }, 'Vị trí và trạng thái các trạm sạc. Bấm vào một trạm để xem chi tiết.'))),
    map.el);
  setTimeout(() => map.invalidate(), 50);
  setTimeout(() => map.invalidate(), 200);
  return () => { map.destroy(); fleet.stop(); drawer?.close(); };
}
