const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createBootNotificationHandler } = require('../../src/modules/ocpp/handlers/boot-notification');

describe('T-16: BootNotification handler - lưu vendor, model, firmwareVersion và trực tuyến', () => {
  it('lưu đầy đủ vendor, model, firmwareVersion và cập nhật status thành ONLINE', async () => {
    const executedQueries = [];
    const mockPool = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT cp.id')) {
          return {
            rows: [
              { id: 42, code: 'CP-TEST-1', status: 'UNKNOWN', station_id: 1, station_status: 'ACTIVE', locked_at: null },
            ],
          };
        }
        if (sql.includes('UPDATE charge_points')) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      },
    };

    const handler = createBootNotificationHandler({ pool: mockPool });
    const connection = {
      chargePointCode: 'CP-TEST-1',
      chargePoint: { id: 42, code: 'CP-TEST-1', status: 'UNKNOWN' },
    };

    const payload = {
      chargePointVendor: 'Delta',
      chargePointModel: 'UFC200',
      firmwareVersion: 'v2.1.0',
    };

    const response = await handler(payload, { messageId: 'msg-01', connection });

    assert.equal(response.status, 'Accepted');
    assert.equal(connection.isBootAccepted, true);
    assert.equal(connection.chargePoint.status, 'ONLINE');
    assert.equal(connection.chargePoint.vendor, 'Delta');
    assert.equal(connection.chargePoint.model, 'UFC200');
    assert.equal(connection.chargePoint.firmware_version, 'v2.1.0');

    const updateQuery = executedQueries.find((q) => q.sql.includes('UPDATE charge_points'));
    assert.ok(updateQuery, 'Phải thực thi câu lệnh UPDATE charge_points');
    assert.equal(updateQuery.params[0], 'Delta');
    assert.equal(updateQuery.params[1], 'UFC200');
    assert.equal(updateQuery.params[2], 'v2.1.0');
    assert.equal(updateQuery.params[3], 60);
    assert.equal(updateQuery.params[4], 42);
  });

  it('trường thiếu thì lưu rỗng, không từ chối tin nhắn', async () => {
    const executedQueries = [];
    const mockPool = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT cp.id')) {
          return {
            rows: [{ id: 42, code: 'CP-TEST-2', status: 'UNKNOWN', station_id: 1, locked_at: null }],
          };
        }
        return { rowCount: 1, rows: [] };
      },
    };

    const handler = createBootNotificationHandler({ pool: mockPool });
    const connection = {
      chargePointCode: 'CP-TEST-2',
      chargePoint: { id: 42, code: 'CP-TEST-2', status: 'UNKNOWN' },
    };

    // Payload thiếu cả 3 trường
    const response = await handler({}, { messageId: 'msg-02', connection });

    assert.equal(response.status, 'Accepted');
    assert.equal(connection.isBootAccepted, true);
    assert.equal(connection.chargePoint.status, 'ONLINE');
    assert.equal(connection.chargePoint.vendor, '');
    assert.equal(connection.chargePoint.model, '');
    assert.equal(connection.chargePoint.firmware_version, '');

    const updateQuery = executedQueries.find((q) => q.sql.includes('UPDATE charge_points'));
    assert.ok(updateQuery);
    assert.equal(updateQuery.params[0], '');
    assert.equal(updateQuery.params[1], '');
    assert.equal(updateQuery.params[2], '');
  });

  it('gửi BootNotification lần hai trong cùng kết nối: cập nhật bản ghi hiện có, không insert bản ghi mới', async () => {
    let updateCount = 0;
    let insertCount = 0;
    const mockPool = {
      query: async (sql) => {
        if (sql.includes('INSERT INTO charge_points')) insertCount += 1;
        if (sql.includes('UPDATE charge_points')) updateCount += 1;
        if (sql.includes('SELECT cp.id')) {
          return {
            rows: [{ id: 42, code: 'CP-TEST-3', status: 'UNKNOWN', station_id: 1, locked_at: null }],
          };
        }
        return { rowCount: 1, rows: [] };
      },
    };

    const handler = createBootNotificationHandler({ pool: mockPool });
    const connection = {
      chargePointCode: 'CP-TEST-3',
      chargePoint: { id: 42, code: 'CP-TEST-3', status: 'UNKNOWN' },
    };

    // Lần 1
    const res1 = await handler({ chargePointVendor: 'Vendor1', chargePointModel: 'Model1', firmwareVersion: '1.0' }, { messageId: 'm1', connection });
    assert.equal(res1.status, 'Accepted');

    // Lần 2 (cùng kết nối, firmware mới nâng cấp)
    const res2 = await handler({ chargePointVendor: 'Vendor1', chargePointModel: 'Model1', firmwareVersion: '2.0' }, { messageId: 'm2', connection });
    assert.equal(res2.status, 'Accepted');

    assert.equal(insertCount, 0, 'Tuyệt đối không được tạo bản ghi trụ mới');
    assert.equal(updateCount, 2, 'Cả hai lần đều cập nhật vào bản ghi hiện có');
    assert.equal(connection.chargePoint.firmware_version, '2.0');
  });

  it('B2: từ chối các trường vượt quá độ dài quy định trong OCPP 1.6 bằng PropertyConstraintViolation', async () => {
    let queryExecuted = false;
    const mockPool = {
      query: async () => {
        queryExecuted = true;
        return { rows: [] };
      },
    };
    const handler = createBootNotificationHandler({ pool: mockPool });
    const connection = {
      chargePointCode: 'CP-TEST-B2',
      chargePoint: { id: 42, code: 'CP-TEST-B2', status: 'UNKNOWN' },
    };

    // Vendor vượt 20 ký tự
    await assert.rejects(
      handler({ chargePointVendor: 'A'.repeat(21), chargePointModel: 'Model' }, { messageId: 'm-v', connection }),
      (err) => {
        assert.equal(err.code, 'PropertyConstraintViolation');
        assert.match(err.message, /chargePointVendor/);
        return true;
      }
    );
    assert.equal(queryExecuted, false, 'Không được gọi DB khi dữ liệu không hợp lệ');

    // Model vượt 20 ký tự
    await assert.rejects(
      handler({ chargePointVendor: 'Vendor', chargePointModel: 'B'.repeat(21) }, { messageId: 'm-m', connection }),
      (err) => {
        assert.equal(err.code, 'PropertyConstraintViolation');
        assert.match(err.message, /chargePointModel/);
        return true;
      }
    );

    // FirmwareVersion vượt 50 ký tự
    await assert.rejects(
      handler({ chargePointVendor: 'Vendor', chargePointModel: 'Model', firmwareVersion: 'C'.repeat(51) }, { messageId: 'm-f', connection }),
      (err) => {
        assert.equal(err.code, 'PropertyConstraintViolation');
        assert.match(err.message, /firmwareVersion/);
        return true;
      }
    );
  });

  it('B7: khi UPDATE DB thất bại, ném InternalError và không chấp nhận phiên', async () => {
    const mockPool = {
      query: async (sql) => {
        if (sql.includes('SELECT cp.id')) {
          return {
            rows: [{ id: 42, code: 'CP-TEST-B7', status: 'UNKNOWN', station_id: 1, locked_at: null }],
          };
        }
        if (sql.includes('UPDATE charge_points')) {
          throw new Error('Database disk full');
        }
        return { rows: [] };
      },
    };

    const handler = createBootNotificationHandler({ pool: mockPool });
    const connection = {
      chargePointCode: 'CP-TEST-B7',
      isBootAccepted: false,
      chargePoint: { id: 42, code: 'CP-TEST-B7', status: 'UNKNOWN', vendor: null },
    };

    await assert.rejects(
      handler({ chargePointVendor: 'Delta', chargePointModel: 'City' }, { messageId: 'm-b7', connection }),
      (err) => {
        assert.equal(err.code, 'InternalError');
        return true;
      }
    );

    assert.equal(connection.isBootAccepted, false, 'Phiên không được coi là accepted khi DB lỗi');
    assert.equal(connection.chargePoint.status, 'UNKNOWN', 'Trạng thái trụ không được chuyển sang ONLINE');
    assert.equal(connection.chargePoint.vendor, null, 'Dữ liệu không được ghi vào bộ nhớ kết nối');
  });
});
