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

document.querySelectorAll('.password-toggle').forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const input = toggle.previousElementSibling;
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    toggle.textContent = isVisible ? '👁' : '🙈';
    toggle.setAttribute('aria-label', isVisible ? 'Hiển thị mật khẩu' : 'Ẩn mật khẩu');
    toggle.setAttribute('title', isVisible ? 'Hiển thị mật khẩu' : 'Ẩn mật khẩu');
  });
});

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
      const errorMessage = data.error?.message || 'Email hoặc mật khẩu không đúng';
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
      showAlert(data.error?.message || 'Không thể tạo tài khoản', 'error');
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
