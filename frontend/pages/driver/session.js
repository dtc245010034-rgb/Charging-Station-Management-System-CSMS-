import { h } from '../../app/dom.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';

/**
 * Màn hình theo dõi phiên sạc thời gian thực cho tài xế (≥ 360px mobile-first)
 * Đáp ứng T-48 và các AC của S-22:
 * - Gọi GET /api/me/sessions/current
 * - 204: Hiện empty state + lối tắt "Tìm trạm" (tạm vô hiệu theo AC3)
 * - 200: Hiển thị trạm, trụ, đầu nối, số kWh đã sạc, công suất kW, thời gian sạc
 * - Kết nối SSE tới /api/me/sessions/events tự động cập nhật số kWh tức thời (≤ 2 giây)
 */
export function render(ctx) {
  let eventSource = null;
  let timerInterval = null;
  let sessionData = null;

  const container = h('div', { class: 'driver-session-container' });
  ctx.root.append(
    h('section', { class: 'page-head' },
      h('p', { class: 'eyebrow' }, 'Phiên sạc'),
      h('h1', { class: 'page-head__title', style: 'margin-top:4px' }, 'Phiên sạc hiện tại')
    ),
    container
  );

  function cleanup() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function formatDuration(startedAt) {
    if (!startedAt) return '00:00:00';
    const diff = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    const hours = String(Math.floor(diff / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const seconds = String(diff % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function renderEmpty() {
    cleanup();
    container.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'card__body' },
          emptyState({
            iconName: 'bolt',
            title: 'Bạn chưa có phiên sạc nào',
            text: 'Hiện tại bạn không có phiên sạc nào đang hoạt động.',
            action: h('button', {
              class: 'btn btn--secondary',
              type: 'button',
              disabled: true,
              title: 'Tính năng tìm trạm sẽ có ở Sprint sau',
            }, icon('station'), 'Tìm trạm (Sắp ra mắt)'),
          })
        )
      )
    );
  }

  function renderActive(session) {
    sessionData = session;
    const reading = session.latest_reading || {};

    const durationEl = h('span', { class: 'driver-stat__value' }, formatDuration(session.started_at));
    const kwhEl = h('span', { class: 'driver-stat__value driver-stat__value--highlight' }, `${(reading.energy_kwh ?? 0).toFixed(2)} kWh`);
    const powerEl = h('span', { class: 'driver-stat__value' }, reading.power_kw !== null && reading.power_kw !== undefined ? `${reading.power_kw.toFixed(1)} kW` : '—');
    const currentEl = h('span', { class: 'driver-stat__value' }, reading.current_a !== null && reading.current_a !== undefined ? `${reading.current_a.toFixed(1)} A` : '—');
    const statusPill = h('span', { class: 'badge badge--ready' }, 'Đang sạc');

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (durationEl && sessionData?.started_at) {
        durationEl.textContent = formatDuration(sessionData.started_at);
      }
    }, 1000);

    const card = h('div', { class: 'card driver-session-card' },
      h('div', { class: 'card__header', style: 'display:flex; justify-content:space-between; align-items:center;' },
        h('div', {},
          h('h2', { class: 'card__title', style: 'margin:0;' }, session.station.name),
          h('p', { class: 'card__subtitle', style: 'margin:4px 0 0 0; color:var(--text-muted);' }, session.station.address)
        ),
        statusPill
      ),
      h('div', { class: 'card__body' },
        h('div', { class: 'driver-session__meta', style: 'margin-bottom:1.5rem; display:flex; gap:1rem; flex-wrap:wrap;' },
          h('div', { class: 'pill' }, icon('charger'), `Trụ: ${session.charge_point.code}`),
          h('div', { class: 'pill' }, icon('bolt'), `Cổng sạc: #${session.connector.connector_no}`)
        ),
        h('div', { class: 'driver-stats-grid', style: 'display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:1rem;' },
          h('div', { class: 'driver-stat-box', style: 'padding:1rem; background:var(--bg-subtle, #f5f5f5); border-radius:8px;' },
            h('span', { class: 'driver-stat__label', style: 'font-size:0.85rem; color:var(--text-muted); display:block;' }, 'Điện năng đã nạp'),
            kwhEl
          ),
          h('div', { class: 'driver-stat-box', style: 'padding:1rem; background:var(--bg-subtle, #f5f5f5); border-radius:8px;' },
            h('span', { class: 'driver-stat__label', style: 'font-size:0.85rem; color:var(--text-muted); display:block;' }, 'Công suất hiện tại'),
            powerEl
          ),
          h('div', { class: 'driver-stat-box', style: 'padding:1rem; background:var(--bg-subtle, #f5f5f5); border-radius:8px;' },
            h('span', { class: 'driver-stat__label', style: 'font-size:0.85rem; color:var(--text-muted); display:block;' }, 'Thời gian sạc'),
            durationEl
          ),
          h('div', { class: 'driver-stat-box', style: 'padding:1rem; background:var(--bg-subtle, #f5f5f5); border-radius:8px;' },
            h('span', { class: 'driver-stat__label', style: 'font-size:0.85rem; color:var(--text-muted); display:block;' }, 'Dòng điện'),
            currentEl
          )
        )
      )
    );

    container.replaceChildren(card);

    // Mở kết nối SSE để cập nhật số kWh thời gian thực
    if (!eventSource) {
      eventSource = new EventSource('/api/me/sessions/events');
      eventSource.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.type === 'METER_VALUE' && String(ev.sessionId) === String(session.id)) {
            if (ev.energy_kwh !== null && ev.energy_kwh !== undefined) {
              kwhEl.textContent = `${Number(ev.energy_kwh).toFixed(2)} kWh`;
            }
            if (ev.power_kw !== null && ev.power_kw !== undefined) {
              powerEl.textContent = `${Number(ev.power_kw).toFixed(1)} kW`;
            }
            if (ev.current_a !== null && ev.current_a !== undefined) {
              currentEl.textContent = `${Number(ev.current_a).toFixed(1)} A`;
            }
          }
        } catch {
          // Bỏ qua tin nhắn không parse được
        }
      };
      eventSource.onerror = () => {
        // EventSource sẽ tự động retry kết nối lại
      };
    }
  }

  async function loadCurrentSession() {
    cleanup();
    container.replaceChildren(loadingState(3));
    try {
      const res = await fetch('/api/me/sessions/current', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (res.status === 204) {
        renderEmpty();
        return;
      }
      if (!res.ok) {
        throw new Error(`Lỗi tải phiên sạc (HTTP ${res.status})`);
      }
      const data = await res.json();
      renderActive(data);
    } catch (err) {
      cleanup();
      container.replaceChildren(
        errorState({
          message: err.message || 'Không thể tải thông tin phiên sạc.',
          onRetry: loadCurrentSession,
        })
      );
    }
  }

  loadCurrentSession();
  return cleanup;
}
