// Script thường (không phải module) chạy đầu <head> để áp theme trước khi vẽ, tránh nháy sáng/tối.
(function bootTheme() {
  try {
    if (localStorage.getItem('csms-theme') === 'light') document.documentElement.dataset.theme = 'light';
  } catch { /* không đọc được thì dùng giao diện tối mặc định */ }
})();
