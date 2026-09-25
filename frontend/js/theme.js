const toggle = document.getElementById('themeToggle');

function apply(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  if (toggle) {
    toggle.setAttribute('aria-label', isLight ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng');
    const icon = toggle.querySelector('.theme-icon');
    const label = toggle.querySelector('.theme-label');
    if (icon) icon.textContent = isLight ? '🌙' : '☀️';
    if (label) label.textContent = isLight ? 'Tối' : 'Sáng';
  }
  try { localStorage.setItem('csms-theme', theme); } catch { /* giao diện vẫn dùng được khi không lưu được */ }
}

let saved = 'dark';
try { saved = localStorage.getItem('csms-theme') || 'dark'; } catch { /* mặc định giao diện tối */ }
apply(saved);

toggle?.addEventListener('click', () => apply(document.body.classList.contains('light-theme') ? 'dark' : 'light'));
