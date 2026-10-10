import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { icon } from '../../components/icons.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { formatNumber, formatDateTime } from '../../app/format.js';
import {
  formatPower, formatDuration, elapsedSeconds, endStateOf, decideAction,
} from './session-model.js';

const VALUE_STYLE = 'font-size:20px;font-weight:700;font-variant-numeric:tabular-nums';
const ROW_STYLE = 'display:flex;justify-content:space-between;gap:8px';

const infoRow = (label, value, { bold = false, mono = false } = {}) => h('div', { style: ROW_STYLE },
  h('span', { class: 'muted' }, label),
  h('span', { class: mono ? 'mono' : '', style: `text-align:right;${bold ? 'font-weight:600' : ''}` }, value)
);

const tile = (label, valueEl) => h('div', { class: 'card', style: 'padding:14px' },
  h('span', { class: 'muted', style: 'font-size:12px;font-weight:600' }, label),
  h('div', { style: 'margin-top:4px' }, valueEl)
);

const placesCard = (session, extraRows) => h('section', { class: 'card' },
  h('div', { class: 'card__head' }, h('h2', { class: 'card__title' }, 'Thông tin trạm & thiết bị')),
  h('div', { class: 'card__body', style: 'display:grid;gap:10px;font-size:13.5px' },
    infoRow('Trạm sạc', session.station_name || '—', { bold: true }),
    infoRow('Địa chỉ', session.station_address || '—'),
    infoRow('Trụ & Cổng', `${session.charge_point_code} · Cổng ${session.connector_no}`, { bold: true }),
    extraRows,
    infoRow('Mã phiên sạc', `#${session.id}`, { mono: true })
  )
);

export function render(ctx) {
  let shown = null; // { id, status } của phiên đang hiển thị; null khi trang trống hoặc đang tải
  let live = null; // tham chiếu DOM của màn hình trực tiếp
  let eventSource = null;
  let durationTimer = null;
  let revision = 0; // tăng mỗi khi một sự kiện/đồng bộ được áp dụng; kết quả tải cũ hơn bị bỏ
  let needsResync = false; // true sau mỗi lỗi/nối lại SSE: lần mở kế tiếp phải lấy lại trạng thái đã lỡ
  const endedSeen = new Map(); // sự kiện kết thúc đến khi chưa có phiên hiển thị (đang tải): id -> phiên
  let isUnmounted = false;

  const container = h('div', { class: 'page-stack', style: 'max-width:540px;margin:0 auto;display:flex;flex-direction:column;gap:16px;' });
  // Thanh báo mất kết nối nằm ngoài `container` để không bị xoá mỗi lần vẽ lại màn hình.
  // Dùng style.display (không dùng thuộc tính hidden) vì `display:flex` nội tuyến sẽ đè hidden.
  const notice = h('div', { role: 'status', 'aria-live': 'polite', class: 'card', style: 'display:none;max-width:540px;margin:0 auto 16px;padding:12px 16px;align-items:center;justify-content:space-between;gap:12px' });
  ctx.root.append(notice, container);

  function hideNotice() {
    notice.style.display = 'none';
    notice.replaceChildren();
  }

  function showConnectionLost() {
    mount(notice,
      h('span', {}, 'Mất kết nối cập nhật trực tiếp. Số liệu có thể đã cũ.'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: reconnectSse }, 'Kết nối lại')
    );
    notice.style.display = 'flex';
  }

  function stopTimer() {
    if (durationTimer) clearInterval(durationTimer);
    durationTimer = null;
  }

  function header(title, badgeNode) {
    return h('section', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Tài xế'),
        h('h1', { class: 'page-head__title', style: 'margin-top:4px' }, title)
      ),
      badgeNode
    );
  }

  function renderEmpty() {
    stopTimer();
    shown = null;
    live = null;
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

  function setPower(session) {
    live.powerEl.textContent = formatPower(session.latest_power_w);
  }

  function renderLive(session) {
    stopTimer();
    shown = { id: session.id, status: session.status };

    const startedMs = session.started_at ? Date.parse(session.started_at) : Date.now();
    const elapsed = () => Math.max(0, Math.floor((Date.now() - startedMs) / 1000));

    live = {
      kwhEl: h('span', { style: 'font-size:42px;font-weight:800;letter-spacing:-0.03em;color:var(--brand-primary);line-height:1' }),
      durationEl: h('span', { style: VALUE_STYLE }, formatDuration(elapsed())),
      powerEl: h('span', { style: VALUE_STYLE }),
      currentEl: h('span', { style: VALUE_STYLE }),
      socEl: h('span', { style: VALUE_STYLE }),
    };
    live.kwhEl.textContent = session.current_kwh !== null && session.current_kwh !== undefined ? formatNumber(session.current_kwh) : '0';
    setPower(session);
    live.currentEl.textContent = session.latest_current_a !== null && session.latest_current_a !== undefined ? `${formatNumber(session.latest_current_a)} A` : '—';
    live.socEl.textContent = session.latest_soc !== null && session.latest_soc !== undefined ? `${formatNumber(session.latest_soc)} %` : '—';

    durationTimer = setInterval(() => {
      if (isUnmounted || !live) return;
      live.durationEl.textContent = formatDuration(elapsed());
    }, 1000);

    mount(container,
      header('Phiên sạc trực tiếp', h('span', { class: 'badge badge--charging', 'aria-live': 'polite' },
        h('span', { class: 'dot dot--charging' }), 'ĐANG SẠC')),
      h('section', { class: 'card', style: 'text-align:center;padding:24px 16px;background:var(--surface-elevated);border-color:color-mix(in srgb, var(--brand-primary) 30%, transparent)' },
        h('p', { class: 'muted', style: 'font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px' }, 'Điện năng đã nạp'),
        h('div', { style: 'display:flex;align-items:baseline;justify-content:center;gap:6px' },
          live.kwhEl,
          h('span', { style: 'font-size:20px;font-weight:700;color:var(--text-secondary)' }, 'kWh')
        ),
        h('p', { class: 'muted', style: 'font-size:12px;margin-top:6px' }, `Số đo khởi đầu: ${formatNumber(session.meter_start)} Wh`)
      ),
      h('section', { style: 'display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px' },
        tile('Thời gian sạc', live.durationEl),
        tile('Công suất', live.powerEl),
        tile('Dòng điện', live.currentEl),
        tile('Pin xe (SoC)', live.socEl)
      ),
      placesCard(session,
        [infoRow('Bắt đầu lúc', formatDateTime(session.started_at)), infoRow('Mã thẻ sạc', `•••• ${session.id_tag_masked}`, { mono: true })])
    );
  }

  // Giữ giá trị đang hiện nếu bản tin chưa có số đo tương ứng.
  function updateLive(session) {
    if (!live) return;
    if (session.current_kwh !== null && session.current_kwh !== undefined) live.kwhEl.textContent = formatNumber(session.current_kwh);
    if (session.latest_power_w !== null && session.latest_power_w !== undefined) setPower(session);
    if (session.latest_current_a !== null && session.latest_current_a !== undefined) live.currentEl.textContent = `${formatNumber(session.latest_current_a)} A`;
    if (session.latest_soc !== null && session.latest_soc !== undefined) live.socEl.textContent = `${formatNumber(session.latest_soc)} %`;
  }

  function renderEnded(session) {
    stopTimer();
    live = null;
    shown = { id: session.id, status: session.status };

    const end = endStateOf(session.status);
    const seconds = elapsedSeconds(session.started_at, session.stopped_at);
    const isCompleted = session.status === 'COMPLETED';
    const kwhText = isCompleted && session.current_kwh !== null && session.current_kwh !== undefined
      ? formatNumber(session.current_kwh)
      : '—';
    const note = isCompleted
      ? `Số đo: ${formatNumber(session.meter_start)} → ${formatNumber(session.meter_stop)} Wh`
      : 'Phiên bị gián đoạn nên số kWh chưa được chốt, đang chờ đối soát.';

    mount(container,
      header(end.title, h('span', { class: `badge ${end.badgeClass}`, 'aria-live': 'polite' },
        h('span', { class: `dot ${end.dotClass}` }), end.badge)),
      h('section', { class: 'card', style: 'text-align:center;padding:24px 16px;background:var(--surface-elevated)' },
        h('p', { class: 'muted', style: 'font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px' }, 'Điện năng đã nạp'),
        h('div', { style: 'display:flex;align-items:baseline;justify-content:center;gap:6px' },
          h('span', { style: 'font-size:42px;font-weight:800;letter-spacing:-0.03em;line-height:1' }, kwhText),
          h('span', { style: 'font-size:20px;font-weight:700;color:var(--text-secondary)' }, 'kWh')
        ),
        h('p', { class: 'muted', style: 'font-size:12px;margin-top:6px' }, note)
      ),
      placesCard(session, [
        infoRow('Bắt đầu lúc', formatDateTime(session.started_at)),
        infoRow('Kết thúc lúc', formatDateTime(session.stopped_at)),
        infoRow('Thời gian sạc', seconds === null ? '—' : formatDuration(seconds)),
      ]),
      h('button', { class: 'btn', type: 'button', onclick: () => loadSession() }, 'Xong')
    );
  }

  function handleEvent(payload) {
    const incoming = payload?.session;
    // Chỉ chuyển cho decideAction đối tượng phiên đầy đủ (có id và status); bản tin thiếu thì bỏ.
    if (!incoming || incoming.id === null || incoming.id === undefined || !incoming.status) return;
    const action = decideAction(shown, incoming);
    if (action === 'ignore') {
      if (incoming.status !== 'CHARGING') endedSeen.set(incoming.id, incoming);
      return;
    }
    revision += 1;
    if (action === 'show-live') renderLive(incoming);
    else if (action === 'update-live') updateLive(incoming);
    else renderEnded(incoming);
  }

  // Sau khi SSE nối lại có thể đã lỡ sự kiện: lấy lại trạng thái hiện tại của tài xế.
  async function resync() {
    const startedRevision = revision;
    try {
      const current = await api('/api/me/sessions/current');
      if (isUnmounted || revision !== startedRevision) return;
      if (current) {
        const ended = endedSeen.get(current.id);
        if (ended) {
          if (!shown || shown.id !== ended.id || shown.status === 'CHARGING') {
            revision += 1;
            renderEnded(ended);
          }
          return;
        }
        const action = decideAction(shown, current);
        if (action === 'ignore') return;
        revision += 1;
        if (action === 'show-live') renderLive(current);
        else updateLive(current);
        return;
      }
      if (shown && shown.status === 'CHARGING') {
        const final = await api(`/api/sessions/${shown.id}`);
        if (isUnmounted || revision !== startedRevision || !final) return;
        if (decideAction(shown, final) === 'show-ended') {
          revision += 1;
          renderEnded(final);
        }
      }
    } catch {
      // Best effort: lần nối lại kế tiếp sẽ thử lại.
    }
  }

  // G8: JWT hết hạn thì máy chủ đóng luồng; trình duyệt nối lại bị 401 rồi dừng hẳn (readyState CLOSED).
  // api() tự chuyển về trang đăng nhập khi 401; các lỗi khác thì báo mất kết nối kèm nút nối lại.
  async function onStreamClosed() {
    try {
      await api('/api/me/sessions/current');
    } catch (err) {
      if (err.status === 401) return;
    }
    if (isUnmounted) return;
    showConnectionLost();
  }

  function reconnectSse() {
    needsResync = true;
    hideNotice();
    if (eventSource) eventSource.close();
    openSse();
  }

  function openSse() {
    if (typeof EventSource !== 'function') return;
    eventSource = new EventSource('/api/me/sessions/events');
    eventSource.onopen = () => {
      hideNotice();
      if (needsResync) {
        needsResync = false;
        resync();
      }
    };
    eventSource.onerror = () => {
      needsResync = true; // mọi lỗi (kể cả trước lần mở đầu tiên) đều có thể làm lỡ sự kiện
      // Lỗi tạm thời (readyState CONNECTING) thì trình duyệt tự nối lại; chỉ xử lý khi đã đóng hẳn.
      if (isUnmounted || !eventSource || eventSource.readyState !== EventSource.CLOSED) return;
      onStreamClosed();
    };
    eventSource.onmessage = (e) => {
      if (isUnmounted) return;
      let payload;
      try {
        payload = JSON.parse(e.data);
      } catch {
        return;
      }
      handleEvent(payload);
    };
  }

  async function loadSession() {
    const startedRevision = revision;
    try {
      mount(container, loadingState(3));
      const data = await api('/api/me/sessions/current');
      if (isUnmounted || revision !== startedRevision) return;
      if (!data) renderEmpty();
      else if (endedSeen.has(data.id)) renderEnded(endedSeen.get(data.id));
      else renderLive(data);
    } catch (err) {
      if (isUnmounted || revision !== startedRevision) return;
      mount(container, errorState({ message: err.message, onRetry: loadSession }));
    }
  }

  openSse();
  loadSession();

  return () => {
    isUnmounted = true;
    stopTimer();
    if (eventSource) eventSource.close();
  };
}
