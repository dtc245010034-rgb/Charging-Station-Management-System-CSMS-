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

const tabButtons = document.querySelectorAll('.tab-btn');
const formSections = document.querySelectorAll('.auth-form');

const switchTab = (targetTab) => {
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

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

loginForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;

  submitButton.textContent = 'Đang đăng nhập...';
  submitButton.disabled = true;

  setTimeout(() => {
    submitButton.textContent = 'Đăng nhập thành công';
    submitButton.disabled = false;

    setTimeout(() => {
      submitButton.textContent = originalText;
    }, 1800);
  }, 900);
});

registerForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  const name = registerForm.querySelector('input[type="text"]');
  const submitButton = registerForm.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;

  submitButton.textContent = 'Đang tạo tài khoản...';
  submitButton.disabled = true;

  setTimeout(() => {
    submitButton.textContent = `Tài khoản đã tạo cho ${name.value || 'người dùng'}`;
    submitButton.disabled = false;

    setTimeout(() => {
      submitButton.textContent = originalText;
      registerForm.reset();
      switchTab('login');
    }, 1800);
  }, 900);
});
