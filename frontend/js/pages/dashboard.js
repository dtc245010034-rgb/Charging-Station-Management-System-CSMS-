import '../theme.js';
import { me, logout } from '../auth.js';
import { goHome } from '../router.js';
import { api } from '../api.js';
import { validateStation } from '../validate.js';

const stationState = { editingId: null, items: [] };
const chargePointState = { editingId: null };
const isAdmin = () => document.body.dataset.role === 'ADMIN';
const byId = (id) => document.getElementById(id);
const stationFieldIds = {
  name: 'stationName',
  address: 'stationAddress',
  latitude: 'stationLatitude',
  longitude: 'stationLongitude',
  status: 'stationStatus',
  owner_id: 'stationOwner',
};

const setStationFieldError = (field, message = '') => {
  const inputId = stationFieldIds[field];
  if (!inputId) return;
  const input = byId(inputId);
  const slot = byId(`error_${inputId}`);
  if (!input || !slot) return;
  slot.textContent = message;
  slot.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
};

const showStationFieldErrors = (errors = {}) => {
  Object.keys(stationFieldIds).forEach((field) => setStationFieldError(field, errors[field] || ''));
};

const setStationMessage = (message = '', isError = false) => {
  const element = byId('stationMessage');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', isError);
};

const closeStationForm = () => {
  const form = byId('stationForm');
  if (!form) return;
  stationState.editingId = null;
  form.reset();
  showStationFieldErrors();
  form.hidden = true;
};

const openStationForm = (station = null) => {
  stationState.editingId = station?.id ?? null;
  byId('stationFormTitle').textContent = station ? 'Sửa trạm' : 'Tạo trạm';
  byId('stationName').value = station?.name ?? '';
  byId('stationAddress').value = station?.address ?? '';
  byId('stationLatitude').value = station?.latitude ?? '';
  byId('stationLongitude').value = station?.longitude ?? '';
  byId('stationStatus').value = station?.status ?? 'ACTIVE';
  if (isAdmin()) byId('stationOwner').value = String(station?.owner_id ?? '');
  showStationFieldErrors();
  byId('stationForm').hidden = false;
  byId('stationName').focus();
};

const renderStations = (stations) => {
  const list = byId('stationList');
  list.textContent = '';
  if (!stations.length) {
    list.textContent = 'Chưa có station nào trong phạm vi của bạn.';
    return;
  }
  stations.forEach((station) => {
    const row = document.createElement('article');
    row.className = 'station-row';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = station.name;
    const address = document.createElement('span');
    address.className = 'addr';
    address.textContent = `${station.address} · ${station.status}`;
    const owner = document.createElement('span');
    owner.className = 'addr';
    owner.textContent = isAdmin() ? `Owner ID: ${station.owner_id}` : `Điểm sạc: ${station.charge_point_count ?? 0}`;
    meta.append(name, address, owner);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const edit = document.createElement('button');
    edit.className = 'action-btn';
    edit.type = 'button';
    edit.textContent = 'Sửa';
    edit.addEventListener('click', () => openStationForm(station));
    actions.append(edit);
    row.append(meta, actions);
    list.append(row);
  });
};

const loadStationOwners = async () => {
  if (!isAdmin()) return;
  const owners = await api('/api/admin/station-owners');
  const select = byId('stationOwner');
  select.textContent = '';
  owners.forEach((owner) => {
    const option = document.createElement('option');
    option.value = owner.id;
    option.textContent = `${owner.name} (${owner.email})`;
    select.append(option);
  });
};

const loadStations = async () => {
  setStationMessage('Đang tải...');
  try {
    stationState.items = await api('/api/stations');
    renderStations(stationState.items);
    setStationMessage('');
  } catch (error) {
    setStationMessage(error.message, true);
  }
};

const setChargePointMessage = (message = '', isError = false) => {
  const element = byId('chargePointMessage');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', isError);
};

const closeChargePointForm = () => {
  const form = byId('chargePointForm');
  if (!form) return;
  chargePointState.editingId = null;
  form.reset();
  byId('chargePointStation').disabled = false;
  form.hidden = true;
};

const fillChargePointStations = (selectedId = '') => {
  const select = byId('chargePointStation');
  select.textContent = '';
  stationState.items.forEach((station) => {
    const option = document.createElement('option');
    option.value = station.id;
    option.textContent = station.name;
    option.selected = String(station.id) === String(selectedId);
    select.append(option);
  });
};

const openChargePointForm = (point = null) => {
  chargePointState.editingId = point?.id ?? null;
  byId('chargePointFormTitle').textContent = point ? 'Sửa trụ sạc' : 'Tạo trụ sạc';
  fillChargePointStations(point?.station_id ?? stationState.items[0]?.id);
  byId('chargePointStation').disabled = Boolean(point);
  byId('chargePointCode').value = point?.code ?? '';
  byId('chargePointModel').value = point?.model ?? '';
  byId('chargePointVendor').value = point?.vendor ?? '';
  byId('chargePointStatus').value = point?.status ?? 'UNKNOWN';
  byId('chargePointPower').value = point?.power_kw ?? 0;
  byId('chargePointForm').hidden = false;
  byId('chargePointCode').focus();
};

const renderChargePoints = (points) => {
  const list = byId('chargePointList');
  list.textContent = '';
  if (!points.length) {
    list.textContent = 'Chưa có trụ sạc trong phạm vi của bạn.';
    return;
  }
  points.forEach((point) => {
    const row = document.createElement('article');
    row.className = 'station-row';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = point.code;
    const details = document.createElement('span');
    details.className = 'addr';
    details.textContent = `${point.station_name} · ${point.status} · ${point.power_kw} kW`;
    meta.append(name, details);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const edit = document.createElement('button');
    edit.className = 'action-btn';
    edit.type = 'button';
    edit.textContent = 'Sửa';
    edit.addEventListener('click', () => openChargePointForm(point));
    const remove = document.createElement('button');
    remove.className = 'action-btn danger';
    remove.type = 'button';
    remove.textContent = 'Xóa';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Xóa trụ ${point.code}?`)) return;
      try {
        await api(`/api/charge-points/${point.id}`, { method: 'DELETE' });
        await loadChargePoints();
        setChargePointMessage('Đã xóa trụ sạc.');
      } catch (error) {
        setChargePointMessage(error.message, true);
      }
    });
    actions.append(edit, remove);
    row.append(meta, actions);
    list.append(row);
  });
};

const loadChargePoints = async () => {
  setChargePointMessage('Đang tải...');
  try {
    renderChargePoints(await api('/api/charge-points'));
    setChargePointMessage('');
  } catch (error) {
    setChargePointMessage(error.message, true);
  }
};

const initChargePoints = async () => {
  if (!byId('chargePointWorkspace')) return;
  await loadChargePoints();
  byId('createChargePointBtn').addEventListener('click', () => openChargePointForm());
  byId('cancelChargePointBtn').addEventListener('click', closeChargePointForm);
  byId('chargePointForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      code: byId('chargePointCode').value.trim(),
      model: byId('chargePointModel').value.trim() || null,
      vendor: byId('chargePointVendor').value.trim() || null,
      status: byId('chargePointStatus').value.trim() || 'UNKNOWN',
      power_kw: Number(byId('chargePointPower').value),
    };
    try {
      if (chargePointState.editingId) {
        await api(`/api/charge-points/${chargePointState.editingId}`, { method: 'PATCH', body: payload });
      } else {
        await api(`/api/stations/${byId('chargePointStation').value}/charge-points`, { method: 'POST', body: payload });
      }
      closeChargePointForm();
      await loadChargePoints();
      setChargePointMessage('Đã lưu trụ sạc.');
    } catch (error) {
      setChargePointMessage(error.message, true);
    }
  });
};

const initStations = async () => {
  if (!byId('stationWorkspace')) return;
  try {
    await loadStationOwners();
    await loadStations();
  } catch (error) {
    setStationMessage(error.message, true);
  }
  byId('refreshStationsBtn').addEventListener('click', loadStations);
  byId('createStationBtn').addEventListener('click', () => openStationForm());
  byId('cancelStationBtn').addEventListener('click', closeStationForm);
  byId('stationForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {
      name: byId('stationName').value,
      address: byId('stationAddress').value,
      latitude: byId('stationLatitude').value,
      longitude: byId('stationLongitude').value,
      status: byId('stationStatus').value,
      owner_id: isAdmin() ? byId('stationOwner').value : '',
    };
    const clientErrors = validateStation(values, isAdmin());
    showStationFieldErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;

    const payload = {
      name: values.name.trim(),
      address: values.address.trim(),
      latitude: values.latitude === '' ? null : Number(values.latitude),
      longitude: values.longitude === '' ? null : Number(values.longitude),
      status: values.status,
    };
    if (isAdmin()) payload.owner_id = Number(values.owner_id);
    const saveButton = byId('saveStationBtn');
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Đang lưu...';
    saveButton.disabled = true;
    try {
      await api(stationState.editingId ? `/api/stations/${stationState.editingId}` : '/api/stations', {
        method: stationState.editingId ? 'PATCH' : 'POST',
        body: payload,
      });
      closeStationForm();
      await loadStations();
      setStationMessage('Đã lưu station.');
    } catch (error) {
      const fieldErrors = {};
      for (const detail of error.details || []) {
        if (stationFieldIds[detail.field]) fieldErrors[detail.field] ??= detail.message;
      }
      showStationFieldErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) setStationMessage(error.message, true);
    } finally {
      saveButton.textContent = originalText;
      saveButton.disabled = false;
    }
  });
  Object.values(stationFieldIds).forEach((inputId) => {
    const field = Object.keys(stationFieldIds).find((key) => stationFieldIds[key] === inputId);
    ['input', 'change'].forEach((eventName) => byId(inputId)?.addEventListener(eventName, () => setStationFieldError(field)));
  });
};

// Phiên hết hạn → api.js nhận 401 và tự chuyển về /index.html; lỗi mạng khác thì vẫn hiện khung trang.
me().then((user) => {
  if (user.role !== document.body.dataset.role) return goHome(user);
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userEmail').textContent = user.email;
  document.getElementById('userBadge').textContent = user.role;
  document.body.hidden = false;
  initStations().then(initChargePoints);
}, () => { document.body.hidden = false; });

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await logout(); } finally { location.replace('/index.html'); }
});
