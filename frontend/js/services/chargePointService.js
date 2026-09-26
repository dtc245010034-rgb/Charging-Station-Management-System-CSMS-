import { api } from '../api.js';

const normalizeChargePointPayload = (payload = {}) => ({
  code: String(payload.code ?? '').trim(),
  status: payload.status ?? 'UNKNOWN',
  connector_count: Number(payload.connectorCount ?? 4),
});

export const chargePointService = {
  async list() {
    return api('/api/charge-points');
  },

  async checkCodeAvailability(code) {
    const clean = String(code ?? '').trim();
    if (!clean) return false;

    const points = await this.list();
    const normalized = clean.toLowerCase();

    return points.some((point) => {
      const sameCode = point.code && String(point.code).trim().toLowerCase() === normalized;
      return sameCode;
    });
  },

  async create(stationId, payload) {
    return api(`/api/stations/${stationId}/charge-points`, {
      method: 'POST',
      body: normalizeChargePointPayload(payload),
    });
  },

  async update(id, payload) {
    return api(`/api/charge-points/${id}`, { method: 'PATCH', body: normalizeChargePointPayload(payload) });
  },
};
