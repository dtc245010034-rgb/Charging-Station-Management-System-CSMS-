// Mọi lời gọi backend của giao diện đi qua đây (một chỗ để đổi khi hợp đồng API đổi).
import { api } from './api.js';

const idempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const health = () => fetch('/api/health', { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('health'))));

export const stations = {
  list: () => api('/api/stations'),
  get: (id) => api(`/api/stations/${encodeURIComponent(id)}`),
  update: (id, body) => api(`/api/stations/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  setLock: (id, locked) => api(`/api/admin/stations/${encodeURIComponent(id)}/lock`, { method: 'PATCH', body: { locked } }),
  // Key sinh một lần cho mỗi lần mở form; gửi lại cùng key khi bấm lưu hai lần → backend không tạo trạm thứ hai.
  newKey: idempotencyKey,
  create: (body, key) => api('/api/stations', { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
};

export const chargePoints = {
  list: () => api('/api/charge-points'),
  get: (id) => api(`/api/charge-points/${encodeURIComponent(id)}`),
  create: (stationId, body) => api(`/api/stations/${encodeURIComponent(stationId)}/charge-points`, { method: 'POST', body }),
  update: (id, body) => api(`/api/charge-points/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  reset: (id, type) => api(`/api/charge-points/${encodeURIComponent(id)}/reset`, { method: 'POST', body: { type } }),
  checkCode: (code) => api(`/api/charge-points/check-code?code=${encodeURIComponent(code)}`),
};

export const remoteStart = {
  chargePoints: () => api('/api/driver/charge-points'),
  start: (connectorId) => api(`/api/connectors/${encodeURIComponent(connectorId)}/start`, { method: 'POST', body: {} }),
  getPendingRequest: () => api('/api/me/remote-start-requests/pending'),
  getRequest: (requestId) => api(`/api/me/remote-start-requests/${encodeURIComponent(requestId)}`),
};

export const fleetStatus = {
  snapshot: () => api('/api/fleet-status'),
};

export const admin = {
  roles: () => api('/api/roles'),
  createUser: (body) => api('/api/admin/users', { method: 'POST', body }),
};
