import '../theme.js';
import { me, logout } from '../auth.js';
import { goHome } from '../router.js';
import { api } from '../api.js';

const stationState = { editingId: null };
const isAdmin = () => document.body.dataset.role === 'ADMIN';
const byId = (id) => document.getElementById(id);

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
    renderStations(await api('/api/stations'));
    setStationMessage('');
  } catch (error) {
    setStationMessage(error.message, true);
  }
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
    const payload = {
      name: byId('stationName').value.trim(),
      address: byId('stationAddress').value.trim(),
      latitude: byId('stationLatitude').value === '' ? null : Number(byId('stationLatitude').value),
      longitude: byId('stationLongitude').value === '' ? null : Number(byId('stationLongitude').value),
      status: byId('stationStatus').value,
    };
    if (isAdmin()) payload.owner_id = Number(byId('stationOwner').value);
    try {
      await api(stationState.editingId ? `/api/stations/${stationState.editingId}` : '/api/stations', {
        method: stationState.editingId ? 'PATCH' : 'POST',
        body: payload,
      });
      closeStationForm();
      await loadStations();
      setStationMessage('Đã lưu station.');
    } catch (error) {
      setStationMessage(error.message, true);
    }
  });
};

// Phiên hết hạn → api.js nhận 401 và tự chuyển về /index.html; lỗi mạng khác thì vẫn hiện khung trang.
me().then((user) => {
  if (user.role !== document.body.dataset.role) return goHome(user);
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userEmail').textContent = user.email;
  document.getElementById('userBadge').textContent = user.role;
  document.body.hidden = false;
  initStations();
}, () => { document.body.hidden = false; });

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await logout(); } finally { location.replace('/index.html'); }
});
