const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatSessionDetails, getSessionById, getCurrentDriverSession } = require('../../src/modules/sessions/sessions.service');
const { ForbiddenError, NotFoundError } = require('../../src/lib/errors');

describe('S-22: sessions.service unit tests', () => {
  it('formatSessionDetails tính toán đầy đủ và chuẩn xác các trường', () => {
    const mockRow = {
      id: 42,
      charge_point_id: 10,
      charge_point_code: 'CP-01',
      station_id: 1,
      station_name: 'Trạm Landmark',
      station_address: 'Quận Bình Thạnh, TP.HCM',
      connector_id: 20,
      connector_no: 1,
      driver_id: 5,
      id_tag_masked: '1234',
      meter_start: 10000,
      meter_stop: null,
      started_at: '2026-10-09T10:00:00Z',
      stopped_at: null,
      stop_reason: null,
      status: 'CHARGING',
      needs_review: false,
      review_reason: null,
      latest_energy_wh: 15500,
      latest_power_w: 22000,
      latest_current_a: 32,
      last_metered_at: '2026-10-09T10:15:00Z',
    };

    const formatted = formatSessionDetails(mockRow);
    assert.strictEqual(formatted.id, 42);
    assert.strictEqual(formatted.station.name, 'Trạm Landmark');
    assert.strictEqual(formatted.charge_point.code, 'CP-01');
    assert.strictEqual(formatted.connector.connector_no, 1);
    assert.strictEqual(formatted.latest_reading.energy_wh, 15500);
    assert.strictEqual(formatted.latest_reading.power_w, 22000);
    assert.strictEqual(formatted.latest_reading.power_kw, 22);
    assert.strictEqual(formatted.latest_reading.current_a, 32);
    assert.strictEqual(formatted.latest_reading.energy_kwh, 5.5); // (15500 - 10000) / 1000
    assert.strictEqual(formatted.latest_reading.sampled_at, '2026-10-09T10:15:00Z');
  });

  it('formatSessionDetails khi phiên mới bắt đầu chưa có meter_values thì energy_kwh = 0', () => {
    const mockRow = {
      id: 43,
      meter_start: 10000,
      meter_stop: null,
      latest_energy_wh: null,
      latest_power_w: null,
      latest_current_a: null,
      last_metered_at: '2026-10-09T10:00:00Z',
    };
    const formatted = formatSessionDetails(mockRow);
    assert.strictEqual(formatted.latest_reading.energy_wh, 10000);
    assert.strictEqual(formatted.latest_reading.energy_kwh, 0);
    assert.strictEqual(formatted.latest_reading.power_kw, null);
  });

  it('getSessionById: ném NotFoundError nếu phiên không tồn tại', async () => {
    const mockDb = {
      query: async () => ({ rows: [] }),
    };
    await assert.rejects(
      async () => getSessionById(999, { id: 1, role: 'DRIVER' }, mockDb),
      NotFoundError
    );
  });

  it('getSessionById: ném ForbiddenError (403) nếu tài xế cố đọc phiên của người khác (NĐ 13)', async () => {
    const mockDb = {
      query: async () => ({
        rows: [{
          id: 50,
          driver_id: 99, // của tài xế 99
          meter_start: 1000,
          status: 'CHARGING',
        }],
      }),
    };
    // Tài xế đăng nhập là id: 5
    await assert.rejects(
      async () => getSessionById(50, { id: 5, role: 'DRIVER', roles: ['DRIVER'] }, mockDb),
      ForbiddenError
    );
  });

  it('getSessionById: cho phép tài xế xem phiên của chính mình', async () => {
    const mockDb = {
      query: async () => ({
        rows: [{
          id: 50,
          driver_id: 5,
          meter_start: 1000,
          latest_energy_wh: 2000,
          status: 'CHARGING',
        }],
      }),
    };
    const session = await getSessionById(50, { id: 5, role: 'DRIVER', roles: ['DRIVER'] }, mockDb);
    assert.strictEqual(session.id, 50);
    assert.strictEqual(session.latest_reading.energy_kwh, 1);
  });

  it('getSessionById: cho phép ADMIN hoặc OPERATOR xem phiên bất kỳ', async () => {
    const mockDb = {
      query: async () => ({
        rows: [{
          id: 50,
          driver_id: 99,
          meter_start: 1000,
          status: 'CHARGING',
        }],
      }),
    };
    const sessionAdmin = await getSessionById(50, { id: 1, role: 'ADMIN', roles: ['ADMIN'] }, mockDb);
    assert.strictEqual(sessionAdmin.id, 50);

    const sessionOperator = await getSessionById(50, { id: 2, role: 'OPERATOR', roles: ['OPERATOR'] }, mockDb);
    assert.strictEqual(sessionOperator.id, 50);
  });

  it('getCurrentDriverSession: trả null nếu tài xế không có phiên CHARGING nào', async () => {
    const mockDb = {
      query: async () => ({ rows: [] }),
    };
    const session = await getCurrentDriverSession({ id: 5 }, mockDb);
    assert.strictEqual(session, null);
  });
});
