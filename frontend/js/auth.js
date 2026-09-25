import { api } from './api.js';

export const login = (email, password) => api('/api/auth/login', { method: 'POST', body: { email, password }, redirectOn401: false });
export const register = (data) => api('/api/auth/register', { method: 'POST', body: data, redirectOn401: false });
export const logout = () => api('/api/auth/logout', { method: 'POST', redirectOn401: false });
export const me = (options) => api('/api/auth/me', options);
