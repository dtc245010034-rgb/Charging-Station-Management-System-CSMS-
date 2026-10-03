// Giới hạn tần suất cửa sổ cố định, lưu trong bộ nhớ tiến trình (kiến trúc hiện là một tiến trình duy nhất).
function createRateLimiter({ limit, windowMs, maxKeys = 10000, now = Date.now }) {
  const entries = new Map();

  function live(key) {
    const entry = entries.get(key);
    if (entry && entry.resetAt > now()) return entry;
    if (entry) entries.delete(key);
    return null;
  }

  function evict() {
    if (entries.size < maxKeys) return;
    const current = now();
    for (const [key, entry] of entries) if (entry.resetAt <= current) entries.delete(key);
    while (entries.size >= maxKeys) entries.delete(entries.keys().next().value);
  }

  function verdict(entry) {
    if (!entry || entry.count < limit) return { allowed: true, retryAfterSec: 0 };
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now()) / 1000)) };
  }

  function hit(key) {
    let entry = live(key);
    if (!entry) {
      evict();
      entry = { count: 0, resetAt: now() + windowMs };
      entries.set(key, entry);
    }
    entry.count += 1;
  }

  return {
    peek: (key) => verdict(live(key)),
    hit,
    take(key) {
      const result = verdict(live(key));
      if (result.allowed) hit(key);
      return result;
    },
    size: () => entries.size,
  };
}

module.exports = { createRateLimiter };
