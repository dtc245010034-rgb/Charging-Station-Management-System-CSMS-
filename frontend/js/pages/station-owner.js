import { api } from '../api.js';

const get = (id) => document.getElementById(id);
const state = { stations: [], selectedId: null, selected: null, editing: null, map: null, marker: null };
const statusLabels = { ACTIVE: 'Đang hoạt động', INACTIVE: 'Chưa hoạt động', MAINTENANCE: 'Bảo trì' };
let codeCheckTimer;
let codeCheckSequence = 0;
let codeAvailable = null;

function node(tag, className, value) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== undefined) item.textContent = value;
  return item;
}

function showError(field, message) {
  const input = get(`station${field[0].toUpperCase()}${field.slice(1)}`);
  const error = document.querySelector(`[data-error-for="${field}"]`);
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (error) error.textContent = message || '';
}

function setMapMarker(latitude, longitude, pan = false) {
  if (!state.map || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const position = [latitude, longitude];
  if (!state.marker) state.marker = globalThis.L.marker(position).addTo(state.map);
  else state.marker.setLatLng(position);
  if (pan) state.map.setView(position, Math.max(state.map.getZoom(), 13));
}

function syncMarkerFromInputs() {
  const latitude = Number(get('stationLatitude').value);
  const longitude = Number(get('stationLongitude').value);
  if (get('stationLatitude').value && get('stationLongitude').value
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
    setMapMarker(latitude, longitude);
  }
}

function initializeMap() {
  if (state.map) {
    state.map.invalidateSize();
    return;
  }
  if (!globalThis.L) {
    get('mapFallback').hidden = false;
    get('stationMap').hidden = true;
    return;
  }
  state.map = globalThis.L.map('stationMap', { scrollWheelZoom: false }).setView([16, 106], 5);
  globalThis.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map);
  state.map.on('click', (event) => {
    if (get('stationLatitude').disabled) return;
    get('stationLatitude').value = event.latlng.lat.toFixed(8);
    get('stationLongitude').value = event.latlng.lng.toFixed(8);
    showError('latitude', '');
    showError('longitude', '');
    setMapMarker(event.latlng.lat, event.latlng.lng);
  });
  syncMarkerFromInputs();
}

function renderStations() {
  const list = get('stationList');
  list.replaceChildren();
  get('stationCount').textContent = String(state.stations.length);
  get('stationSummary').textContent = state.stations.length
    ? `${state.stations.length} trạm sạc trong danh sách của bạn`
    : 'Chưa có trạm sạc nào';
  if (!state.stations.length) {
    const empty = node('p', 'station-list-empty', 'Chưa có trạm. Tạo trạm đầu tiên để bắt đầu quản lý thiết bị.');
    list.append(empty);
    return;
  }
  for (const station of state.stations) {
    const row = node('article', `station-row${String(station.id) === String(state.selectedId) ? ' selected' : ''}`);
    const open = node('button', 'station-row-open');
    open.type = 'button';
    open.setAttribute('aria-label', `Xem trạm ${station.name}`);
    const title = node('strong', 'station-row-name', station.name);
    const address = node('span', 'station-row-address', station.address);
    const info = node('span', 'station-row-meta', `${station.charge_point_count || 0} trụ · ${statusLabels[station.status] || station.status}`);
    open.append(title, address, info);
    open.addEventListener('click', () => loadDetail(station.id));
    const edit = node('button', 'station-row-edit', 'Sửa');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Sửa trạm ${station.name}`);
    edit.addEventListener('click', () => openStationDialog(station));
    row.append(open, edit);
    list.append(row);
  }
}

function renderChargePoints(station) {
  const list = get('chargePointList');
  list.replaceChildren();
  if (!station.charge_points?.length) {
    list.append(node('p', 'station-list-empty', 'Trạm chưa có trụ sạc.'));
    return;
  }
  for (const point of station.charge_points) {
    const item = node('article', 'charge-point-row');
    const heading = node('div', 'charge-point-heading');
    heading.append(node('strong', '', point.code), node('span', 'charge-point-status', point.status));
    const connectors = node('div', 'connector-list');
    for (const connector of point.connectors || []) {
      connectors.append(node('span', 'connector-item', `Đầu ${connector.connector_no}: ${connector.status}`));
    }
    item.append(heading, connectors);
    list.append(item);
  }
}

function renderDetail(station) {
  const detail = get('stationDetail');
  detail.replaceChildren();
  const header = node('header', 'station-detail-header');
  const titleGroup = node('div');
  titleGroup.append(node('p', 'eyebrow', 'CHI TIẾT TRẠM'), node('h2', 'station-detail-title', station.name));
  const status = node('span', `station-status ${station.status.toLowerCase()}`, statusLabels[station.status] || station.status);
  const edit = node('button', 'action-btn', 'Sửa thông tin');
  edit.type = 'button';
  edit.addEventListener('click', () => openStationDialog(station));
  header.append(titleGroup, status, edit);

  const address = node('p', 'station-detail-address', station.address);
  const coordinates = node('div', 'station-coordinate-values');
  coordinates.append(
    node('span', '', `Vĩ độ ${station.latitude ?? 'Chưa đặt'}`),
    node('span', '', `Kinh độ ${station.longitude ?? 'Chưa đặt'}`)
  );

  const pointSection = node('section', 'charge-point-section');
  const pointHeading = node('div', 'station-section-heading');
  pointHeading.append(node('h3', '', 'Trụ sạc'), node('span', 'station-count', String(station.charge_points?.length || 0)));
  const form = document.createElement('form');
  form.id = 'chargePointForm';
  form.className = 'charge-point-form';
  form.innerHTML = '<label class="station-field">Mã trụ<input id="chargePointCode" maxlength="50" required autocomplete="off"><span id="codeAvailability" class="field-hint" aria-live="polite"></span></label><button id="generateCodeButton" class="action-btn" type="button">Tạo mã gợi ý</button><label class="station-field connector-count-field">Số đầu nối<select id="connectorCount"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option></select></label><button id="addChargePointButton" class="primary-btn" type="submit">Thêm trụ</button><p id="chargePointFormError" class="auth-alert error" role="alert" hidden></p>';
  const points = node('div', 'charge-point-list');
  points.id = 'chargePointList';
  pointSection.append(pointHeading, form, points);
  detail.append(header, address, coordinates, pointSection);
  renderChargePoints(station);
  wireChargePointForm(station);
}

async function loadStations() {
  try {
    state.stations = await api('/api/stations');
    renderStations();
    if (state.selectedId && state.stations.some((station) => String(station.id) === String(state.selectedId))) {
      await loadDetail(state.selectedId, false);
    }
  } catch (error) {
    get('stationSummary').textContent = error.message;
  }
}

async function loadDetail(id, rerenderList = true) {
  try {
    state.selected = await api(`/api/stations/${encodeURIComponent(id)}`);
    state.selectedId = state.selected.id;
    if (rerenderList) renderStations();
    renderDetail(state.selected);
  } catch (error) {
    get('stationDetail').replaceChildren(node('p', 'auth-alert error', error.message));
  }
}

function openStationDialog(station = null) {
  state.editing = station;
  const form = get('stationForm');
  form.reset();
  form.dataset.idempotencyKey = '';
  get('stationDialogTitle').textContent = station ? 'Sửa thông tin trạm' : 'Thêm trạm sạc';
  get('saveStationButton').textContent = station ? 'Lưu thay đổi' : 'Lưu trạm';
  get('stationFormError').hidden = true;
  get('stationStatusWrap').hidden = !station;
  get('stationLatitude').required = !station;
  get('stationLongitude').required = !station;
  get('stationName').value = station?.name || '';
  get('stationAddress').value = station?.address || '';
  get('stationLatitude').value = station?.latitude ?? '';
  get('stationLongitude').value = station?.longitude ?? '';
  get('stationStatus').value = station?.status || 'INACTIVE';
  const coordinatesLocked = station?.status === 'ACTIVE';
  get('stationLatitude').disabled = coordinatesLocked;
  get('stationLongitude').disabled = coordinatesLocked;
  for (const field of ['name', 'address', 'latitude', 'longitude']) showError(field, '');
  get('stationDialog').showModal();
  initializeMap();
  syncMarkerFromInputs();
}

function validateStationForm() {
  let valid = true;
  for (const field of ['name', 'address']) {
    const input = get(`station${field[0].toUpperCase()}${field.slice(1)}`);
    const message = input.value.trim() ? '' : `${field === 'name' ? 'Tên trạm' : 'Địa chỉ'} là bắt buộc`;
    showError(field, message);
    valid &&= !message;
  }
  const latitudeInput = get('stationLatitude');
  const longitudeInput = get('stationLongitude');
  const latitudeSet = Boolean(latitudeInput.value.trim());
  const longitudeSet = Boolean(longitudeInput.value.trim());
  let latitudeError = '';
  let longitudeError = '';
  if (latitudeSet !== longitudeSet) {
    latitudeError = 'Cần nhập cả vĩ độ và kinh độ';
    longitudeError = 'Cần nhập cả vĩ độ và kinh độ';
  } else if (!state.editing && !latitudeSet) {
    latitudeError = 'Vĩ độ và kinh độ là bắt buộc';
    longitudeError = 'Vĩ độ và kinh độ là bắt buộc';
  } else if (latitudeSet && (!latitudeInput.validity.valid || Number(latitudeInput.value) < -90 || Number(latitudeInput.value) > 90)) {
    latitudeError = 'Vĩ độ phải nằm trong khoảng -90 đến 90';
  } else if (longitudeSet && (!longitudeInput.validity.valid || Number(longitudeInput.value) < -180 || Number(longitudeInput.value) > 180)) {
    longitudeError = 'Kinh độ phải nằm trong khoảng -180 đến 180';
  }
  showError('latitude', latitudeError);
  showError('longitude', longitudeError);
  valid &&= !latitudeError && !longitudeError;
  return valid;
}

async function saveStation(event) {
  event.preventDefault();
  if (!validateStationForm()) return;
  const button = get('saveStationButton');
  const form = get('stationForm');
  const payload = {
    name: get('stationName').value.trim(),
    address: get('stationAddress').value.trim(),
  };
  if (!state.editing || state.editing.status !== 'ACTIVE') {
    payload.latitude = get('stationLatitude').value.trim() || null;
    payload.longitude = get('stationLongitude').value.trim() || null;
  }
  if (state.editing) payload.status = get('stationStatus').value;
  button.disabled = true;
  button.textContent = 'Đang lưu...';
  get('stationFormError').hidden = true;
  try {
    if (state.editing) {
      await api(`/api/stations/${encodeURIComponent(state.editing.id)}`, { method: 'PATCH', body: payload });
    } else {
      form.dataset.idempotencyKey ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await api('/api/stations', {
        method: 'POST',
        headers: { 'Idempotency-Key': form.dataset.idempotencyKey },
        body: payload,
      });
    }
    get('stationDialog').close();
    await loadStations();
  } catch (error) {
    get('stationFormError').textContent = error.message;
    get('stationFormError').hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = state.editing ? 'Lưu thay đổi' : 'Lưu trạm';
  }
}

function wireChargePointForm(station) {
  const form = get('chargePointForm');
  const codeInput = get('chargePointCode');
  const hint = get('codeAvailability');
  codeAvailable = null;
  codeInput.addEventListener('input', () => {
    clearTimeout(codeCheckTimer);
    codeAvailable = null;
    const sequence = ++codeCheckSequence;
    const code = codeInput.value.trim();
    hint.textContent = '';
    hint.className = 'field-hint';
    if (!code) return;
    hint.textContent = 'Đang kiểm tra...';
    codeCheckTimer = setTimeout(async () => {
      try {
        const result = await api(`/api/charge-points/check-code?code=${encodeURIComponent(code)}`);
        if (sequence !== codeCheckSequence) return;
        codeAvailable = result.is_available;
        hint.textContent = result.is_available ? 'Mã có thể sử dụng' : 'Mã trụ này đã tồn tại trên hệ thống';
        hint.className = `field-hint ${result.is_available ? 'available' : 'unavailable'}`;
      } catch (error) {
        if (sequence === codeCheckSequence) hint.textContent = error.message;
      }
    }, 400);
  });
  get('generateCodeButton').addEventListener('click', () => {
    const prefix = station.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 24) || 'STATION';
    const serial = String((station.charge_points?.length || 0) + 1).padStart(2, '0');
    codeInput.value = `${prefix}-CP${serial}`.slice(0, 50);
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = codeInput.value.trim();
    const error = get('chargePointFormError');
    if (!code) {
      codeInput.setAttribute('aria-invalid', 'true');
      hint.textContent = 'Mã trụ là bắt buộc';
      hint.className = 'field-hint unavailable';
      return;
    }
    if (codeAvailable === false) return;
    const button = get('addChargePointButton');
    button.disabled = true;
    button.textContent = 'Đang thêm...';
    error.hidden = true;
    try {
      await api(`/api/stations/${encodeURIComponent(station.id)}/charge-points`, {
        method: 'POST',
        body: { code, connector_count: Number(get('connectorCount').value) },
      });
      await loadDetail(station.id);
      await loadStations();
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Thêm trụ';
    }
  });
}

export function init() {
  get('addStationButton').addEventListener('click', () => openStationDialog());
  get('stationForm').addEventListener('submit', saveStation);
  get('stationForm').addEventListener('input', (event) => {
    if (event.target.matches('input, select')) get('stationForm').dataset.idempotencyKey = '';
  });
  for (const id of ['closeStationDialog', 'cancelStationDialog']) get(id).addEventListener('click', () => get('stationDialog').close());
  for (const id of ['stationLatitude', 'stationLongitude']) get(id).addEventListener('input', syncMarkerFromInputs);
  loadStations();
}