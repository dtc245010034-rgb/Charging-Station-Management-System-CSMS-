import { api } from '../services/api.js';

export const login = (email, password) => api('/api/auth/login', { method: 'POST', body: { email, password }, redirectOn401: false });
export const register = (data) => api('/api/auth/register', { method: 'POST', body: data, redirectOn401: false });
export const logout = () => api('/api/auth/logout', { method: 'POST', redirectOn401: false });
export const me = (options) => api('/api/auth/me', options);

// Một tài khoản có thể có nhiều vai trò: frontend luôn làm việc với danh sách `roles`.
export const toSessionUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  roles: user.roles?.length ? user.roles : [user.role].filter(Boolean),
});
