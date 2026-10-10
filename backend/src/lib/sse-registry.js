const env = require('../config/env');

const streams = new Map(); // userId (chuỗi) -> Set các hàm đóng luồng, theo thứ tự mở (cũ trước)

function safeClose(close) {
  try {
    close();
  } catch {
    // một luồng hỏng không được giữ các luồng còn lại mở
  }
}

// Mỗi tài khoản chỉ giữ tối đa SSE_MAX_CONNECTIONS_PER_USER luồng SSE; luồng mở thêm sẽ đóng luồng cũ nhất
// (EventSource nối lại sau khi rớt mạng không bị từ chối trong lúc luồng cũ chưa kịp được dọn).
function registerStream(userId, close) {
  const key = String(userId);
  const existing = streams.get(key);
  while (existing && existing.size >= env.SSE_MAX_CONNECTIONS_PER_USER) {
    const oldest = existing.values().next().value;
    existing.delete(oldest);
    safeClose(oldest);
  }
  // Lấy lại tập sau khi đóng luồng cũ: hàm release của luồng bị đóng có thể đã xoá tập rỗng khỏi map.
  let set = streams.get(key);
  if (!set) {
    set = new Set();
    streams.set(key, set);
  }
  set.add(close);
  return () => {
    set.delete(close);
    if (set.size === 0 && streams.get(key) === set) streams.delete(key);
  };
}

// Dùng khi token của tài khoản bị thu hồi: mọi luồng đang mở phải đóng ngay.
function closeStreamsOf(userId) {
  const set = streams.get(String(userId));
  if (!set) return;
  for (const close of [...set]) {
    set.delete(close);
    safeClose(close);
  }
  streams.delete(String(userId));
}

const openStreamCount = (userId) => streams.get(String(userId))?.size ?? 0;

module.exports = { registerStream, closeStreamsOf, openStreamCount };
