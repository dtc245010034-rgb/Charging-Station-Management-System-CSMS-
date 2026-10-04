import { h } from '../../app/dom.js';
import { routeFor } from '../../app/workspace.js';
import { workspaceHero } from '../../components/hero.js';
import { createFleet, kpiRow, mapCard, placeholderCard, statusCard } from '../shared/fleet.js';
import { openStationDrawer } from '../shared/station-drawer.js';

// Operator Operations Center (khung đã duyệt: docs/design). Mọi con số lấy từ API;
// những khối chưa có nguồn dữ liệu (cảnh báo, hiệu suất, phiên sạc) hiện trạng thái rỗng, không dựng số giả.
export function render(ctx) {
  const fleet = createFleet();
  let drawer = null;

  const hero = workspaceHero({
    user: ctx.user, roleLabel: 'OPERATOR',
    subtitle: 'Theo dõi và xử lý các sự kiện trạm sạc theo thời gian thực.',
  });
  const kpis = kpiRow(fleet);
  const map = mapCard(fleet, {
    onSelectStation: (id) => {
      drawer?.close();
      drawer = openStationDrawer({
        id, canWrite: false, onClose: () => { drawer = null; },
        onOpenChargePoint: (cpId) => { location.hash = routeFor(ctx.workspace, 'charge-points', cpId); },
      });
    },
  });
  const status = statusCard(fleet, { onSelectGroup: (group) => { location.hash = `${routeFor(ctx.workspace, 'charge-points')}?status=${group}`; } });

  ctx.root.append(
    hero.el, kpis.el,
    h('div', { class: 'dash-main' }, map.el,
      placeholderCard({
        id: 'alerts-title', title: 'Cảnh báo & sự kiện', iconName: 'bell', headline: 'Chưa có sự kiện nào',
        text: 'Lỗi kết nối, phiên treo và khôi phục kết nối sẽ hiện ở đây khi trụ sạc kết nối qua OCPP.',
      })),
    h('div', { class: 'dash-bottom' },
      placeholderCard({
        id: 'perf-title', title: 'Hiệu suất hoạt động', iconName: 'activity', headline: 'Chưa có phiên sạc',
        text: 'Biểu đồ số phiên và sản lượng kWh (24 giờ / 7 ngày / 30 ngày) xuất hiện khi hệ thống ghi nhận phiên sạc.',
      }),
      status.el,
      placeholderCard({
        id: 'sessions-title', title: 'Phiên sạc gần đây', iconName: 'bolt', headline: 'Chưa có phiên sạc',
        text: 'Mã phiên, trạm, kWh, chi phí và trạng thái sẽ hiện ở đây.',
      })));
  setTimeout(() => map.invalidate(), 50);
  return () => { hero.destroy(); kpis.destroy(); status.destroy(); map.destroy(); fleet.stop(); drawer?.close(); };
}
