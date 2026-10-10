import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { icon } from '../../components/icons.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { formatDateTime, formatNumber } from '../../app/format.js';

const POLL_INTERVAL_MS = 2500;

function remaining(deadline) {
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function render(ctx) {
  let disposed = false;
  let loading = false;
  let signature = '';
  let previousStates = new Map();
  const inFlight = new Set();
  const requestedSessions = new Set();
  const page = h('div', { class: 'page-stack', style: 'max-width:1120px;margin:0 auto' });
  const notice = h('div', { class: 'card', role: 'status', 'aria-live': 'polite', style: 'display:none;padding:12px 16px' });
  const list = h('div', { style: 'display:grid;gap:12px' }, loadingState(2));
  const refreshButton = h('button', {
    class: 'btn', type: 'button', title: 'Làm mới danh sách', 'aria-label': 'Làm mới danh sách',
    onclick: () => { void refresh(); },
  }, icon('refresh'));
  page.append(
    h('header', { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Vận hành'), h('h1', { class: 'page-head__title' }, 'Phiên sạc')),
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
    const pending = ['SENDING', 'ACCEPTED', 'ERROR'].includes(session.remote_stop_status);
    const button = h('button', {
      class: 'btn btn--danger', type: 'button', disabled: pending || inFlight.has(session.id) || !ctx.can('sessions:stop'),
      onclick: () => stopSession(session),
    }, icon('stop'), pending ? 'Đang chờ trụ' : 'Dừng phiên');
    const stateText = session.remote_stop_status === 'SENDING'
      ? 'Đang gửi lệnh dừng…'
      : session.remote_stop_status === 'ACCEPTED'
        ? `Trụ đã chấp nhận yêu cầu dừng. Đang chờ xác nhận kết thúc · còn ${remaining(session.remote_stop_deadline)}`
        : session.remote_stop_status === 'ERROR'
          ? 'Chưa xác định được trụ đã nhận lệnh hay chưa. Cần kiểm tra trạng thái thực tế trước khi gửi lại.'
          : session.remote_stop_status === 'TIMED_OUT'
          ? 'Quá thời hạn chờ; phiên cần được kiểm tra trạng thái thực tế.'
          : session.needs_review ? `Cần xem xét${session.review_reason ? ` · ${session.review_reason}` : ''}` : '';
    const clock = session.remote_stop_status === 'ACCEPTED'
      ? h('span', { class: 'muted', dataset: { deadline: session.remote_stop_deadline }, 'aria-live': 'off' }, `Còn ${remaining(session.remote_stop_deadline)}`)
      : null;

    return h('article', { class: 'card', style: 'padding:16px;display:grid;gap:12px' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap' },
        h('div', { style: 'display:grid;gap:5px;min-width:0' },
          h('strong', {}, `${session.charge_point_code} · Cổng ${session.connector_no}`),
          h('span', { class: 'muted' }, session.station_name || 'Trạm chưa rõ'),
          h('span', { class: 'muted' }, `Phiên #${session.id} · Bắt đầu ${formatDateTime(session.started_at)}`)
        ),
        h('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap' },
          h('span', {}, session.current_kwh === null || session.current_kwh === undefined ? 'kWh —' : `${formatNumber(session.current_kwh)} kWh`),
          button
        )
      ),
      stateText ? h('p', { class: session.remote_stop_status === 'TIMED_OUT' || session.needs_review ? 'muted' : '', style: 'margin:0', 'aria-live': 'polite' },
        session.remote_stop_status === 'ACCEPTED'
          ? h('span', {}, 'Trụ đã chấp nhận yêu cầu dừng. Đang chờ xác nhận kết thúc phiên. ', clock)
          : stateText
      ) : null
    );
  }

  async function stopSession(session) {
    if (!ctx.can('sessions:stop') || inFlight.has(session.id)) return;
    if (!window.confirm(`Gửi yêu cầu dừng phiên #${session.id} trên trụ ${session.charge_point_code}?`)) return;
    inFlight.add(session.id);
    signature = '';
    await refresh();
    try {
      const result = await api(`/api/sessions/${session.id}/stop`, { method: 'POST', body: {} });
      requestedSessions.add(session.id);
      showNotice('Trụ đã chấp nhận yêu cầu dừng. Đang chờ trụ xác nhận kết thúc phiên.');
      if (result.deadline) showNotice('Trụ đã chấp nhận yêu cầu dừng. Đang chờ trụ xác nhận kết thúc phiên.');
    } catch (error) {
      if (error.code === 'CHARGE_POINT_OFFLINE' || error.message.toLowerCase().includes('ngoại tuyến')) {
        showNotice('Không thể dừng phiên vì trụ sạc đang ngoại tuyến.', 'error');
      } else if (error.status === 422) {
        showNotice('Trụ sạc từ chối yêu cầu dừng phiên. Phiên vẫn đang hoạt động.', 'error');
      } else if (error.status === 504) {
        showNotice('Chưa nhận được phản hồi từ trụ. Hãy kiểm tra trạng thái phiên trước khi thử lại.', 'error');
      } else {
        showNotice('Không gửi được yêu cầu dừng do lỗi hệ thống hoặc mạng. Hãy làm mới trạng thái trước khi thử lại.', 'error');
      }
    } finally {
      inFlight.delete(session.id);
      signature = '';
      await refresh();
    }
  }

  async function checkEndedRequests(activeIds) {
    for (const sessionId of [...requestedSessions]) {
      if (activeIds.has(sessionId)) continue;
      requestedSessions.delete(sessionId);
      try {
        const ended = await api(`/api/sessions/${sessionId}`);
        if (ended.status !== 'CHARGING') showNotice(`Phiên #${sessionId} đã kết thúc theo xác nhận từ trụ.`);
      } catch {
        // Phiên có thể đã bị xóa bởi thao tác vận hành khác; lần đồng bộ sau vẫn hiển thị danh sách chuẩn.
      }
    }
  }

  async function refresh() {
    if (loading || disposed) return;
    loading = true;
    refreshButton.disabled = true;
    try {
      const sessions = await api('/api/sessions');
      if (disposed) return;
      const activeIds = new Set(sessions.map((item) => item.id));
      await checkEndedRequests(activeIds);
      for (const item of sessions) {
        if (previousStates.get(item.id) === 'ACCEPTED' && item.remote_stop_status === 'TIMED_OUT') {
          showNotice('Chưa nhận được xác nhận kết thúc phiên sau 2 phút. Phiên đã được đánh dấu cần xem xét; hãy kiểm tra trạng thái thực tế.', 'error');
        }
      }
      previousStates = new Map(sessions.map((item) => [item.id, item.remote_stop_status]));
      const nextSignature = JSON.stringify(sessions);
      if (nextSignature !== signature) {
        signature = nextSignature;
        mount(list, sessions.length
          ? sessions.map(renderSession)
          : h('section', { class: 'card', style: 'padding:24px' }, emptyState({ iconName: 'bolt', title: 'Không có phiên sạc đang hoạt động' }))
        );
      }
    } catch (error) {
      if (!signature) mount(list, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
      else showNotice('Không thể cập nhật danh sách phiên sạc. Dữ liệu đang hiển thị có thể đã cũ.', 'error');
    } finally {
      loading = false;
      refreshButton.disabled = false;
    }
  }

  const pollTimer = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
  const clockTimer = setInterval(() => {
    for (const element of list.querySelectorAll('[data-deadline]')) {
      element.textContent = `Còn ${remaining(element.dataset.deadline)}`;
    }
  }, 1000);
  void refresh();
  return () => {
    disposed = true;
    clearInterval(pollTimer);
    clearInterval(clockTimer);
  };
}