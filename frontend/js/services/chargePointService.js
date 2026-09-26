import { api } from '../api.js';

export async function listChargePoints() {
  return api('/api/charge-points');
}

export async function getChargePointDetail(id) {
  return api(`/api/charge-points/${id}`);
}

export async function createChargePoint(stationId, payload) {
  return api(`/api/stations/${stationId}/charge-points`, {
    method: 'POST',
    body: {
      code: String(payload.code || '').trim(),
      model: payload.model || null,
      vendor: payload.vendor || null,
      status: payload.status || 'UNKNOWN',
      power_kw: payload.power_kw == null ? undefined : Number(payload.power_kw),
    },
  });
}

export async function updateChargePoint(id, payload) {
  return api(`/api/charge-points/${id}`, {
    method: 'PATCH',
    body: {
      code: String(payload.code || '').trim(),
      model: payload.model || null,
      vendor: payload.vendor || null,
      status: payload.status || 'UNKNOWN',
      power_kw: payload.power_kw == null ? undefined : Number(payload.power_kw),
    },
  });
}
