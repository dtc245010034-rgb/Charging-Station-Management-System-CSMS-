import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { icon } from '../../components/icons.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { formatNumber, formatDateTime } from '../../app/format.js';

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function render(ctx) {
  let session = null;
  let eventSource = null;
  let durationTimer = null;
  let isUnmounted = false;

  const container = h('div', { class: 'page-stack', style: 'max-width:540px;margin:0 auto;display:flex;flex-direction:column;gap:16px;' });
  ctx.root.append(container);

  function renderEmpty() {
    mount(container,
      h('section', {},
        h('p', { class: 'eyebrow' }, 'Tài xế'),
        h('h1', { class: 'page-head__title', style: 'margin-top:4px' }, 'Phiên sạc')
      ),
      h('section', { class: 'card', 'aria-label': 'Không có phiên sạc' },
        h('div', { class: 'card__body' }, emptyState({
          iconName: 'bolt',
          title: 'Không có phiên sạc nào đang diễn ra',
          text: 'Xe của bạn hiện chưa cắm sạc hoặc phiên sạc gần nhất đã kết thúc.',
          action: h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:12px' },
            h('a', {
              class: 'btn btn--primary',
              href: '#/driver/find',
              'aria-disabled': 'true',
              style: 'pointer-events:none;opacity:0.6',
              title: 'Tính năng Tìm trạm đang được phát triển (S-47)',
            }, icon('station'), 'Tìm trạm'),
            h('small', { class: 'muted', style: 'font-size:12px' }, '(Tính năng Tìm trạm sẽ mở ở Sprint sau - S-47)')
          ),
        }))
      )
    );
  }

  function renderSessionView(data) {
    session = data;

    const startedMs = session.started_at ? Date.parse(session.started_at) : Date.now();
    const initialElapsed = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));

    const kwhValueEl = h('span', { class: 'session-kwh-value', style: 'font-size:42px;font-weight:800;letter-spacing:-0.03em;color:var(--brand-primary);line-height:1' },
      session.current_kwh !== null && session.current_kwh !== undefined ? formatNumber(session.current_kwh) : '0'
    );
    const durationEl = h('span', { class: 'session-duration-value', style: 'font-size:20px;font-weight:700;font-variant-numeric:tabular-nums' },
      formatDuration(initialElapsed)
    );
    const powerEl = h('span', { class: 'session-power-value', style: 'font-size:20px;font-weight:700;font-variant-numeric:tabular-nums' },
      session.latest_power_w !== null && session.latest_power_w !== undefined ? `${formatNumber(Math.round(session.latest_power_w / 1000))} kW` : '—'
    );
    const currentEl = h('span', { class: 'session-current-value', style: 'font-size:20px;font-weight:700;font-variant-numeric:tabular-nums' },
      session.latest_current_a !== null && session.latest_current_a !== undefined ? `${formatNumber(session.latest_current_a)} A` : '—'
    );
    const socEl = h('span', { class: 'session-soc-value', style: 'font-size:20px;font-weight:700;font-variant-numeric:tabular-nums' },
      session.latest_soc !== null && session.latest_soc !== undefined ? `${formatNumber(session.latest_soc)} %` : '—'
    );

    // Cập nhật đồng hồ thời gian sạc mỗi giây
    if (durationTimer) clearInterval(durationTimer);
    durationTimer = setInterval(() => {
      if (isUnmounted) return;
      const elapsed = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
      durationEl.textContent = formatDuration(elapsed);
    }, 1000);

    mount(container,
      h('section', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap' },
        h('div', {},
          h('p', { class: 'eyebrow' }, 'Tài xế'),
          h('h1', { class: 'page-head__title', style: 'margin-top:4px' }, 'Phiên sạc trực tiếp')
        ),
        h('span', { class: 'badge badge--charging', 'aria-live': 'polite' },
          h('span', { class: 'dot dot--charging' }),
          'ĐANG SẠC'
        )
      ),

      // Thẻ chính: Năng lượng đã sạc
      h('section', { class: 'card', style: 'text-align:center;padding:24px 16px;background:var(--surface-elevated);border-color:color-mix(in srgb, var(--brand-primary) 30%, transparent)' },
        h('p', { class: 'muted', style: 'font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px' }, 'Điện năng đã nạp'),
        h('div', { style: 'display:flex;align-items:baseline;justify-content:center;gap:6px' },
          kwhValueEl,
          h('span', { style: 'font-size:20px;font-weight:700;color:var(--text-secondary)' }, 'kWh')
        ),
        h('p', { class: 'muted', style: 'font-size:12px;margin-top:6px' }, `Số đo khởi đầu: ${formatNumber(session.meter_start)} Wh`)
      ),

      // Lưới thông số (2 cột trên màn hình >= 360px)
      h('section', { style: 'display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px' },
        h('div', { class: 'card', style: 'padding:14px' },
          h('span', { class: 'muted', style: 'font-size:12px;font-weight:600' }, 'Thời gian sạc'),
          h('div', { style: 'margin-top:4px' }, durationEl)
        ),
        h('div', { class: 'card', style: 'padding:14px' },
          h('span', { class: 'muted', style: 'font-size:12px;font-weight:600' }, 'Công suất'),
          h('div', { style: 'margin-top:4px' }, powerEl)
        ),
        h('div', { class: 'card', style: 'padding:14px' },
          h('span', { class: 'muted', style: 'font-size:12px;font-weight:600' }, 'Dòng điện'),
          h('div', { style: 'margin-top:4px' }, currentEl)
        ),
        h('div', { class: 'card', style: 'padding:14px' },
          h('span', { class: 'muted', style: 'font-size:12px;font-weight:600' }, 'Pin xe (SoC)'),
          h('div', { style: 'margin-top:4px' }, socEl)
        )
      ),

      // Thẻ thông tin địa điểm và trạm sạc
      h('section', { class: 'card' },
        h('div', { class: 'card__head' },
          h('h2', { class: 'card__title' }, 'Thông tin trạm & thiết bị')
        ),
        h('div', { class: 'card__body', style: 'display:grid;gap:10px;font-size:13.5px' },
          h('div', { style: 'display:flex;justify-content:space-between;gap:8px' },
            h('span', { class: 'muted' }, 'Trạm sạc'),
            h('span', { style: 'font-weight:600;text-align:right' }, session.station_name || '—')
          ),
          h('div', { style: 'display:flex;justify-content:space-between;gap:8px' },
            h('span', { class: 'muted' }, 'Địa chỉ'),
            h('span', { style: 'text-align:right' }, session.station_address || '—')
          ),
          h('div', { style: 'display:flex;justify-content:space-between;gap:8px' },
            h('span', { class: 'muted' }, 'Trụ & Cổng'),
            h('span', { style: 'font-weight:600;text-align:right' }, `${session.charge_point_code} · Cổng ${session.connector_no}`)
          ),
          h('div', { style: 'display:flex;justify-content:space-between;gap:8px' },
            h('span', { class: 'muted' }, 'Bắt đầu lúc'),
            h('span', { style: 'text-align:right' }, formatDateTime(session.started_at))
          ),
          h('div', { style: 'display:flex;justify-content:space-between;gap:8px' },
            h('span', { class: 'muted' }, 'Mã thẻ sạc'),
            h('span', { class: 'mono', style: 'text-align:right' }, `•••• ${session.id_tag_masked}`)
          ),
          h('div', { style: 'display:flex;justify-content:space-between;gap:8px' },
            h('span', { class: 'muted' }, 'Mã phiên sạc'),
            h('span', { class: 'mono', style: 'text-align:right' }, `#${session.id}`)
          )
        )
      )
    );

    // Kết nối SSE để nhận cập nhật tức thời (≤ 2 giây)
    initSse(kwhValueEl, powerEl, currentEl, socEl);
  }

  function initSse(kwhEl, powerEl, currentEl, socEl) {
    if (eventSource) eventSource.close();
    if (typeof EventSource !== 'function') return;

    eventSource = new EventSource('/api/me/sessions/events');
    eventSource.onmessage = (e) => {
      if (isUnmounted) return;
      try {
        const payload = JSON.parse(e.data);
        if (payload.status === 'COMPLETED' || payload.type === 'session_stopped') {
          // Phiên đã kết thúc
          loadSession();
          return;
        }

        // Cập nhật DOM tức thời ≤ 2s
        if (payload.current_kwh !== null && payload.current_kwh !== undefined) {
          kwhEl.textContent = formatNumber(payload.current_kwh);
        }
        if (payload.latest_power_w !== null && payload.latest_power_w !== undefined) {
          powerEl.textContent = `${formatNumber(Math.round(payload.latest_power_w / 1000))} kW`;
        }
        if (payload.latest_current_a !== null && payload.latest_current_a !== undefined) {
          currentEl.textContent = `${formatNumber(payload.latest_current_a)} A`;
        }
        if (payload.latest_soc !== null && payload.latest_soc !== undefined) {
          socEl.textContent = `${formatNumber(payload.latest_soc)} %`;
        }
      } catch {
        // Bỏ qua lỗi parse
      }
    };
  }

  async function loadSession() {
    try {
      mount(container, loadingState(3));
      const data = await api('/api/me/sessions/current');
      if (isUnmounted) return;
      if (!data) {
        renderEmpty();
      } else {
        renderSessionView(data);
      }
    } catch (err) {
      if (isUnmounted) return;
      mount(container, errorState({
        message: err.message,
        onRetry: loadSession,
      }));
    }
  }

  loadSession();

  // Dọn dẹp tài nguyên khi rời trang
  return () => {
    isUnmounted = true;
    if (durationTimer) clearInterval(durationTimer);
    if (eventSource) eventSource.close();
  };
}
