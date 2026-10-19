import { h, mount } from '../../app/dom.js';
import { formatDateTime, formatNumber } from '../../app/format.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { kwhLabel, lacksEnergyReading, reviewReasonLabel } from './session-text.js';

const POLL_INTERVAL_MS = 5000;
const ENERGY_MEASURAND = 'Energy.Active.Import.Register';

export function render(ctx) {
  let disposed = false;
  let loading = false;
  let signature = '';
  const inFlight = new Set();
  const page = h('div', { class: 'page-stack unexpected-sessions-page' });
  const notice = h('div', { class: 'card', role: 'status', 'aria-live': 'polite', style: 'display:none;padding:12px 16px' });
  const list = h('div', { class: 'unexpected-sessions-list' }, loadingState(2));
  const tableRows = h('tbody');
  const table = h('div', { class: 'table-wrap' },
    h('table', { class: 'table unexpected-table' },
      h('caption', { class: 'sr-only' }, 'Danh sách phiên sạc bất thường'),
      h('thead', {}, h('tr', {},
        ['Mã phiên', 'Trụ sạc', 'Thời gian', 'Nguyên nhân bất thường', 'Năng lượng', 'Xử lý'].map((label) => h('th', { scope: 'col' }, label))
      )),
      tableRows
    )
  );
  const refreshButton = h('button', {
    class: 'btn page-refresh',
    type: 'button',
    title: 'Làm mới danh sách',
    'aria-label': 'Làm mới danh sách',
    onclick: () => { void refresh(); },
  }, icon('refresh'));

  page.append(
    h('header', { class: 'page-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Đối soát'),
        h('h1', { class: 'page-head__title' }, 'Phiên sạc bất thường'),
        h('p', { class: 'page-head__sub' }, 'Các phiên cần được kiểm tra trước khi chốt dữ liệu.')
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
    const submitBtn = h('button', {
      class: 'btn btn--danger',
      type: 'submit',
      disabled: busy,
    }, busy ? 'Đang lưu…' : 'Đóng phiên');
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
    const needsZeroConfirm = lacksEnergyReading(session);
    const zeroEnergy = needsZeroConfirm ? h('input', { type: 'checkbox', name: 'allow_zero_energy', 'aria-label': `Đóng phiên #${session.id} với 0 kWh` }) : null;
    const form = canClose ? h('form', {
      class: 'unexpected-session-form',
      onsubmit: async (event) => {
        event.preventDefault();
        const value = reason.value.trim();
        if (!value) {
          reason.setCustomValidity('Vui lòng nhập lý do đóng phiên.');
          reason.reportValidity();
          return;
        }
        reason.setCustomValidity('');
        submitBtn.disabled = true;
        mount(submitBtn, 'Đang lưu…');
        await closeSession(session, value, Boolean(zeroEnergy?.checked));
      },
    },
    h('label', { style: 'display:grid;gap:5px' },
      h('span', { class: 'muted' }, 'Lý do đóng'),
      reason
    ),
    zeroEnergy ? h('label', { class: 'unexpected-session-zero', style: 'display:flex;gap:8px;align-items:center' },
      zeroEnergy,
      h('span', { class: 'muted' }, 'Phiên chưa có số đo năng lượng: xác nhận đóng với 0 kWh')
    ) : null,
    submitBtn) : null;

    return h('tr', {},
      h('td', {}, h('span', { class: 'mono' }, `#${session.id}`), h('div', { class: 'badge badge--warning' }, 'Cần kiểm tra')),
      h('td', {}, h('strong', {}, `${session.charge_point_code} · Cổng ${session.connector_no}`), h('div', { class: 'cell-sub' }, session.station_name || 'Trạm chưa rõ')),
      h('td', {}, h('div', {}, formatDateTime(session.started_at)), h('div', { class: 'cell-sub' }, `Liên lạc lần cuối: ${session.last_seen_at ? formatDateTime(session.last_seen_at) : 'Chưa ghi nhận'}`)),
      h('td', { class: 'unexpected-reason' }, reviewReasonLabel(session.review_reason) || 'Cần kiểm tra thủ công'),
      h('td', {}, h('strong', {}, kwhLabel(session.current_kwh)), h('div', { class: 'cell-sub' }, energyReading
        ? `Số đo cuối: ${energyReading.value} ${energyReading.unit || 'Wh'} · ${formatDateTime(energyReading.sampled_at)}`
        : 'Chưa có số đo năng lượng cuối')),
      h('td', { class: 'unexpected-action' }, form || h('span', { class: 'muted' }, 'Không có quyền xử lý'))
    );
  }

  async function closeSession(session, reason, allowZeroEnergy = false) {
    if (!ctx.can('sessions:unexpected:close') || inFlight.has(session.id)) return;
    inFlight.add(session.id);
    try {
      const result = await api(`/api/sessions/${session.id}/close`, { method: 'POST', body: allowZeroEnergy ? { reason, allow_zero_energy: true } : { reason } });
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
        if (sessions.length) {
          tableRows.replaceChildren(...sessions.map(renderSession));
          mount(list, table);
        } else {
          mount(list, h('section', { class: 'card', style: 'padding:24px' },
            emptyState({ iconName: 'alert', title: 'Không có phiên bất thường cần xử lý' })
          ));
        }
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
