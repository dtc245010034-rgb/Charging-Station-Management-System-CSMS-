import '../../theme.js';
import { api } from '../api.js';
import { me, logout } from '../auth.js';
import { createStation, listStations, updateStation } from '../services/stationService.js';
import { createChargePoint, getChargePointDetail, listChargePoints } from '../services/chargePointService.js';

const stationTableBody = document.getElementById('stationTableBody');
const stationAlert = document.getElementById('stationAlert');
const stationEmptyState = document.getElementById('stationEmptyState');
const stationCountBadge = document.getElementById('stationCountBadge');
const stationDetailEmpty = document.getElementById('stationDetailEmpty');
const stationDetailContent = document.getElementById('stationDetailContent');
const detailStationName = document.getElementById('detailStationName');
const detailStationAddress = document.getElementById('detailStationAddress');
const detailStationCoords = document.getElementById('detailStationCoords');
const detailStationStatus = document.getElementById('detailStationStatus');
const chargePointList = document.getElementById('chargePointList');
const chargePointEmptyState = document.getElementById('chargePointEmptyState');

const stationForm = document.getElementById('stationForm');
const stationModal = document.getElementById('stationModal');
const stationModalTitle = document.getElementById('stationModalTitle');
const stationIdField = document.getElementById('stationId');
const stationNameInput = document.getElementById('stationName');
const stationAddressInput = document.getElementById('stationAddress');
const stationLatitudeInput = document.getElementById('stationLatitude');
const stationLongitudeInput = document.getElementById('stationLongitude');
const stationSubmitBtn = document.getElementById('stationSubmitBtn');

const chargePointForm = document.getElementById('chargePointForm');
const chargePointModal = document.getElementById('chargePointModal');
const chargePointCodeInput = document.getElementById('chargePointCode');
const chargePointConnectorCountInput = document.getElementById('chargePointConnectorCount');
const chargePointCodeStatus = document.getElementById('chargePointCodeStatus');
const chargePointSubmitBtn = document.getElementById('chargePointSubmitBtn');

const state = {
  stations: [],
  selectedStationId: null,
  selectedStation: null,
  validation: {},
  isSavingStation: false,
  isSavingChargePoint: false,
  duplicateCode: false,
};

const statusText = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Chưa hoạt động',
  MAINTENANCE: 'Bảo trì',
};

const setGlobalAlert = (type, message) => {
  if (!message) {
    stationAlert.hidden = true;
    stationAlert.className = 'auth-alert';
    stationAlert.textContent = '';
    return;
  }

  stationAlert.hidden = false;
  stationAlert.className = `auth-alert ${type}`;
  stationAlert.textContent = message;
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showFieldError(fieldId, message) {
  const errorElement = document.querySelector(`[data-error-for="${fieldId}"]`);
  if (!errorElement) return;
  if (message) {
    errorElement.textContent = message;
    errorElement.hidden = false;
    const input = document.getElementById(fieldId);
    if (input) input.setAttribute('aria-invalid', 'true');
  } else {
    errorElement.textContent = '';
    errorElement.hidden = true;
    const input = document.getElementById(fieldId);
    if (input) input.removeAttribute('aria-invalid');
  }
}

function clearFormErrors(form) {
  const fields = form.querySelectorAll('[aria-invalid="true"], [data-error-for]');
  fields.forEach((element) => {
    if (element.dataset?.errorFor) {
      showFieldError(element.dataset.errorFor, '');
    }
    if (element.matches('input')) {
      element.removeAttribute('aria-invalid');
    }
  });
}

function validateStationForm() {
  const errors = {};
  const name = stationNameInput.value.trim();
  const address = stationAddressInput.value.trim();
  const latitude = Number(stationLatitudeInput.value);
  const longitude = Number(stationLongitudeInput.value);

  if (!name) errors.stationName = 'Tên trạm không được bỏ trống';
  if (!address) errors.stationAddress = 'Địa chỉ không được bỏ trống';
  if (stationLatitudeInput.value === '' || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    errors.stationLatitude = 'Latitude bắt buộc phải là số hợp lệ trong khoảng [-90, 90]';
  }
  if (stationLongitudeInput.value === '' || Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    errors.stationLongitude = 'Longitude bắt buộc phải là số hợp lệ trong khoảng [-180, 180]';
  }

  Object.entries(errors).forEach(([fieldId, message]) => showFieldError(fieldId, message));
  Object.keys({ stationName: true, stationAddress: true, stationLatitude: true, stationLongitude: true })
    .filter((fieldId) => !(fieldId in errors))
    .forEach((fieldId) => showFieldError(fieldId, ''));

  return Object.keys(errors).length === 0;
}

async function loadStations() {
  try {
    const stations = await listStations();
    state.stations = stations || [];
    renderStations();

    if (!state.selectedStationId) {
      if (state.stations[0]) {
        selectStation(state.stations[0].id);
      } else {
        renderStationDetail(null);
      }
      return;
    }

    const selected = state.stations.find((station) => Number(station.id) === Number(state.selectedStationId));
    if (selected) {
      selectStation(selected.id);
    } else if (state.stations[0]) {
      selectStation(state.stations[0].id);
    } else {
      renderStationDetail(null);
    }
  } catch (error) {
    setGlobalAlert('error', error.message || 'Không thể tải danh sách trạm');
  }
}

function renderStations() {
  stationTableBody.innerHTML = '';
  stationCountBadge.textContent = String(state.stations.length);

  if (!state.stations.length) {
    stationEmptyState.hidden = false;
    return;
  }

  stationEmptyState.hidden = true;

  state.stations.forEach((station) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="station-name">${escapeHtml(station.name)}</div>
      </td>
      <td>${escapeHtml(station.address || '-')}</td>
      <td>${escapeHtml(station.latitude ?? '-')}</td>
      <td>${escapeHtml(station.longitude ?? '-')}</td>
      <td>
        <span class="status-pill ${String(station.status || 'INACTIVE').toLowerCase()}">${statusText[station.status] || 'Chưa hoạt động'}</span>
      </td>
      <td>
        <div class="station-actions">
          <button class="link-btn" data-action="view" data-station-id="${station.id}" type="button">Xem</button>
          <button class="link-btn" data-action="edit" data-station-id="${station.id}" type="button">Sửa</button>
        </div>
      </td>
    `;
    stationTableBody.appendChild(row);
  });
}

async function selectStation(stationId) {
  state.selectedStationId = Number(stationId);
  state.selectedStation = null;
  const station = state.stations.find((item) => Number(item.id) === Number(stationId));
  if (!station) return;

  try {
    const detail = await getStationOrFallback(stationId);
    state.selectedStation = detail;
    renderStationDetail(detail);
  } catch (error) {
    setGlobalAlert('error', error.message || 'Không thể tải chi tiết trạm');
  }
}

async function getStationOrFallback(stationId) {
  const station = state.stations.find((item) => Number(item.id) === Number(stationId));
  if (station && station.charge_points) return station;
  return api(`/api/stations/${stationId}`);
}

async function renderStationDetail(station) {
  if (!station) {
    stationDetailEmpty.hidden = false;
    stationDetailContent.hidden = true;
    return;
  }

  stationDetailEmpty.hidden = true;
  stationDetailContent.hidden = false;
  detailStationName.textContent = station.name;
  detailStationAddress.textContent = station.address || '-';
  detailStationCoords.textContent = `${station.latitude ?? '-'} / ${station.longitude ?? '-'}`;
  detailStationStatus.textContent = statusText[station.status] || 'Chưa hoạt động';

  const currentChargePoints = await loadChargePointsForStation(station.id);
  chargePointList.innerHTML = '';

  if (!currentChargePoints.length) {
    chargePointEmptyState.hidden = false;
    return;
  }

  chargePointEmptyState.hidden = true;
  currentChargePoints.forEach((point) => {
    const card = document.createElement('div');
    card.className = 'charge-point-card';
    const connectors = Array.isArray(point.connectors) && point.connectors.length ? point.connectors : [];
    const connectorMarkup = connectors.length
      ? connectors.map((connector) => `<span class="connector-tag">Connector ${connector.connector_no ?? connector.connectorNo ?? 1}</span>`).join('')
      : '<span class="connector-tag">Connector 1</span>';

    card.innerHTML = `
      <div class="charge-point-card-header">
        <h6>${escapeHtml(point.code || 'Trụ')}</h6>
      </div>
      <div class="connector-tags">${connectorMarkup}</div>
    `;
    chargePointList.appendChild(card);
  });
}

async function loadChargePointsForStation(stationId) {
  const points = await listChargePoints();
  const thisStation = points.filter((point) => Number(point.station_id) === Number(stationId));
  const fullDetails = [];
  for (const point of thisStation) {
    try {
      const detail = await getChargePointDetail(point.id);
      fullDetails.push(detail);
    } catch {
      fullDetails.push(point);
    }
  }
  return fullDetails;
}

function openStationModal(mode = 'create', station = null) {
  clearFormErrors(stationForm);
  stationForm.reset();
  stationIdField.value = station ? String(station.id) : '';
  stationModalTitle.textContent = mode === 'create' ? 'Thêm trạm' : 'Sửa trạm';
  stationSubmitBtn.textContent = state.isSavingStation ? 'Đang lưu...' : 'Lưu';
  stationSubmitBtn.disabled = state.isSavingStation;

  if (mode === 'edit' && station) {
    stationNameInput.value = station.name || '';
    stationAddressInput.value = station.address || '';
    stationLatitudeInput.value = station.latitude ?? '';
    stationLongitudeInput.value = station.longitude ?? '';
  }

  stationModal.hidden = false;
}

function closeStationModal() {
  stationModal.hidden = true;
  stationForm.reset();
  clearFormErrors(stationForm);
}

async function handleStationSubmit(event) {
  event.preventDefault();
  if (state.isSavingStation) return;
  if (!validateStationForm()) return;

  const payload = {
    name: stationNameInput.value.trim(),
    address: stationAddressInput.value.trim(),
    latitude: stationLatitudeInput.value,
    longitude: stationLongitudeInput.value,
  };

  state.isSavingStation = true;
  stationSubmitBtn.disabled = true;
  stationSubmitBtn.textContent = 'Đang lưu...';
  setGlobalAlert('success', '');

  try {
    const stationId = stationIdField.value;
    const saved = stationId ? await updateStation(stationId, payload) : await createStation({ ...payload, status: 'INACTIVE' });
    const station = Array.isArray(saved) ? saved[0] : saved;
    closeStationModal();
    setGlobalAlert('success', stationId ? 'Cập nhật trạm thành công' : 'Tạo trạm thành công');
    await loadStations();
    if (station && station.id) {
      selectStation(station.id);
    }
  } catch (error) {
    setGlobalAlert('error', error.message || 'Không thể lưu trạm');
  } finally {
    state.isSavingStation = false;
    stationSubmitBtn.disabled = false;
    stationSubmitBtn.textContent = 'Lưu';
  }
}

function openChargePointModal() {
  clearFormErrors(chargePointForm);
  chargePointCodeInput.value = '';
  chargePointConnectorCountInput.value = '';
  chargePointCodeStatus.hidden = true;
  chargePointCodeStatus.className = 'code-status';
  chargePointModal.hidden = false;
}

function closeChargePointModal() {
  chargePointModal.hidden = true;
  chargePointForm.reset();
  clearFormErrors(chargePointForm);
  chargePointCodeStatus.hidden = true;
  chargePointCodeStatus.className = 'code-status';
}

function validateChargePointForm() {
  const code = chargePointCodeInput.value.trim();
  const connectorCount = Number(chargePointConnectorCountInput.value);
  const errors = {};

  if (!code) errors.chargePointCode = 'Mã trụ không được bỏ trống';
  if (!chargePointConnectorCountInput.value || Number.isNaN(connectorCount) || connectorCount < 1 || connectorCount > 4) {
    errors.chargePointConnectorCount = 'Số đầu nối phải là số nguyên từ 1 đến 4';
  }

  if (state.duplicateCode) {
    errors.chargePointCode = '⚠ Mã trụ đã được sử dụng';
  }

  Object.entries(errors).forEach(([fieldId, message]) => showFieldError(fieldId, message));
  Object.keys({ chargePointCode: true, chargePointConnectorCount: true }).forEach((fieldId) => {
    if (!(fieldId in errors)) showFieldError(fieldId, '');
  });

  return Object.keys(errors).length === 0;
}

function syncChargeCodeStatus() {
  const code = chargePointCodeInput.value.trim();
  const check = code && code.length > 0;
  const duplicate = check && hasCodeDuplicate(code);
  state.duplicateCode = duplicate;

  if (!check) {
    chargePointCodeStatus.hidden = true;
    chargePointCodeStatus.className = 'code-status';
    return;
  }

  if (duplicate) {
    chargePointCodeStatus.hidden = false;
    chargePointCodeStatus.className = 'code-status invalid';
    chargePointCodeStatus.textContent = '⚠ Mã trụ đã được sử dụng';
    return;
  }

  chargePointCodeStatus.hidden = false;
  chargePointCodeStatus.className = 'code-status valid';
  chargePointCodeStatus.textContent = '✓ Mã trụ có thể sử dụng';
}

function hasCodeDuplicate(code) {
  const normalized = code.trim().toUpperCase();
  const stationId = state.selectedStationId;
  if (!normalized || !stationId) return false;

  return state.selectedStation?.charge_points?.some((point) => point.code && point.code.toUpperCase() === normalized)
    || false;
}

async function handleChargePointSubmit(event) {
  event.preventDefault();
  if (state.isSavingChargePoint) return;

  const isValid = validateChargePointForm();
  if (!isValid) return;

  const stationId = state.selectedStationId;
  if (!stationId) {
    setGlobalAlert('error', 'Vui lòng chọn một trạm trước khi thêm trụ');
    return;
  }

  state.isSavingChargePoint = true;
  chargePointSubmitBtn.disabled = true;
  chargePointSubmitBtn.textContent = 'Đang lưu...';

  try {
    const existing = await listChargePoints();
    const duplicate = existing.some((point) => Number(point.station_id) === Number(stationId) && point.code && point.code.trim().toUpperCase() === chargePointCodeInput.value.trim().toUpperCase());
    if (duplicate) {
      throw new Error('Mã trụ đã được sử dụng');
    }

    const payload = {
      code: chargePointCodeInput.value.trim(),
      power_kw: 0,
      status: 'UNKNOWN',
    };
    const result = await createChargePoint(stationId, payload);
    closeChargePointModal();
    setGlobalAlert('success', 'Tạo trụ sạc thành công');
    if (state.selectedStation?.id) {
      await selectStation(state.selectedStation.id);
    }
    await loadStations();
    if (result && result.id) {
      const updatedStation = state.stations.find((station) => Number(station.id) === Number(stationId));
      if (updatedStation) selectStation(updatedStation.id);
    }
  } catch (error) {
    if (error.message === 'Mã trụ đã được sử dụng' || /đã được sử dụng|duplicate|conflict/i.test(error.message)) {
      setGlobalAlert('error', '⚠ Mã trụ đã được sử dụng');
      state.duplicateCode = true;
      syncChargeCodeStatus();
      return;
    }
    setGlobalAlert('error', error.message || 'Không thể tạo trụ sạc');
  } finally {
    state.isSavingChargePoint = false;
    chargePointSubmitBtn.disabled = false;
    chargePointSubmitBtn.textContent = 'Lưu trụ';
  }
}

function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await logout(); } finally { location.replace('/index.html'); }
  });

  document.getElementById('refreshStationsBtn').addEventListener('click', async () => {
    setGlobalAlert('success', '');
    await loadStations();
  });

  document.getElementById('openAddStationBtn').addEventListener('click', () => openStationModal('create'));
  document.getElementById('editSelectedStationBtn').addEventListener('click', () => {
    if (!state.selectedStation) return;
    openStationModal('edit', state.selectedStation);
  });

  document.getElementById('openAddChargePointBtn').addEventListener('click', openChargePointModal);

  stationTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, stationId } = button.dataset;
    const id = Number(stationId);
    if (action === 'view') {
      await selectStation(id);
    }
    if (action === 'edit') {
      const station = state.stations.find((item) => Number(item.id) === id);
      if (station) openStationModal('edit', station);
    }
  });

  stationForm.addEventListener('submit', handleStationSubmit);
  chargePointForm.addEventListener('submit', handleChargePointSubmit);

  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.closeModal;
      if (targetId === 'stationModal') closeStationModal();
      if (targetId === 'chargePointModal') closeChargePointModal();
    });
  });

  chargePointCodeInput.addEventListener('input', () => {
    syncChargeCodeStatus();
    if (state.duplicateCode) {
      showFieldError('chargePointCode', '⚠ Mã trụ đã được sử dụng');
    } else {
      showFieldError('chargePointCode', '');
    }
  });

  chargePointConnectorCountInput.addEventListener('input', () => {
    if (chargePointConnectorCountInput.value.trim() === '') {
      showFieldError('chargePointConnectorCount', '');
      return;
    }
    const value = Number(chargePointConnectorCountInput.value);
    if (Number.isNaN(value) || value < 1 || value > 4) {
      showFieldError('chargePointConnectorCount', 'Số đầu nối phải là số nguyên từ 1 đến 4');
      return;
    }
    showFieldError('chargePointConnectorCount', '');
  });
}

async function bootstrap() {
  try {
    const user = await me();
    if (user.role !== 'STATION_OWNER') {
      location.replace('/index.html');
      return;
    }

    document.getElementById('userName').textContent = user.name;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userBadge').textContent = user.role;
    document.body.hidden = false;
    bindEvents();

    await loadStations();
  } catch (error) {
    document.body.hidden = false;
    setGlobalAlert('error', error.message || 'Bạn cần đăng nhập để mở trang này');
  }
}

bootstrap();
