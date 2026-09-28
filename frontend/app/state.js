// Store tối giản: set(patch) gộp trạng thái rồi báo cho người đăng ký. Không phụ thuộc thư viện.
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Phiên hiện tại: { user: { id, name, email, roles }, ... }. Vai trò đang dùng lấy từ route (workspace), không lưu ở client.
export const session = createStore({ user: null });
