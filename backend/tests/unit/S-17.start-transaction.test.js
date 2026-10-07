const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createStartTransactionHandler,
  validateStartTransactionPayload,
} = require('../../src/modules/ocpp/handlers/start-transaction');
const { OcppCallError } = require('../../src/modules/ocpp/frames');
const { maskIdTag } = require('../../src/modules/ocpp/handlers/authorize');

describe('S-17 StartTransaction unit tests (T-37)', () => {
  describe('validateStartTransactionPayload', () => {
    const valid = {
      connectorId: 1,
      idTag: 'VALID-TAG',
      meterStart: 1000,
      timestamp: '2026-10-07T10:00:00.000Z',
    };

    it('payload hợp lệ không ném lỗi', () => {
      assert.doesNotThrow(() => validateStartTransactionPayload(valid));
    });

    it('payload null hoặc không phải object ném FormationViolation', () => {
      assert.throws(() => validateStartTransactionPayload(null), (e) => e instanceof OcppCallError && e.code === 'FormationViolation');
      assert.throws(() => validateStartTransactionPayload('not-an-object'), (e) => e instanceof OcppCallError && e.code === 'FormationViolation');
    });

    it('connectorId không phải số nguyên dương ném PropertyConstraintViolation', () => {
      assert.throws(() => validateStartTransactionPayload({ ...valid, connectorId: 0 }), (e) => e instanceof OcppCallError && e.code === 'PropertyConstraintViolation');
      assert.throws(() => validateStartTransactionPayload({ ...valid, connectorId: -1 }), (e) => e instanceof OcppCallError && e.code === 'PropertyConstraintViolation');
      assert.throws(() => validateStartTransactionPayload({ ...valid, connectorId: 1.5 }), (e) => e instanceof OcppCallError && e.code === 'PropertyConstraintViolation');
      assert.throws(() => validateStartTransactionPayload({ ...valid, connectorId: '1' }), (e) => e instanceof OcppCallError && e.code === 'PropertyConstraintViolation');
    });

    it('idTag rỗng hoặc không phải chuỗi ném FormationViolation', () => {
      assert.throws(() => validateStartTransactionPayload({ ...valid, idTag: '' }), (e) => e instanceof OcppCallError && e.code === 'FormationViolation');
      assert.throws(() => validateStartTransactionPayload({ ...valid, idTag: '   ' }), (e) => e instanceof OcppCallError && e.code === 'FormationViolation');
      assert.throws(() => validateStartTransactionPayload({ ...valid, idTag: 12345 }), (e) => e instanceof OcppCallError && e.code === 'FormationViolation');
    });

    it('idTag dài hơn 20 ký tự ném FormationViolation', () => {
      assert.throws(() => validateStartTransactionPayload({ ...valid, idTag: 'A'.repeat(21) }), (e) => e instanceof OcppCallError && e.code === 'FormationViolation');
    });

    it('meterStart không phải số nguyên >= 0 ném PropertyConstraintViolation', () => {
      assert.throws(() => validateStartTransactionPayload({ ...valid, meterStart: -5 }), (e) => e instanceof OcppCallError && e.code === 'PropertyConstraintViolation');
      assert.throws(() => validateStartTransactionPayload({ ...valid, meterStart: 12.34 }), (e) => e instanceof OcppCallError && e.code === 'PropertyConstraintViolation');
      assert.throws(() => validateStartTransactionPayload({ ...valid, meterStart: '100' }), (e) => e instanceof OcppCallError && e.code === 'PropertyConstraintViolation');
    });

    it('timestamp không hợp lệ ném PropertyConstraintViolation', () => {
      assert.throws(() => validateStartTransactionPayload({ ...valid, timestamp: 'invalid-date' }), (e) => e instanceof OcppCallError && e.code === 'PropertyConstraintViolation');
      assert.throws(() => validateStartTransactionPayload({ ...valid, timestamp: 123456 }), (e) => e instanceof OcppCallError && e.code === 'PropertyConstraintViolation');
    });
  });

  describe('createStartTransactionHandler logic & ACs', () => {
    function createMockEnvironment({
      connectorExists = true,
      tagRecord = { id: 10, tag: 'TAG-VALID', status: 'ACTIVE', expires_at: null, user_id: 99 },
      stationStatus = 'ACTIVE',
      stationLocked = false,
      existingActiveSession = null,
      existingNaturalSession = null,
    } = {}) {
      const dbCalls = {
        orphanMessages: [],
        closedSessions: [],
        insertedSessions: [],
        locks: [],
      };

      let nextSessionId = 100;

      const mockClient = {
        query: async (sql, params) => {
          if (sql.includes('SELECT id FROM connectors WHERE id = $1 FOR UPDATE')) {
            dbCalls.locks.push(params[0]);
            return { rows: [{ id: params[0] }] };
          }
          if (sql.includes('FROM charging_sessions') && sql.includes('id_tag_masked = $3')) {
            if (existingNaturalSession) {
              return { rows: [existingNaturalSession] };
            }
            return { rows: [] };
          }
          if (sql.includes('UPDATE charging_sessions')) {
            dbCalls.closedSessions.push({ sql, params });
            if (existingActiveSession) {
              return { rows: [{ id: existingActiveSession.id }] };
            }
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO charging_sessions')) {
            const sid = nextSessionId++;
            const record = {
              id: sid,
              charge_point_id: params[0],
              connector_id: params[1],
              connector_no: params[2],
              id_tag_id: params[3],
              id_tag_masked: params[4],
              driver_id: params[5],
              meter_start: params[6],
              started_at: params[7],
              status: params[8],
              needs_review: params[9],
              review_reason: params[10],
            };
            dbCalls.insertedSessions.push(record);
            return { rows: [record] };
          }
          return { rows: [] };
        },
        release: () => {},
      };

      const mockPool = {
        query: async (sql, params) => {
          if (sql.includes('SELECT cp.id, cp.code')) {
            return { rows: [{ id: 1, code: 'CP-01', station_id: 10 }] };
          }
          if (sql.includes('FROM connectors c')) {
            if (!connectorExists) return { rows: [] };
            return {
              rows: [{
                connector_id: 5,
                connector_no: 1,
                connector_status: 'AVAILABLE',
                connector_ocpp_status: 'Available',
                charge_point_id: 1,
                charge_point_code: 'CP-01',
                station_id: 10,
                station_status: stationStatus,
                station_locked_at: stationLocked ? new Date() : null,
              }],
            };
          }
          if (sql.includes('FROM id_tags')) {
            if (!tagRecord) return { rows: [] };
            return { rows: [tagRecord] };
          }
          if (sql.includes('INSERT INTO orphan_messages')) {
            dbCalls.orphanMessages.push({ sql, params });
            return { rows: [{ id: 1 }] };
          }
          return { rows: [] };
        },
        connect: async () => mockClient,
      };

      return { mockPool, dbCalls };
    }

    it('AC1: Thẻ hợp lệ + đầu nối rảnh -> phiên CHARGING, Accepted, cấp transactionId', async () => {
      const { mockPool, dbCalls } = createMockEnvironment();
      const fixedNow = new Date('2026-10-07T10:00:00.000Z');
      const handler = createStartTransactionHandler({
        pool: mockPool,
        now: () => fixedNow,
        logInfo: () => {},
        logWarning: () => {},
        logError: () => {},
      });

      const res = await handler(
        {
          connectorId: 1,
          idTag: 'TAG-VALID',
          meterStart: 500,
          timestamp: '2026-10-07T10:00:00.000Z',
        },
        { connection: { chargePoint: { id: 1, code: 'CP-01' } } }
      );

      assert.strictEqual(res.idTagInfo.status, 'Accepted');
      assert.strictEqual(typeof res.transactionId, 'number');
      assert.strictEqual(dbCalls.insertedSessions.length, 1);
      const session = dbCalls.insertedSessions[0];
      assert.strictEqual(session.status, 'CHARGING');
      assert.strictEqual(session.needs_review, false);
      assert.strictEqual(session.review_reason, null);
      assert.strictEqual(session.meter_start, 500);
      assert.strictEqual(session.id_tag_masked, maskIdTag('TAG-VALID'));
      assert.strictEqual(session.driver_id, 99);
    });

    it('AC2: Thẻ bị khoá (Blocked) -> vẫn cấp transactionId, idTagInfo: Blocked, needs_review = true', async () => {
      const { mockPool, dbCalls } = createMockEnvironment({
        tagRecord: { id: 11, tag: 'TAG-BLOCKED', status: 'BLOCKED', expires_at: null, user_id: 50 },
      });
      const fixedNow = new Date('2026-10-07T10:00:00.000Z');
      const handler = createStartTransactionHandler({
        pool: mockPool,
        now: () => fixedNow,
        logInfo: () => {},
        logWarning: () => {},
        logError: () => {},
      });

      const res = await handler(
        {
          connectorId: 1,
          idTag: 'TAG-BLOCKED',
          meterStart: 1200,
          timestamp: '2026-10-07T10:00:00.000Z',
        },
        { connection: { chargePoint: { id: 1, code: 'CP-01' } } }
      );

      assert.strictEqual(res.idTagInfo.status, 'Blocked');
      assert.strictEqual(typeof res.transactionId, 'number');
      const session = dbCalls.insertedSessions[0];
      assert.strictEqual(session.needs_review, true);
      assert.match(session.review_reason, /Tag status: Blocked/);
    });

    it('AC2: Thẻ không tồn tại (Invalid) -> vẫn cấp transactionId, idTagInfo: Invalid, needs_review = true', async () => {
      const { mockPool, dbCalls } = createMockEnvironment({ tagRecord: null });
      const fixedNow = new Date('2026-10-07T10:00:00.000Z');
      const handler = createStartTransactionHandler({
        pool: mockPool,
        now: () => fixedNow,
        logInfo: () => {},
        logWarning: () => {},
        logError: () => {},
      });

      const res = await handler(
        {
          connectorId: 1,
          idTag: 'UNKNOWN-TAG-1234',
          meterStart: 0,
          timestamp: '2026-10-07T10:00:00.000Z',
        },
        { connection: { chargePoint: { id: 1, code: 'CP-01' } } }
      );

      assert.strictEqual(res.idTagInfo.status, 'Invalid');
      assert.strictEqual(typeof res.transactionId, 'number');
      const session = dbCalls.insertedSessions[0];
      assert.strictEqual(session.needs_review, true);
      assert.match(session.review_reason, /Tag status: Invalid/);
      assert.strictEqual(session.driver_id, null);
      assert.strictEqual(session.id_tag_id, null);
      assert.strictEqual(session.id_tag_masked, maskIdTag('UNKNOWN-TAG-1234'));
    });

    it('AC3: Đầu nối còn phiên CHARGING cũ -> phiên cũ đóng ABNORMAL, phiên mới tạo CHARGING', async () => {
      const { mockPool, dbCalls } = createMockEnvironment({
        existingActiveSession: { id: 88 },
      });
      const fixedNow = new Date('2026-10-07T10:00:00.000Z');
      let warned = false;
      const handler = createStartTransactionHandler({
        pool: mockPool,
        now: () => fixedNow,
        logInfo: () => {},
        logWarning: () => { warned = true; },
        logError: () => {},
      });

      const res = await handler(
        {
          connectorId: 1,
          idTag: 'TAG-VALID',
          meterStart: 3000,
          timestamp: '2026-10-07T10:00:00.000Z',
        },
        { connection: { chargePoint: { id: 1, code: 'CP-01' } } }
      );

      assert.strictEqual(res.idTagInfo.status, 'Accepted');
      assert.strictEqual(dbCalls.closedSessions.length, 1);
      assert.strictEqual(warned, true, 'Phải có cảnh báo phiên cũ bị đóng bất thường');
      assert.strictEqual(dbCalls.insertedSessions.length, 1);
      assert.strictEqual(dbCalls.insertedSessions[0].status, 'CHARGING');
    });

    it('Q2: connectorId chưa khai báo -> ghi orphan_messages (đã che idTag) và trả PropertyConstraintViolation', async () => {
      const { mockPool, dbCalls } = createMockEnvironment({ connectorExists: false });
      const handler = createStartTransactionHandler({
        pool: mockPool,
        logInfo: () => {},
        logWarning: () => {},
        logError: () => {},
      });

      await assert.rejects(
        () => handler(
          {
            connectorId: 99,
            idTag: 'RAW-SECRET-TAG-99',
            meterStart: 0,
            timestamp: '2026-10-07T10:00:00.000Z',
          },
          { connection: { chargePoint: { id: 1, code: 'CP-01' } } }
        ),
        (err) => err instanceof OcppCallError && err.code === 'PropertyConstraintViolation'
      );

      assert.strictEqual(dbCalls.orphanMessages.length, 1);
      const orphan = dbCalls.orphanMessages[0];
      const savedPayload = JSON.parse(orphan.params[2]);
      assert.strictEqual(savedPayload.idTag, '*************G-99', 'Mã thẻ trong orphan_messages phải được che 4 ký tự cuối');
      assert.ok(!JSON.stringify(savedPayload).includes('RAW-SECRET-TAG-99'), 'Không được để lọt mã thẻ thô vào orphan_messages');
    });

    it('D6: Đồng hồ trụ lệch quá 24h -> dùng giờ máy chủ và đánh dấu needs_review', async () => {
      const { mockPool, dbCalls } = createMockEnvironment();
      const fixedNow = new Date('2026-10-07T12:00:00.000Z');
      const handler = createStartTransactionHandler({
        pool: mockPool,
        now: () => fixedNow,
        logInfo: () => {},
        logWarning: () => {},
        logError: () => {},
      });

      // Lệch 48h về quá khứ
      const res = await handler(
        {
          connectorId: 1,
          idTag: 'TAG-VALID',
          meterStart: 100,
          timestamp: '2026-10-05T12:00:00.000Z',
        },
        { connection: { chargePoint: { id: 1, code: 'CP-01' } } }
      );

      assert.strictEqual(res.idTagInfo.status, 'Accepted');
      const session = dbCalls.insertedSessions[0];
      assert.strictEqual(session.needs_review, true);
      assert.match(session.review_reason, /Timestamp skewed by more than 24 hours/);
      assert.strictEqual(session.started_at, fixedNow.toISOString());
    });

    it('D4 bug fix: Gửi lại tin StartTransaction cũ (cùng started_at, meter_start, thẻ) không bị đóng thành ABNORMAL', async () => {
      const { mockPool, dbCalls } = createMockEnvironment({
        existingNaturalSession: { id: 77, status: 'CHARGING', needs_review: false, review_reason: null },
      });
      const fixedNow = new Date('2026-10-07T10:00:00.000Z');
      const handler = createStartTransactionHandler({
        pool: mockPool,
        now: () => fixedNow,
        logInfo: () => {},
        logWarning: () => {},
        logError: () => {},
      });

      const res = await handler(
        {
          connectorId: 1,
          idTag: 'TAG-VALID',
          meterStart: 500,
          timestamp: '2026-10-07T10:00:00.000Z',
        },
        { connection: { chargePoint: { id: 1, code: 'CP-01' } } }
      );

      assert.strictEqual(res.transactionId, 77);
      assert.strictEqual(dbCalls.closedSessions.length, 0, 'Tin trùng tự nhiên tuyệt đối không được đóng phiên cũ thành ABNORMAL');
      assert.strictEqual(dbCalls.insertedSessions.length, 0, 'Không insert dòng mới khi đã có phiên trùng tự nhiên');
      assert.strictEqual(dbCalls.locks.length, 1, 'Đầu nối phải được khoá bằng SELECT FOR UPDATE');
    });
  });
});

