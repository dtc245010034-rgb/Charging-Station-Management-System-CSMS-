// localStorage chỉ dùng cho tuỳ chọn giao diện sáng/tối; không bao giờ lưu token hay thông tin người dùng.
const KEY = 'csms-theme';
const listeners = new Set();

export const getTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export function setTheme(theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(KEY, theme); } catch { /* vẫn dùng được khi không lưu được */ }
  for (const listener of listeners) listener(theme);
}

export const toggleTheme = () => setTheme(getTheme() === 'light' ? 'dark' : 'light');
export function onThemeChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
