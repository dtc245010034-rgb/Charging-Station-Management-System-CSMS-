import { h, mount } from '../../app/dom.js';
import { formatDateTime, formatNumber } from '../../app/format.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';

const POLL_INTERVAL_MS = 5000;
const ENERGY_MEASURAND = 'Energy.Active.Import.Register';

export function render(ctx) {
  let disposed = false;
  let loading = false;
  let signature = '';
  const inFlight = new Set();
  const page = h('div', { class: 'page-stack', style: 'max-width:1120px;margin:0 auto' });
  const notice = h('div', { class: 'card', role: 'status', 'aria-live': 'polite', style: 'display:none;padding:12px 16px' });
  const list = h('div', { style: 'display:grid;gap:12px' }, loadingState(2));
  const refreshButton = h('button', {
    class: 'btn',
    type: 'button',
    title: 'Làm mới danh sách',
    'aria-label': 'Làm mới danh sách',
    onclick: () => { void refresh(); },
  }, icon('refresh'));

  page.append(
    h('header', { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Đối soát'),
        h('h1', { class: 'page-head__title' }, 'Phiên sạc bất thường'),
        h('p', { class: 'muted' }, 'Các phiên cần được kiểm tra trước khi chốt dữ liệu.')
      ),
      refreshButton
    ),
    notice,
    list
  );
  ctx.root.replaceChildren(page);

  function showNotice(message, kind = 'info') {
    notice.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    notice.dataset.kind = kind;
    mount(notice, message);
    notice.style.display = 'block';
  }

  function renderSession(session) {
    const readings = Array.isArray(session.latest_readings) ? session.latest_readings : [];
    const energyReading = readings.find((reading) => reading.measurand === ENERGY_MEASURAND);
    const busy = inFlight.has(session.id);
    const canClose = ctx.can('sessions:unexpected:close');
    const reason = h('input', {
      class: 'input',
      type: 'text',
      name: 'reason',
      maxlength: 1000,
      required: true,
      autocomplete: 'off',
      placeholder: 'Nhập lý do đóng phiên',
      'aria-label': `Lý do đóng phiên #${session.id}`,
      oninput: () => reason.setCustomValidity(''),
    });
    const form = canClose ? h('form', {
      style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end',
      onsubmit: async (event) => {
        event.preventDefault();
        const value = reason.value.trim();
        if (!value) {
          reason.setCustomValidity('Vui lòng nhập lý do đóng phiên.');
          reason.reportValidity();
          return;
        }
        reason.setCustomValidity('');
        await closeSession(session, value);
      },
    },
    h('label', { style: 'display:grid;gap:5px;flex:1 1 280px' },
      h('span', { class: 'muted' }, 'Lý do đóng'),
      reason
    ),
    h('button', {
      class: 'btn btn--danger',
      type: 'submit',
      disabled: busy,
    }, busy ? 'Đang lưu…' : 'Đóng phiên')) : null;

    return h('article', { class: 'card', style: 'padding:16px;display:grid;gap:12px' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap' },
        h('div', { style: 'display:grid;gap:5px;min-width:0' },
          h('strong', {}, `${session.charge_point_code} · Cổng ${session.connector_no}`),
          h('span', { class: 'muted' }, session.station_name || 'Trạm chưa rõ'),
          h('span', { class: 'muted' }, `Phiên #${session.id} · Bắt đầu ${formatDateTime(session.started_at)}`),
          h('span', { class: 'muted' }, `Liên lạc lần cuối: ${session.last_seen_at ? formatDateTime(session.last_seen_at) : 'Chưa ghi nhận'}`),
          h('span', { class: 'muted' }, `Lý do cần xem xét: ${session.review_reason || 'Cần kiểm tra thủ công'}`)
        ),
        h('div', { style: 'display:grid;gap:5px;text-align:right' },
          h('strong', {}, session.current_kwh === null || session.current_kwh === undefined
            ? 'Điện năng đã lấy: —'
            : `Điện năng đã lấy: ${formatNumber(session.current_kwh)} kWh`),
          h('span', { class: 'muted' }, energyReading
            ? `Số đo cuối: ${energyReading.value} ${energyReading.unit || 'Wh'} · ${formatDateTime(energyReading.sampled_at)}`
            : 'Chưa có số đo năng lượng cuối')
        )
      ),
      form
    );
  }

  async function closeSession(session, reason) {
    if (!ctx.can('sessions:unexpected:close') || inFlight.has(session.id)) return;
    inFlight.add(session.id);
    signature = '';
    await refresh();
    try {
      const result = await api(`/api/sessions/${session.id}/close`, { method: 'POST', body: { reason } });
      showNotice(`Đã đóng phiên #${session.id}; số điện năng chốt ${formatNumber(result.current_kwh)} kWh.`);
    } catch (error) {
      showNotice(error.message || 'Không thể đóng phiên sạc.', 'error');
    } finally {
      inFlight.delete(session.id);
      signature = '';
      await refresh();
    }
  }

  async function refresh() {
    if (loading || disposed) return;
    loading = true;
    refreshButton.disabled = true;
    try {
      const sessions = await api('/api/sessions/unexpected');
      if (disposed) return;
      const nextSignature = JSON.stringify(sessions);
      if (nextSignature !== signature) {
        signature = nextSignature;
        mount(list, sessions.length
          ? sessions.map(renderSession)
          : h('section', { class: 'card', style: 'padding:24px' },
            emptyState({ iconName: 'alert', title: 'Không có phiên bất thường cần xử lý' })
          )
        );
      }
    } catch (error) {
      if (!signature) mount(list, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
      else showNotice('Không thể cập nhật danh sách phiên bất thường. Dữ liệu đang hiển thị có thể đã cũ.', 'error');
    } finally {
      loading = false;
      refreshButton.disabled = false;
    }
  }

  const pollTimer = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
  void refresh();
  return () => {
    disposed = true;
    clearInterval(pollTimer);
  };
}
