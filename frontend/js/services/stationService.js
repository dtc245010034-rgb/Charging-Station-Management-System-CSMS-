import { api } from '../api.js';

const normalizeText = (value) => (value == null ? value : String(value).trim());

export async function listStations() {
  return api('/api/stations');
}

export async function getStation(id) {
  return api(`/api/stations/${id}`);
}

export async function createStation(payload) {
  return api('/api/stations', {
    method: 'POST',
    body: {
      name: normalizeText(payload.name),
      address: normalizeText(payload.address),
      latitude: Number(payload.latitude),
      longitude: Number(payload.longitude),
      status: payload.status || 'INACTIVE',
    },
  });
}

export async function updateStation(id, payload) {
  return api(`/api/stations/${id}`, {
    method: 'PATCH',
    body: {
      name: normalizeText(payload.name),
      address: normalizeText(payload.address),
      latitude: Number(payload.latitude),
      longitude: Number(payload.longitude),
      status: payload.status || 'INACTIVE',
    },
  });
}
