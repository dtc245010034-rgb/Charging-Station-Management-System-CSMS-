// Base API Configuration
const API_BASE_URL = window.location.origin.includes(':3000')
  ? ''
  : (window.CSMS_API_URL || 'http://localhost:3000');

// Theme Management
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle?.querySelector('.theme-icon');
const themeLabel = themeToggle?.querySelector('.theme-label');

const applyTheme = (theme) => {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);

  if (themeToggle) {
    themeToggle.setAttribute('aria-label', isLight ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng');
  }

  if (themeIcon) themeIcon.textContent = isLight ? '🌙' : '☀️';
  if (themeLabel) themeLabel.textContent = isLight ? 'Tối' : 'Sáng';
  localStorage.setItem('csms-theme', theme);
};

const savedTheme = localStorage.getItem('csms-theme') || 'dark';
applyTheme(savedTheme);

themeToggle?.addEventListener('click', () => {
  const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
  applyTheme(nextTheme);
});

// UI State & Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const formSections = document.querySelectorAll('.auth-form');
const authAlert = document.getElementById('authAlert');
const authLayout = document.getElementById('authLayout');
const dashboardLayout = document.getElementById('dashboardLayout');

const showAlert = (message, type = 'error') => {
  if (!authAlert) return;
  authAlert.textContent = message;
  authAlert.className = `auth-alert ${type}`;
  authAlert.style.display = 'block';
};

const hideAlert = () => {
  if (!authAlert) return;
  authAlert.style.display = 'none';
  authAlert.textContent = '';
};

const switchTab = (targetTab) => {
  hideAlert();
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === targetTab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  formSections.forEach((section) => {
    section.classList.toggle('active', section.dataset.form === targetTab);
  });
};

tabButtons.forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});

// Session & Role Management (5 roles: Tài xế, Chủ trạm, Vận hành viên, Kế toán, Quản trị)
const ROLE_CONFIG = {
  ADMIN: {
    title: 'Bàn làm việc Quản trị viên (ADMIN)',
    description: 'Toàn quyền quản trị hệ thống: trạm sạc, cấu hình, phân quyền người dùng và audit logs.',
    features: [
      { title: 'Quản lý trạm sạc', desc: 'Thêm, sửa cấu hình và giám sát các trạm trong mạng lưới', badge: 'Full Access' },
      { title: 'Quản lý người dùng & vai trò', desc: 'Phân quyền tài khoản và quản trị danh mục vai trò', badge: 'RBAC' },
      { title: 'Nhật ký hệ thống', desc: 'Xem toàn bộ audit logs và lịch sử thao tác', badge: 'Bảo mật' },
      { title: 'Báo cáo tổng quan', desc: 'Tổng hợp doanh thu, sản lượng điện và hiệu suất mạng lưới', badge: 'Báo cáo' },
    ],
  },
  ACCOUNTANT: {
    title: 'Bàn làm việc Kế toán (ACCOUNTANT)',
    description: 'Quản lý thanh toán hóa đơn, biểu giá sạc và đối soát doanh thu.',
    features: [
      { title: 'Lịch sử thanh toán', desc: 'Xem các giao dịch tiền mặt, chuyển khoản và thẻ', badge: 'Giao dịch' },
      { title: 'Đối soát doanh thu', desc: 'Báo cáo doanh thu theo ngày và theo trạm', badge: 'Đối soát' },
      { title: 'Biểu giá sạc', desc: 'Cập nhật và tra cứu mức giá sạc hiện hành', badge: 'Biểu giá' },
      { title: 'Hóa đơn phiên sạc', desc: 'Xuất báo cáo tài chính và dữ liệu kế toán', badge: 'Tài chính' },
    ],
  },
  OPERATOR: {
    title: 'Bàn làm việc Vận hành viên (OPERATOR)',
    description: 'Theo dõi phiên sạc thời gian thực, hỗ trợ khách hàng và điều khiển trụ sạc.',
    features: [
      { title: 'Phiên sạc trực tiếp', desc: 'Theo dõi tiến trình sạc và chỉ số kWh tức thời', badge: 'Realtime' },
      { title: 'Khởi động / Dừng phiên', desc: 'Điều khiển bắt đầu hoặc kết thúc phiên sạc', badge: 'Thao tác' },
      { title: 'Trạng thái kết nối', desc: 'Kiểm tra trạng thái connector 1 - 4', badge: 'Giám sát' },
    ],
  },
  STATION_OWNER: {
    title: 'Bàn làm việc Chủ trạm (STATION_OWNER)',
    description: 'Theo dõi hiệu suất vận hành, doanh thu nhượng quyền và trạng thái trạm sạc sở hữu.',
    features: [
      { title: 'Trạm của tôi', desc: 'Xem danh sách và tình trạng hoạt động các trụ sạc thuộc sở hữu', badge: 'Sở hữu' },
      { title: 'Doanh thu trạm', desc: 'Theo dõi sản lượng kWh và dòng tiền phát sinh theo kỳ', badge: 'Doanh thu' },
      { title: 'Yêu cầu bảo trì', desc: 'Gửi yêu cầu kiểm tra kỹ thuật khi phát hiện sự cố', badge: 'Kỹ thuật' },
    ],
  },
  DRIVER: {
    title: 'Cổng thông tin Tài xế (DRIVER)',
    description: 'Tìm kiếm trạm sạc, xem trạng thái cổng sạc, theo dõi phiên sạc cá nhân và lịch sử thanh toán.',
    features: [
      { title: 'Tìm điểm sạc gần nhất', desc: 'Tra cứu vị trí và công suất trụ sạc còn trống', badge: 'Bản đồ' },
      { title: 'Phiên sạc của tôi', desc: 'Theo dõi mức pin và lượng điện năng tiêu thụ trực tiếp', badge: 'Sạc xe' },
      { title: 'Lịch sử giao dịch', desc: 'Xem lại các hóa đơn và giao dịch đã hoàn tất', badge: 'Ví & Thẻ' },
    ],
  },
};

const showDashboard = (user) => {
  if (!authLayout || !dashboardLayout) return;
  authLayout.style.display = 'none';
  dashboardLayout.style.display = 'flex';

  const role = user.role || 'OPERATOR';
  const roleConfig = ROLE_CONFIG[role] || ROLE_CONFIG.OPERATOR;

  document.getElementById('userName').textContent = user.name || 'Người dùng';
  document.getElementById('userEmail').textContent = user.email || '';
  document.getElementById('userBadge').textContent = role;
  document.getElementById('dashboardRoleTitle').textContent = roleConfig.title;
  document.getElementById('roleDescription').textContent = roleConfig.description;

  const cardsContainer = document.getElementById('roleCardsGrid');
  if (cardsContainer) {
    cardsContainer.innerHTML = roleConfig.features
      .map(
        (f) => `
      <div class="role-card">
        <span class="badge">${f.badge}</span>
        <h5>${f.title}</h5>
        <p>${f.desc}</p>
      </div>`
      )
      .join('');
  }
  // Load stations list for dashboard (if user is present)
  try { fetchAndRenderStations(); } catch {}
};

const showLogin = () => {
  if (!authLayout || !dashboardLayout) return;
  dashboardLayout.style.display = 'none';
  authLayout.style.display = 'grid';
  switchTab('login');
};

const logout = async (reason = '') => {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {}
  localStorage.removeItem('csms-token');
  localStorage.removeItem('csms-user');
  showLogin();
  if (reason) {
    showAlert(reason, 'warning');
  }
};

// Authenticated API Fetch Wrapper with 401 Handling (AC4 & httpOnly Cookie)
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('csms-token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // AC4: Giả sử phiên đăng nhập đã hết hạn, Khi gọi API bất kỳ, Thì trả về 401 và chuyển về trang đăng nhập
  if (response.status === 401) {
    logout('Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.');
    throw new Error('401 Unauthorized');
  }

  return response;
}

// Check initial session
const storedToken = localStorage.getItem('csms-token');
const storedUser = localStorage.getItem('csms-user');
if (storedToken && storedUser) {
  try {
    const user = JSON.parse(storedUser);
    showDashboard(user);
  } catch {
    logout();
  }
}

// Login Form Handler (AC1, AC2, AC3)
const loginForm = document.getElementById('loginForm');
loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert();

  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const submitButton = document.getElementById('loginSubmitBtn');
  const originalText = submitButton.textContent;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  submitButton.textContent = 'Đang xác thực...';
  submitButton.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok && data.token && data.user) {
      // AC1: Giả sử thông tin đúng, Khi đăng nhập, Thì tạo phiên đăng nhập và chuyển tới trang chính của vai trò đó
      localStorage.setItem('csms-token', data.token);
      localStorage.setItem('csms-user', JSON.stringify(data.user));
      loginForm.reset();
      showDashboard(data.user);
    } else {
      // AC2 & AC3: Thông báo lỗi chung hoặc thông báo khóa tài khoản do nhập sai >= 5 lần
      const errorMessage = data.error || 'Email hoặc mật khẩu không đúng';
      showAlert(errorMessage, response.status === 429 ? 'error' : 'error');
    }
  } catch (error) {
    showAlert('Không thể kết nối tới máy chủ backend. Vui lòng kiểm tra dịch vụ.', 'error');
  } finally {
    submitButton.textContent = originalText;
    submitButton.disabled = false;
  }
});

// Register Form Handler
const registerForm = document.getElementById('registerForm');
registerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert();

  const name = document.getElementById('regName').value.trim();
  const role = document.getElementById('regRole').value;
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const submitButton = document.getElementById('regSubmitBtn');
  const originalText = submitButton.textContent;

  submitButton.textContent = 'Đang đăng ký...';
  submitButton.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, password, role }),
    });

    const data = await response.json();

    if (response.ok && data.user) {
      registerForm.reset();
      switchTab('login');
      showAlert(`Tạo tài khoản thành công cho ${data.user.name} (${data.user.role}). Vui lòng đăng nhập.`, 'success');
    } else {
      showAlert(data.error || 'Không thể tạo tài khoản', 'error');
    }
  } catch (error) {
    showAlert('Không thể kết nối tới máy chủ backend.', 'error');
  } finally {
    submitButton.textContent = originalText;
    submitButton.disabled = false;
  }
});

// Logout Button
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  logout('Đã đăng xuất thành công.');
});

// Interactive Session Testing Buttons (for demonstrating AC4)
const apiLog = document.getElementById('apiResponseLog');

document.getElementById('testApiBtn')?.addEventListener('click', async () => {
  if (!apiLog) return;
  apiLog.style.display = 'block';
  apiLog.textContent = 'Đang gọi GET /api/auth/me ...';
  try {
    const res = await apiFetch('/api/auth/me');
    const data = await res.json();
    apiLog.textContent = `[HTTP ${res.status}] Phản hồi: ${JSON.stringify(data, null, 2)}`;
  } catch (err) {
    apiLog.textContent = `Lỗi: ${err.message}`;
  }
});

document.getElementById('testExpireBtn')?.addEventListener('click', async () => {
  if (!apiLog) return;
  // Intentionally corrupt token to simulate expiration
  localStorage.setItem('csms-token', 'expired-or-invalid-token');
  apiLog.style.display = 'block';
  apiLog.textContent = 'Đã đổi token thành token hết hạn. Đang gọi GET /api/auth/me...';
  try {
    await apiFetch('/api/auth/me');
  } catch (err) {
    // apiFetch will catch 401, clear storage and redirect to login
  }
});

/* Stations UI: list, create, edit, inline validation, ownership filter (T-07) */
const stationsListEl = document.getElementById('stationsList');
const createStationBtn = document.getElementById('createStationBtn');
const refreshStationsBtn = document.getElementById('refreshStationsBtn');
const stationModal = document.getElementById('stationModal');
const stationForm = document.getElementById('stationForm');
const stationModalTitle = document.getElementById('stationModalTitle');
const cancelStationBtn = document.getElementById('cancelStationBtn');
const saveStationBtn = document.getElementById('saveStationBtn');

let stationsCache = [];
let editingStationId = null;

const getCurrentUser = () => {
  try { return JSON.parse(localStorage.getItem('csms-user') || 'null'); } catch { return null; }
};

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  const field = el.closest('.field');
  if (field) field.classList.toggle('has-error', Boolean(msg));
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function clearFormErrors() {
  ['err_stationName','err_stationAddress','err_stationLatitude','err_stationLongitude'].forEach((id) => showFieldError(id, ''));
}

function openStationModal(mode = 'create', station = null) {
  editingStationId = station?.id || null;
  stationModalTitle.textContent = mode === 'edit' ? 'Sửa trạm' : 'Tạo trạm';
  document.getElementById('stationName').value = station?.name || '';
  document.getElementById('stationAddress').value = station?.address || '';
  document.getElementById('stationLatitude').value = station?.latitude ?? '';
  document.getElementById('stationLongitude').value = station?.longitude ?? '';
  document.getElementById('stationStatus').value = station?.status || 'ACTIVE';
  saveStationBtn.disabled = false;
  saveStationBtn.textContent = editingStationId ? 'Lưu thay đổi' : 'Lưu';
  clearFormErrors();
  stationModal.style.display = 'grid';
}

function closeStationModal() {
  stationModal.style.display = 'none';
  editingStationId = null;
  stationForm.reset && stationForm.reset();
  clearFormErrors();
}

function validateStationForm() {
  clearFormErrors();
  const name = document.getElementById('stationName').value.trim();
  const address = document.getElementById('stationAddress').value.trim();
  const lat = document.getElementById('stationLatitude').value.trim();
  const lon = document.getElementById('stationLongitude').value.trim();
  let ok = true;

  if (!name) {
    showFieldError('err_stationName','Tên trạm là bắt buộc');
    ok = false;
  }

  if (!address) {
    showFieldError('err_stationAddress','Địa chỉ là bắt buộc');
    ok = false;
  }

  if (lat !== '') {
    const v = Number(lat);
    if (!Number.isFinite(v)) {
      showFieldError('err_stationLatitude','Vĩ độ không hợp lệ');
      ok = false;
    }
  }

  if (lon !== '') {
    const v = Number(lon);
    if (!Number.isFinite(v)) {
      showFieldError('err_stationLongitude','Kinh độ không hợp lệ');
      ok = false;
    }
  }

  return ok;
}

async function fetchAndRenderStations() {
  try {
    const res = await apiFetch('/api/stations');
    const data = await res.json();
    stationsCache = Array.isArray(data) ? data : [];
    renderStationsList();
  } catch (err) {
    showAlert('Không thể tải danh sách trạm', 'error');
  }
}

function renderStationsList() {
  const user = getCurrentUser();
  let list = stationsCache.slice();
  // Ownership filter: if STATION_OWNER show only owned stations
  if (user && user.role === 'STATION_OWNER') {
    list = list.filter((s) => Number(s.owner_id) === Number(user.id));
  }
  if (!stationsListEl) return;
  stationsListEl.innerHTML = list.map((s) => `
    <div class="station-row" data-id="${s.id}">
      <div class="meta">
        <div class="name">${escapeHtml(s.name || '')} <span style="color:var(--muted); font-weight:600; font-size:0.85rem;">#${s.id}</span></div>
        <div class="addr">${escapeHtml(s.address || '')}</div>
        <div style="color:var(--muted); font-size:0.85rem; margin-top:6px;">Trạng thái: ${s.status || ''} • Trụ: ${s.charge_point_count ?? 0}</div>
      </div>
      <div class="actions">
        <button class="action-btn" data-action="view">Xem</button>
        <button class="action-btn" data-action="edit">Sửa</button>
      </div>
    </div>
  `).join('');

  // attach handlers
  stationsListEl.querySelectorAll('.station-row').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-action="view"]').addEventListener('click', async () => {
      try {
        const res = await apiFetch(`/api/stations/${id}`);
        const st = await res.json();
        openStationModal('edit', st);
      } catch (e) { showAlert('Không thể tải chi tiết trạm', 'error'); }
    });
    row.querySelector('[data-action="edit"]').addEventListener('click', async () => {
      try {
        const res = await apiFetch(`/api/stations/${id}`);
        const st = await res.json();
        openStationModal('edit', st);
      } catch (e) { showAlert('Không thể tải chi tiết trạm', 'error'); }
    });
  });
}

function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

createStationBtn?.addEventListener('click', () => openStationModal('create', null));
refreshStationsBtn?.addEventListener('click', () => fetchAndRenderStations());
cancelStationBtn?.addEventListener('click', closeStationModal);

stationForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateStationForm()) return;

  saveStationBtn.disabled = true;
  const originalText = saveStationBtn.textContent;
  saveStationBtn.textContent = editingStationId ? 'Đang cập nhật...' : 'Đang tạo...';

  const payload = {
    name: document.getElementById('stationName').value.trim(),
    address: document.getElementById('stationAddress').value.trim(),
    latitude: document.getElementById('stationLatitude').value.trim() || null,
    longitude: document.getElementById('stationLongitude').value.trim() || null,
    status: document.getElementById('stationStatus').value,
  };

  if (payload.latitude !== null) payload.latitude = Number(payload.latitude);
  if (payload.longitude !== null) payload.longitude = Number(payload.longitude);

  try {
    let res;
    if (editingStationId) {
      res = await apiFetch(`/api/stations/${editingStationId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      res = await apiFetch('/api/stations', { method: 'POST', body: JSON.stringify(payload) });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi server');
    await fetchAndRenderStations();
    closeStationModal();
  } catch (err) {
    const msg = err.message || 'Không thể lưu trạm';
    showAlert(msg, 'error');
  } finally {
    saveStationBtn.disabled = false;
    saveStationBtn.textContent = originalText;
  }
});

['stationName','stationAddress','stationLatitude','stationLongitude'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => validateStationForm());
  el.addEventListener('blur', () => validateStationForm());
});

// (stations are fetched inside showDashboard implementation)
