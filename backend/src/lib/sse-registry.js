const env = require('../config/env');

const streams = new Map(); // userId (chuỗi) -> Set các hàm đóng luồng, theo thứ tự mở (cũ trước)

// Mỗi tài khoản chỉ giữ tối đa SSE_MAX_CONNECTIONS_PER_USER luồng SSE; luồng mở thêm sẽ đóng luồng cũ nhất
// (EventSource nối lại sau khi rớt mạng không bị từ chối trong lúc luồng cũ chưa kịp được dọn).
function registerStream(userId, close) {
  const key = String(userId);
  let set = streams.get(key);
  if (!set) {
    set = new Set();
    streams.set(key, set);
  }
  while (set.size >= env.SSE_MAX_CONNECTIONS_PER_USER) {
    const oldest = set.values().next().value;
    set.delete(oldest);
    oldest();
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
    close();
  }
  streams.delete(String(userId));
}

const openStreamCount = (userId) => streams.get(String(userId))?.size ?? 0;

module.exports = { registerStream, closeStreamsOf, openStreamCount };
