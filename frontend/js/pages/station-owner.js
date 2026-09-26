import '../theme.js';
import { me, logout } from '../auth.js';
import { goHome } from '../router.js';
import { stationService } from '../services/stationService.js';
import { chargePointService } from '../services/chargePointService.js';

const platformStatusLabel = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Chưa hoạt động',
  MAINTENANCE: 'Bảo trì',
};

const elements = {
  stationForm: document.getElementById('stationForm'),
  stationModal: document.getElementById('stationModal'),
  stationFormTitle: document.getElementById('stationFormTitle'),
  saveStationBtn: document.getElementById('saveStationBtn'),
  cancelStationBtn: document.getElementById('cancelStationBtn'),
  openStationFormBtn: document.getElementById('openStationFormBtn'),
  stationListState: document.getElementById('stationListState'),
  stationTableBody: document.getElementById('stationTableBody'),
  emptyStationState: document.getElementById('emptyStationState'),
  stationDetailPanel: document.getElementById('stationDetailPanel'),
  stationDetailTitle: document.getElementById('stationDetailTitle'),
  stationDetailMeta: document.getElementById('stationDetailMeta'),
  stationDetailList: document.getElementById('stationDetailList'),
  chargePointForm: document.getElementById('chargePointForm'),
  chargePointCode: document.getElementById('chargePointCode'),
  chargePointCount: document.getElementById('chargePointCount'),
  chargePointCodeStatus: document.getElementById('chargePointCodeStatus'),
  chargePointSubmit: document.getElementById('chargePointSubmit'),
  stationToast: document.getElementById('stationToast'),
};

const state = {
  stations: [],
  selectedStationId: null,
  stationSubmitting: false,
  chargePointSubmitting: false,
  codeCheckTimer: null,
};

const showToast = (message, type = 'success') => {
  elements.stationToast.textContent = message;
  elements.stationToast.className = `toast ${type}`;
  elements.stationToast.hidden = false;
  window.clearTimeout(showToast.timerId);
  showToast.timerId = window.setTimeout(() => {
    elements.stationToast.hidden = true;
  }, 3200);
};

const setFieldError = (fieldName, message = '') => {
  const errorNode = document.querySelector(`[data-error-for="${fieldName}"]`);
  const input = document.getElementById(fieldName);
  if (!errorNode || !input) return;
  errorNode.textContent = message;
  errorNode.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
};

const clearStationErrors = () => {
  ['stationName', 'stationAddress', 'stationLatitude', 'stationLongitude'].forEach((field) => setFieldError(field, ''));
};

const clearChargePointErrors = () => {
  setFieldError('chargePointCode', '');
  setFieldError('chargePointCount', '');
  elements.chargePointCodeStatus.textContent = '';
  elements.chargePointCodeStatus.className = 'code-status';
};

const validateStationForm = (payload) => {
  const errors = {};
  if (!payload.name) errors.stationName = 'Tên trạm không được bỏ trống';
  if (!payload.address) errors.stationAddress = 'Địa chỉ không được bỏ trống';

  const latitude = Number(payload.latitude);
  if (payload.latitude === '' || payload.latitude === undefined || payload.latitude === null || !Number.isFinite(latitude)) {
    errors.stationLatitude = 'Latitude là bắt buộc và phải là số hợp lệ';
  }

  const longitude = Number(payload.longitude);
  if (payload.longitude === '' || payload.longitude === undefined || payload.longitude === null || !Number.isFinite(longitude)) {
    errors.stationLongitude = 'Longitude là bắt buộc và phải là số hợp lệ';
  }

  return errors;
};

const validateChargePointForm = (payload) => {
  const errors = {};
  if (!payload.code) errors.chargePointCode = 'Mã trụ không được bỏ trống';
  const connectorCount = Number(payload.connectorCount);
  if (!Number.isInteger(connectorCount) || connectorCount < 1 || connectorCount > 4) {
    errors.chargePointCount = 'Số đầu nối phải là số từ 1 đến 4';
  }
  return errors;
};

const openStationModal = (mode = 'create', station = null) => {
  clearStationErrors();
  elements.stationForm.reset();
  elements.stationForm.dataset.mode = mode;
  elements.stationForm.dataset.stationId = station ? String(station.id) : '';
  elements.stationFormTitle.textContent = mode === 'edit' ? 'Sửa trạm' : 'Thêm trạm';

  if (mode === 'edit' && station) {
    document.getElementById('stationName').value = station.name ?? '';
    document.getElementById('stationAddress').value = station.address ?? '';
    document.getElementById('stationLatitude').value = station.latitude ?? '';
    document.getElementById('stationLongitude').value = station.longitude ?? '';
    document.getElementById('stationStatus').value = station.status ?? 'INACTIVE';
  } else {
    document.getElementById('stationStatus').value = 'INACTIVE';
  }

  elements.stationModal.hidden = false;
};

const closeStationModal = () => {
  elements.stationModal.hidden = true;
  elements.stationForm.reset();
  clearStationErrors();
};

const renderStationStatus = (status) => platformStatusLabel[status] ?? status ?? 'Chưa hoạt động';

const renderStationList = () => {
  const rows = state.stations;
  if (!rows.length) {
    elements.stationTableBody.innerHTML = '';
    elements.emptyStationState.hidden = false;
    elements.stationTableBody.parentElement.hidden = true;
    return;
  }

  elements.emptyStationState.hidden = true;
  elements.stationTableBody.parentElement.hidden = false;
  elements.stationTableBody.innerHTML = rows.map((station) => `
    <tr>
      <td>${String(station.name ?? '').replace(/</g, '&lt;')}</td>
      <td>${String(station.address ?? '').replace(/</g, '&lt;')}</td>
      <td>${Number.isFinite(Number(station.latitude)) ? Number(station.latitude) : '-'}</td>
      <td>${Number.isFinite(Number(station.longitude)) ? Number(station.longitude) : '-'}</td>
      <td><span class="status-pill status-${String(station.status ?? 'INACTIVE').toLowerCase()}">${renderStationStatus(station.status)}</span></td>
      <td>
        <div class="table-actions">
          <button class="mini-btn" type="button" data-action="detail" data-station-id="${station.id}">Xem</button>
          <button class="mini-btn secondary" type="button" data-action="edit" data-station-id="${station.id}">Sửa</button>
        </div>
      </td>
    </tr>
  `).join('');
};

const renderStationDetail = (station) => {
  if (!station) {
    elements.stationDetailPanel.hidden = true;
    return;
  }

  elements.stationDetailPanel.hidden = false;
  elements.stationDetailTitle.textContent = station.name;
  elements.stationDetailMeta.innerHTML = `
    <span>Địa chỉ: ${String(station.address ?? '').replace(/</g, '&lt;')}</span>
    <span>Latitude: ${Number.isFinite(Number(station.latitude)) ? Number(station.latitude) : '-'}</span>
    <span>Longitude: ${Number.isFinite(Number(station.longitude)) ? Number(station.longitude) : '-'}</span>
    <span>Trạng thái: ${renderStationStatus(station.status)}</span>
  `;

  const chargePoints = Array.isArray(station.charge_points) ? station.charge_points : [];
  if (!chargePoints.length) {
    elements.stationDetailList.innerHTML = '<li class="empty-item">Chưa có trụ nào cho trạm này.</li>';
    return;
  }

  elements.stationDetailList.innerHTML = chargePoints.map((point) => `
    <li class="chargepoint-item">
      <div class="chargepoint-header">
        <strong>${String(point.code ?? '').replace(/</g, '&lt;')}</strong>
        <span>${String(point.status ?? 'UNKNOWN')}</span>
      </div>
      <ul class="connector-list">
        ${(Array.isArray(point.connectors) ? point.connectors : []).map((connector) => `
          <li>Connector ${connector.connector_no ?? connector.connectorNo ?? 1}</li>
        `).join('') || '<li>Không có đầu nối</li>'}
      </ul>
    </li>
  `).join('');
};

const openStationDetail = async (stationId) => {
  const station = state.stations.find((item) => Number(item.id) === Number(stationId));
  if (!station) return;

  state.selectedStationId = Number(stationId);
  try {
    const detail = await stationService.get(stationId);
    state.selectedStationId = Number(detail.id);
    renderStationDetail(detail);
  } catch (error) {
    showToast(error.message || 'Không thể tải chi tiết trạm.', 'error');
  }
};

const refreshStations = async () => {
  try {
    elements.stationListState.hidden = false;
    const stations = await stationService.list();
    state.stations = stations;
    renderStationList();
    if (!state.selectedStationId) {
      const firstStation = stations[0];
      if (firstStation) {
        state.selectedStationId = Number(firstStation.id);
        await openStationDetail(firstStation.id);
      } else {
        elements.stationDetailPanel.hidden = true;
      }
      return;
    }

    const selected = stations.find((item) => Number(item.id) === Number(state.selectedStationId));
    if (selected) {
      await openStationDetail(selected.id);
    } else if (stations[0]) {
      state.selectedStationId = Number(stations[0].id);
      await openStationDetail(stations[0].id);
    } else {
      elements.stationDetailPanel.hidden = true;
    }
  } catch (error) {
    elements.stationListState.hidden = true;
    showToast(error.message || 'Không thể tải danh sách trạm.', 'error');
  } finally {
    elements.stationListState.hidden = true;
  }
};

const handleStationSubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const mode = form.dataset.mode;
  const name = document.getElementById('stationName').value.trim();
  const address = document.getElementById('stationAddress').value.trim();
  const latitude = document.getElementById('stationLatitude').value.trim();
  const longitude = document.getElementById('stationLongitude').value.trim();
  const status = document.getElementById('stationStatus').value;

  const payload = { name, address, latitude, longitude, status };
  const errors = validateStationForm(payload);
  Object.entries(errors).forEach(([field, message]) => setFieldError(field, message));
  if (Object.keys(errors).length) return;

  if (state.stationSubmitting) return;
  state.stationSubmitting = true;
  elements.saveStationBtn.disabled = true;
  elements.saveStationBtn.textContent = 'Đang lưu...';

  try {
    const result = mode === 'edit'
      ? await stationService.update(form.dataset.stationId, payload)
      : await stationService.create(payload);

    showToast(mode === 'edit' ? 'Cập nhật trạm thành công.' : 'Tạo trạm thành công.');
    closeStationModal();
    await refreshStations();

    if (result && result.id) {
      state.selectedStationId = Number(result.id);
      await openStationDetail(result.id);
    }
  } catch (error) {
    const details = Array.isArray(error.details) ? error.details : [];
    const mapped = {};
    details.forEach(({ field, message }) => {
      if (field) mapped[field] = message;
    });
    if (mapped.name) setFieldError('stationName', mapped.name);
    if (mapped.address) setFieldError('stationAddress', mapped.address);
    if (mapped.latitude) setFieldError('stationLatitude', mapped.latitude);
    if (mapped.longitude) setFieldError('stationLongitude', mapped.longitude);
    if (!Object.keys(mapped).length) showToast(error.message || 'Không thể lưu trạm.', 'error');
  } finally {
    elements.saveStationBtn.disabled = false;
    elements.saveStationBtn.textContent = 'Lưu';
    state.stationSubmitting = false;
  }
};

const showCodeStatus = (message, type = '') => {
  elements.chargePointCodeStatus.textContent = message;
  elements.chargePointCodeStatus.className = `code-status ${type}`.trim();
};

const checkChargePointCode = async () => {
  const code = elements.chargePointCode.value.trim();
  if (!code) {
    showCodeStatus('');
    return;
  }

  const exists = await chargePointService.checkCodeAvailability(code, state.selectedStationId);
  if (exists) showCodeStatus('⚠ Mã trụ đã được sử dụng', 'error');
  else showCodeStatus('✓ Mã trụ có thể sử dụng', 'success');
};

const handleChargePointSubmit = async (event) => {
  event.preventDefault();
  if (!state.selectedStationId) {
    showToast('Vui lòng chọn một trạm trước khi thêm trụ.', 'error');
    return;
  }

  const payload = {
    code: elements.chargePointCode.value,
    connectorCount: elements.chargePointCount.value,
  };

  const errors = validateChargePointForm(payload);
  Object.entries(errors).forEach(([field, message]) => setFieldError(field, message));
  if (Object.keys(errors).length) return;

  const duplicate = await chargePointService.checkCodeAvailability(payload.code, state.selectedStationId);
  if (duplicate) {
    showCodeStatus('⚠ Mã trụ đã được sử dụng', 'error');
    setFieldError('chargePointCode', '⚠ Mã trụ đã được sử dụng');
    return;
  }

  if (state.chargePointSubmitting) return;
  state.chargePointSubmitting = true;
  elements.chargePointSubmit.disabled = true;
  elements.chargePointSubmit.textContent = 'Đang lưu...';

  try {
    await chargePointService.create(state.selectedStationId, payload);
    showToast('Tạo trụ sạc thành công.', 'success');
    elements.chargePointForm.reset();
    clearChargePointErrors();
    await refreshStations();
  } catch (error) {
    const message = error.message || 'Không thể tạo trụ sạc.';
    if (error.status === 409 || /đã tồn tại|duplicate/i.test(message)) {
      showCodeStatus('⚠ Mã trụ đã được sử dụng', 'error');
      setFieldError('chargePointCode', '⚠ Mã trụ đã được sử dụng');
      showToast(message, 'error');
      return;
    }
    showToast(message, 'error');
  } finally {
    elements.chargePointSubmit.disabled = false;
    elements.chargePointSubmit.textContent = 'Lưu trụ';
    state.chargePointSubmitting = false;
  }
};

const bindEvents = () => {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await logout(); } finally { location.replace('/index.html'); }
  });

  document.getElementById('refreshStationsBtn').addEventListener('click', () => refreshStations());
  document.getElementById('closeStationModalBtn').addEventListener('click', closeStationModal);
  elements.openStationFormBtn.addEventListener('click', () => openStationModal('create'));
  elements.cancelStationBtn.addEventListener('click', closeStationModal);
  document.getElementById('detailEditBtn').addEventListener('click', () => {
    const station = state.stations.find((item) => Number(item.id) === Number(state.selectedStationId));
    if (station) openStationModal('edit', station);
  });
  document.getElementById('openChargePointFormBtn').addEventListener('click', () => {
    document.getElementById('chargePointCode').focus();
  });

  elements.stationForm.addEventListener('submit', handleStationSubmit);
  elements.stationForm.addEventListener('input', () => clearStationErrors());
  elements.stationModal.addEventListener('click', (event) => {
    if (event.target === elements.stationModal) closeStationModal();
  });

  document.getElementById('stationTableBody').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    const stationId = trigger.dataset.stationId;
    if (action === 'detail') openStationDetail(stationId);
    if (action === 'edit') {
      const station = state.stations.find((item) => Number(item.id) === Number(stationId));
      if (station) openStationModal('edit', station);
    }
  });

  elements.chargePointForm.addEventListener('submit', handleChargePointSubmit);
  elements.chargePointCode.addEventListener('input', () => {
    clearChargePointErrors();
    window.clearTimeout(state.codeCheckTimer);
    state.codeCheckTimer = window.setTimeout(checkChargePointCode, 250);
  });
  elements.chargePointCount.addEventListener('input', () => {
    setFieldError('chargePointCount', '');
  });
};

const initializePage = async () => {
  try {
    const user = await me({ redirectOn401: false });
    if (user.role !== 'STATION_OWNER') return goHome(user);
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userBadge').textContent = user.role;
    document.body.hidden = false;
    bindEvents();
    await refreshStations();
  } catch {
    document.body.hidden = false;
    showToast('Vui lòng đăng nhập lại để quản lý trạm.', 'error');
    window.setTimeout(() => location.replace('/index.html'), 1200);
  }
};

initializePage();
