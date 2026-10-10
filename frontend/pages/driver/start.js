import { h, mount } from '../../app/dom.js';
import * as csms from '../../services/csms.js';
import { icon } from '../../components/icons.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { toast } from '../../components/toast.js';

const POLL_INTERVAL_MS = 1500;

export function render(ctx) {
  let chargePoints = [];
  let selectedChargePointId = null;
  let selectedConnectorId = null;
  let requestId = null;
  let requestDeadline = null;
  let pollTimer = null;
  let isStarting = false;
  let isLoadingPoints = true;
  let isUnmounted = false;

  const content = h('div', { class: 'page-stack', style: 'max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:16px' });
  ctx.root.append(content);

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function selectedPoint() {
    return chargePoints.find((point) => String(point.charge_point_id) === String(selectedChargePointId)) ?? null;
  }

  function selectedConnector() {
    return selectedPoint()?.connectors.find((connector) => String(connector.connector_id) === String(selectedConnectorId)) ?? null;
  }

  function connectorLabel(connector) {
    if (connector.available) return 'Sẵn sàng';
    if (connector.ocpp_status === 'Reserved') return 'Đã được đặt chỗ';
    if (connector.ocpp_status === 'Charging' || connector.has_active_session) return 'Đang bận';
    if (connector.has_pending_start) return 'Đang có yêu cầu bắt đầu';
    if (!connector.charge_point_online) return 'Trụ ngoại tuyến';
    if (connector.ocpp_status === 'Available' || connector.ocpp_status === 'Preparing') return 'Chưa sẵn sàng';
    return connector.ocpp_status || 'Chưa sẵn sàng';
  }

  function connectorBadge(connector) {
    const statusClass = connector.available
      ? 'badge--ready'
      : connector.ocpp_status === 'Charging' || connector.has_active_session
        ? 'badge--charging'
        : connector.ocpp_status === 'Reserved'
          ? 'badge--warning'
          : 'badge--neutral';
    return h('span', { class: `badge ${statusClass}` }, connectorLabel(connector));
  }

  function showMessage(message, { error = false } = {}) {
    const messageBox = content.querySelector('[data-start-message]');
    if (!messageBox) return;
    messageBox.hidden = !message;
    messageBox.setAttribute('role', error ? 'alert' : 'status');
    messageBox.textContent = message;
    messageBox.dataset.kind = error ? 'error' : 'info';
  }

  function updateStartButton(button) {
    if (!button) return;
    button.disabled = isStarting || !selectedConnector();
    button.replaceChildren(
      icon(isStarting ? 'refresh' : 'bolt'),
      isStarting ? 'Đang chờ trụ bắt đầu…' : 'Bắt đầu sạc'
    );
  }

  function renderConnectors(list, point) {
    list.replaceChildren(...point.connectors.map((connector) => {
      const selected = String(connector.connector_id) === String(selectedConnectorId);
      return h('button', {
        class: 'list-row',
        type: 'button',
        role: 'radio',
        'aria-checked': String(selected),
        style: `width:100%;text-align:left;cursor:pointer;${selected ? 'outline:2px solid var(--brand-primary);outline-offset:-2px;' : ''}`,
        onclick: () => {
          selectedConnectorId = connector.connector_id;
          renderConnectors(list, point);
          updateStartButton(content.querySelector('[data-start-button]'));
          showMessage('');
        },
      },
      h('span', {},
        h('span', { class: 'cell-strong' }, `Đầu nối ${connector.connector_no}`),
        h('span', { class: 'cell-sub' }, connector.connector_type)),
      connectorBadge(connector));
    }));
  }

  function renderPage() {
    if (!chargePoints.length) {
      mount(content,
        h('header', {},
          h('p', { class: 'eyebrow' }, 'Tài xế'),
          h('h1', { class: 'page-head__title', style: 'margin-top:4px' }, 'Bắt đầu sạc'),
          h('p', { class: 'page-head__sub' }, 'Chọn trụ và đầu nối đã cắm súng.')
        ),
        isLoadingPoints
          ? loadingState()
          : emptyState({
            iconName: 'charger',
            title: 'Chưa có trụ sạc đang hoạt động',
            text: 'Hiện chưa có đầu nối của trạm đang hoạt động để bắt đầu sạc.',
            action: h('button', { class: 'btn', type: 'button', onclick: refreshChargePoints }, icon('refresh'), 'Làm mới'),
          })
      );
      return;
    }

    const pointSelect = h('select', {
      class: 'select',
      'aria-label': 'Chọn trụ sạc',
      value: String(selectedChargePointId),
      onchange: () => {
        selectedChargePointId = Number(pointSelect.value);
        const nextPoint = selectedPoint();
        selectedConnectorId = nextPoint?.connectors[0]?.connector_id ?? null;
        renderPage();
      },
    }, chargePoints.map((point) => h('option', {
      value: String(point.charge_point_id),
      selected: String(point.charge_point_id) === String(selectedChargePointId),
    }, `${point.station_name} · ${point.charge_point_code}`)));

    const point = selectedPoint();
    const online = point.connectors.every((connector) => connector.charge_point_online);
    const connectorList = h('div', { class: 'list-rows', role: 'radiogroup', 'aria-label': 'Chọn đầu nối' });
    const startButton = h('button', {
      class: 'btn btn--primary btn--block',
      type: 'button',
      'data-start-button': '',
      onclick: startCharging,
    });
    const message = h('div', {
      class: 'card',
      style: 'padding:12px',
      'data-start-message': '',
      role: 'status',
      'aria-live': 'polite',
      hidden: true,
    });
    const refreshButton = h('button', {
      class: 'btn',
      type: 'button',
      onclick: refreshChargePoints,
    }, icon('refresh'), 'Làm mới trạng thái');

    renderConnectors(connectorList, point);
    updateStartButton(startButton);

    mount(content,
      h('header', {},
        h('p', { class: 'eyebrow' }, 'Tài xế'),
        h('h1', { class: 'page-head__title', style: 'margin-top:4px' }, 'Bắt đầu sạc'),
        h('p', { class: 'page-head__sub' }, 'Chọn đầu nối đã cắm súng để bắt đầu phiên sạc.')
      ),
      message,
      h('section', { class: 'card', 'aria-label': 'Chi tiết trụ sạc' },
        h('div', { class: 'card__head' },
          h('div', {},
            h('p', { class: 'eyebrow' }, point.station_name),
            h('h2', { class: 'card__title', style: 'margin-top:4px' }, `Trụ ${point.charge_point_code}`)
          ),
          h('span', { class: `badge ${online ? 'badge--ready' : 'badge--offline'}` },
            h('span', { class: `dot ${online ? 'dot--ready' : 'dot--offline'}` }),
            online ? 'Trực tuyến' : 'Ngoại tuyến')
        ),
        h('div', { class: 'card__body', style: 'display:grid;gap:16px' },
          h('label', { class: 'field' },
            h('span', { class: 'field__label' }, 'Trụ sạc'),
            pointSelect
          ),
          h('div', { style: 'display:flex;justify-content:space-between;gap:12px' },
            h('span', { class: 'muted' }, 'Địa chỉ'),
            h('span', { style: 'text-align:right' }, point.station_address || '—')
          ),
          h('div', {},
            h('div', { class: 'section-title' }, 'Đầu nối'),
            connectorList
          ),
          startButton,
          h('p', { class: 'muted', style: 'font-size:12px;text-align:center;margin:0' },
            'Sau khi trụ chấp nhận lệnh, hệ thống chờ StartTransaction tối đa 60 giây.'
          ),
          refreshButton
        )
      ),
      h('a', { class: 'btn', href: '#/driver/sessions' }, icon('history'), 'Xem phiên sạc')
    );
  }

  async function refreshChargePoints() {
    isLoadingPoints = true;
    try {
      chargePoints = await csms.remoteStart.chargePoints();
      if (!chargePoints.some((point) => String(point.charge_point_id) === String(selectedChargePointId))) {
        selectedChargePointId = chargePoints[0]?.charge_point_id ?? null;
      }
      const point = selectedPoint();
      if (!point?.connectors.some((connector) => String(connector.connector_id) === String(selectedConnectorId))) {
        selectedConnectorId = point?.connectors[0]?.connector_id ?? null;
      }
      isLoadingPoints = false;
      renderPage();
    } catch (error) {
      isLoadingPoints = false;
      mount(content, errorState({ message: error.message, onRetry: refreshChargePoints }));
    }
  }

  function terminalStatus(request) {
    if (request.status === 'STARTED') {
      stopPolling();
      toast('Phiên sạc đã bắt đầu.', { ms: 2500 });
      location.hash = '#/driver/sessions';
      return true;
    }
    if (request.status === 'REJECTED') {
      stopPolling();
      isStarting = false;
      requestId = null;
      showMessage('Trụ từ chối yêu cầu bắt đầu. Hãy kiểm tra súng đã cắm chắc chưa rồi thử lại.', { error: true });
      toast('Trụ từ chối yêu cầu. Hãy kiểm tra súng đã cắm chưa.', { kind: 'error' });
      updateStartButton(content.querySelector('[data-start-button]'));
      return true;
    }
    if (request.status === 'TIMED_OUT') {
      stopPolling();
      isStarting = false;
      requestId = null;
      showMessage('Chưa bắt đầu được trong 60 giây. Hãy kiểm tra súng đã cắm chưa và thử lại.', { error: true });
      toast('Chưa bắt đầu được, bạn có thể thử lại.', { kind: 'error' });
      updateStartButton(content.querySelector('[data-start-button]'));
      return true;
    }
    if (request.status === 'ERROR') {
      stopPolling();
      isStarting = false;
      requestId = null;
      showMessage('Không gửi được lệnh tới trụ. Hãy kiểm tra kết nối của trụ rồi thử lại.', { error: true });
      updateStartButton(content.querySelector('[data-start-button]'));
      return true;
    }
    return false;
  }

  async function pollRequest() {
    if (!requestId || isUnmounted) return;
    try {
      const request = await csms.remoteStart.getRequest(requestId);
      if (terminalStatus(request)) return;
      const remainingMs = Date.parse(request.deadline) - Date.now();
      if (remainingMs <= 0) {
        showMessage('Chưa bắt đầu được trong 60 giây. Hãy kiểm tra súng đã cắm chưa; bạn có thể thử lại.', { error: true });
        isStarting = false;
        requestId = null;
        updateStartButton(content.querySelector('[data-start-button]'));
        return;
      }
      showMessage(`Đang chờ trụ bắt đầu phiên sạc… Còn ${Math.ceil(remainingMs / 1000)} giây.`);
      pollTimer = setTimeout(pollRequest, Math.min(POLL_INTERVAL_MS, remainingMs));
    } catch (error) {
      if (Date.now() >= requestDeadline) {
        isStarting = false;
        requestId = null;
        showMessage('Chưa bắt đầu được trong 60 giây. Hãy kiểm tra súng đã cắm chưa; bạn có thể thử lại.', { error: true });
        updateStartButton(content.querySelector('[data-start-button]'));
        return;
      }
      showMessage(`Không kiểm tra được trạng thái từ máy chủ: ${error.message}. Đang thử kết nối lại…`, { error: true });
      pollTimer = setTimeout(pollRequest, POLL_INTERVAL_MS);
    }
  }

  async function startCharging() {
    const connector = selectedConnector();
    if (isStarting || !connector) return;
    isStarting = true;
    updateStartButton(content.querySelector('[data-start-button]'));
    showMessage('Đang gửi yêu cầu bắt đầu sạc tới trụ…');
    try {
      const request = await csms.remoteStart.start(connector.connector_id);
      requestId = String(request.request_id);
      requestDeadline = Date.parse(request.deadline);
      if (terminalStatus(request)) return;
      showMessage('Trụ đã chấp nhận yêu cầu. Đang chờ phiên sạc bắt đầu…');
      await pollRequest();
    } catch (error) {
      isStarting = false;
      const isBusy = error.status === 409 && error.code === 'CONNECTOR_BUSY';
      const isRejected = error.status === 422 || error.code === 'CHARGE_POINT_REJECTED';
      const messageText = isBusy
        ? 'Đầu nối đang bận hoặc đã được đặt chỗ. Hãy chọn đầu nối khác.'
        : isRejected
          ? 'Trụ từ chối yêu cầu bắt đầu. Hãy kiểm tra súng đã cắm chắc chưa.'
          : error.message;
      showMessage(messageText, { error: true });
      toast(messageText, { kind: 'error' });
      updateStartButton(content.querySelector('[data-start-button]'));
    }
  }

  async function resumePendingRequest() {
    if (requestId || isStarting) return;
    const request = await csms.remoteStart.getPendingRequest();
    if (!request) return;
    requestId = String(request.request_id);
    requestDeadline = Date.parse(request.deadline);
    isStarting = true;
    updateStartButton(content.querySelector('[data-start-button]'));
    showMessage('Đang khôi phục trạng thái yêu cầu bắt đầu sạc…');
    if (terminalStatus(request)) return;
    await pollRequest();
  }

  renderPage();
  refreshChargePoints().then(resumePendingRequest).catch((error) => {
    showMessage(`Không thể khôi phục trạng thái yêu cầu bắt đầu: ${error.message}. Hãy làm mới để thử lại.`, { error: true });
    toast('Không thể kiểm tra yêu cầu đang chờ. Hãy làm mới để thử lại.', { kind: 'error' });
  });

  return () => {
    isUnmounted = true;
    stopPolling();
  };
}
