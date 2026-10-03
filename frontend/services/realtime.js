// Kênh cập nhật thời gian thực. HIỆN TẠI là polling (chỉ tải khi tab đang hiển thị, lùi dần khi lỗi):
// backend chưa có kênh đẩy cho trình duyệt (S-11/T-25 sẽ thêm SSE). Khi có, chỉ thay phần bên trong subscribe()
// — các màn hình vẫn nhận dữ liệu qua cùng một hàm và chỉ cập nhật component bị ảnh hưởng.
export function subscribe(load, onData, { intervalMs = 15000, onError } = {}) {
  let timer = null;
  let stopped = false;
  let failures = 0;
  let inFlight = false;

  async function tick() {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      if (!document.hidden) { onData(await load()); failures = 0; }
    } catch (error) {
      failures += 1;
      onError?.(error);
    } finally {
      inFlight = false;
      if (!stopped) timer = setTimeout(tick, Math.min(intervalMs * 2 ** failures, 120000));
    }
  }

  const onVisible = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
  document.addEventListener('visibilitychange', onVisible);
  tick();

  return {
    refresh: () => { clearTimeout(timer); return tick(); },
    stop() { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); },
  };
}
