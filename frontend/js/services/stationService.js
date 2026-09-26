import { api } from '../api.js';

const normalizeStationPayload = (payload = {}) => {
  const next = { ...payload };
  if (typeof next.name === 'string') next.name = next.name.trim();
  if (typeof next.address === 'string') next.address = next.address.trim();
  if (next.latitude === '' || next.latitude === null || next.latitude === undefined) next.latitude = undefined;
  else next.latitude = Number(next.latitude);
  if (next.longitude === '' || next.longitude === null || next.longitude === undefined) next.longitude = undefined;
  else next.longitude = Number(next.longitude);
  if (next.status === undefined) next.status = 'INACTIVE';
  return next;
};

export const stationService = {
  async list() {
    return api('/api/stations');
  },

  async get(id) {
    return api(`/api/stations/${id}`);
  },

  async create(payload) {
    return api('/api/stations', { method: 'POST', body: normalizeStationPayload(payload) });
  },

  async update(id, payload) {
    return api(`/api/stations/${id}`, { method: 'PATCH', body: normalizeStationPayload(payload) });
  },
};
