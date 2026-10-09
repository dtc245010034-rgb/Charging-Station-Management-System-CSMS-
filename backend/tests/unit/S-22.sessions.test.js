const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatSession, getCurrentSessionForDriver, getSessionById } = require('../../src/modules/sessions/sessions.service');
const { ForbiddenError, NotFoundError } = require('../../src/lib/errors');

describe('S-22 Unit: sessions.service formatSession & logic', () => {
  it('formatSession: phiên CHARGING chưa có meter values -> current_kwh = 0', () => {
    const row = {
      id: 101,
      charge_point_id: '1',
      charge_point_code: 'CP-01',
      station_id: '1',
      station_name: 'Trạm 1',
      station_address: '123 Phố Huế',
      station_owner_id: '2',
      connector_id: '1',
      connector_no: 1,
      driver_id: '10',
      id_tag_masked: 'ABCD',
      meter_start: '5000',
      meter_stop: null,
      started_at: '2026-10-10T00:00:00.000Z',
      stopped_at: null,
      stop_reason: null,
      status: 'CHARGING',
      needs_review: false,
      review_reason: null,
      latest_energy_wh: null,
      latest_power_w: null,
      latest_current_a: null,
      latest_soc: null,
      latest_sampled_at: null,
      readings: [],
    };

    const formatted = formatSession(row);
    assert.strictEqual(formatted.id, 101);
    assert.strictEqual(formatted.transaction_id, 101);
    assert.strictEqual(formatted.meter_start, 5000);
    assert.strictEqual(formatted.meter_stop, null);
    assert.strictEqual(formatted.current_kwh, 0);
    assert.strictEqual(formatted.status, 'CHARGING');
    assert.strictEqual(formatted.needs_review, false);
  });

  it('formatSession: phiên CHARGING có số đo Energy tăng -> current_kwh tính đúng', () => {
    const row = {
      id: 102,
      charge_point_id: '1',
      charge_point_code: 'CP-01',
      station_id: '1',
      station_name: 'Trạm 1',
      connector_id: '1',
      connector_no: 1,
      driver_id: '10',
      id_tag_masked: 'ABCD',
      meter_start: '10000',
      meter_stop: null,
      started_at: '2026-10-10T00:00:00.000Z',
      status: 'CHARGING',
      latest_energy_wh: '15400',
      latest_power_w: '22000',
      latest_current_a: '32',
      latest_soc: '85',
      latest_sampled_at: '2026-10-10T00:15:00.000Z',
      latest_readings: [{ measurand: 'Power.Active.Import', value: 22000, unit: 'W' }],
    };

    const formatted = formatSession(row);
    assert.strictEqual(formatted.current_kwh, 5.4); // (15400 - 10000) / 1000
    assert.strictEqual(formatted.latest_power_w, 22000);
    assert.strictEqual(formatted.latest_current_a, 32);
    assert.strictEqual(formatted.latest_soc, 85);
  });

  it('formatSession: phiên có số đo lùi -> current_kwh là null (không âm)', () => {
    const row = {
      id: 103,
      meter_start: '10000',
      meter_stop: null,
      status: 'CHARGING',
      latest_energy_wh: '8000', // nhỏ hơn meter_start
      needs_review: true,
      review_reason: 'METER_REGRESSION',
    };

    const formatted = formatSession(row);
    assert.strictEqual(formatted.current_kwh, null);
    assert.strictEqual(formatted.needs_review, true);
  });

  it('formatSession: phiên COMPLETED -> dùng meter_stop để chốt kWh', () => {
    const row = {
      id: 104,
      meter_start: '10000',
      meter_stop: '30000',
      latest_energy_wh: '28000',
      status: 'COMPLETED',
      stop_reason: 'Local',
    };

    const formatted = formatSession(row);
    assert.strictEqual(formatted.current_kwh, 20); // (30000 - 10000) / 1000
    assert.strictEqual(formatted.meter_stop, 30000);
    assert.strictEqual(formatted.status, 'COMPLETED');
  });

  it('getCurrentSessionForDriver: trả về null khi không có user hoặc không tìm thấy phiên', async () => {
    assert.strictEqual(await getCurrentSessionForDriver(null), null);
    assert.strictEqual(await getCurrentSessionForDriver({}), null);

    const mockDb = {
      query: async () => ({ rows: [] }),
    };
    const result = await getCurrentSessionForDriver({ id: 999 }, mockDb);
    assert.strictEqual(result, null);
  });

  it('getSessionById: không tồn tại phiên -> ném NotFoundError (404)', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('SELECT 1 FROM charging_sessions')) return { rows: [] };
        return { rows: [] };
      },
    };

    await assert.rejects(
      async () => getSessionById({ id: 10, role: 'DRIVER' }, 999, mockDb),
      (err) => err instanceof NotFoundError && err.status === 404
    );
  });

  it('getSessionById: tài xế đọc phiên của tài xế khác -> ném ForbiddenError (403 / IDOR)', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('SELECT 1 FROM charging_sessions')) return { rows: [{ '?column?': 1 }] };
        return {
          rows: [{
            id: 200,
            charge_point_id: '1',
            connector_id: '1',
            driver_id: '99', // người khác
            station_owner_id: '2',
            meter_start: '0',
            status: 'CHARGING',
          }],
        };
      },
    };

    let denied = false;
    await assert.rejects(
      async () => getSessionById({ id: 10, role: 'DRIVER', ip: '127.0.0.1' }, 200, {
        db: mockDb,
        onDeny: async () => { denied = true; throw new ForbiddenError(); },
      }),
      (err) => err instanceof ForbiddenError && err.status === 403
    );
    assert.ok(denied, 'phải gọi onDeny khi tài xế đọc phiên của người khác');
  });

  it('getSessionById: tài xế đọc đúng phiên của mình -> thành công', async () => {
    const mockDb = {
      query: async () => ({
        rows: [{
          id: 200,
          charge_point_id: '1',
          connector_id: '1',
          driver_id: '10', // đúng tài xế
          station_owner_id: '2',
          meter_start: '0',
          status: 'CHARGING',
        }],
      }),
    };

    const session = await getSessionById({ id: 10, role: 'DRIVER' }, 200, mockDb);
    assert.strictEqual(session.id, 200);
    assert.strictEqual(session.driver_id, 10);
  });

  it('getSessionById: ADMIN / OPERATOR / ACCOUNTANT đọc được mọi phiên', async () => {
    const mockDb = {
      query: async () => ({
        rows: [{
          id: 200,
          charge_point_id: '1',
          connector_id: '1',
          driver_id: '99',
          station_owner_id: '2',
          meter_start: '0',
          status: 'CHARGING',
        }],
      }),
    };

    for (const role of ['ADMIN', 'OPERATOR', 'ACCOUNTANT']) {
      const session = await getSessionById({ id: 1, role }, 200, mockDb);
      assert.strictEqual(session.id, 200);
    }
  });

  it('getSessionById: STATION_OWNER chỉ đọc phiên ở trạm của mình', async () => {
    const mockDb = {
      query: async () => ({
        rows: [{
          id: 200,
          charge_point_id: '1',
          connector_id: '1',
          driver_id: '99',
          station_owner_id: '5', // chủ sở hữu là 5
          meter_start: '0',
          status: 'CHARGING',
        }],
      }),
    };

    // Chủ đúng trạm (5) -> đọc được
    const allowed = await getSessionById({ id: 5, role: 'STATION_OWNER' }, 200, mockDb);
    assert.strictEqual(allowed.id, 200);

    // Chủ trạm khác (6) -> bị chặn 403
    let denied = false;
    await assert.rejects(
      async () => getSessionById({ id: 6, role: 'STATION_OWNER', ip: '127.0.0.1' }, 200, {
        db: mockDb,
        onDeny: async () => { denied = true; throw new ForbiddenError(); },
      }),
      (err) => err instanceof ForbiddenError && err.status === 403
    );
    assert.ok(denied, 'phải gọi onDeny khi chủ trạm đọc phiên trạm người khác');
  });
});
