const { prepare } = require('../../db/pool');

const WINDOW = "interval '15 minutes'";

const isLocked = async (keys) =>
  Boolean(await prepare('SELECT 1 FROM login_throttle WHERE key = ANY(?) AND locked_until > now() LIMIT 1').get(keys));

// Một câu lệnh duy nhất nên cập nhật nguyên tử, không mất đếm khi nhiều request song song.
// Hết cửa sổ (và không còn khoá) thì đếm lại từ 1; đạt `max` thì khoá 15 phút.
const recordFailure = (key, max) => prepare(`
  INSERT INTO login_throttle AS t (key, failed_count, window_started_at, locked_until)
  VALUES (?, 1, now(), CASE WHEN 1 >= ? THEN now() + ${WINDOW} END)
  ON CONFLICT (key) DO UPDATE SET
    failed_count = CASE WHEN t.window_started_at <= now() - ${WINDOW} AND COALESCE(t.locked_until <= now(), TRUE)
                        THEN 1 ELSE t.failed_count + 1 END,
    window_started_at = CASE WHEN t.window_started_at <= now() - ${WINDOW} AND COALESCE(t.locked_until <= now(), TRUE)
                             THEN now() ELSE t.window_started_at END,
    locked_until = CASE
      WHEN (CASE WHEN t.window_started_at <= now() - ${WINDOW} AND COALESCE(t.locked_until <= now(), TRUE) THEN 1 ELSE t.failed_count + 1 END) >= ?
        THEN now() + ${WINDOW}
      WHEN t.window_started_at <= now() - ${WINDOW} AND COALESCE(t.locked_until <= now(), TRUE) THEN NULL
      ELSE t.locked_until END,
    updated_at = CURRENT_TIMESTAMP
  RETURNING failed_count, locked_until
`).get(key, max, max);

const clear = (key) => prepare('DELETE FROM login_throttle WHERE key = ?').run(key);

module.exports = { isLocked, recordFailure, clear };
