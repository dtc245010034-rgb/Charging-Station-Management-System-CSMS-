const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
process.env.JWT_SECRET ||= 'z'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';

const { csvCell, toCsv } = require('../../src/modules/reports/csv');
const { createHealthMetrics } = require('../../src/modules/health/health-metrics');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');

describe('Chặng 8 pure logic', () => {
  it('CSV adds BOM, doubles embedded quotes, and neutralizes formula-leading text', () => {
    assert.equal(csvCell('=1+1'), "'=1+1");
    assert.equal(csvCell('+cmd'), "'+cmd");
    assert.equal(csvCell('-1'), "'-1");
    assert.equal(csvCell('@name'), "'@name");
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('a"b'), '"a""b"');
    assert.equal(toCsv(['name'], [{ name: 'safe' }]), '\uFEFFname\r\nsafe\r\n');
  });

  it('health metrics aggregate each OCPP call and retain the aggregate until a successful flush', async () => {
    const metrics = createHealthMetrics();
    const minute = new Date('2026-10-17T07:00:00.000Z');
    metrics.recordOcppCall({ durationMs: 25, at: minute });
    metrics.recordOcppCall({ durationMs: 40, failed: true, at: minute });
    const saved = [];
    await metrics.flush({
      query: async (_sql, params) => { saved.push(params); },
    });
    await metrics.flush({ query: async () => assert.fail('a flushed minute must not be saved twice') });

    assert.deepEqual(saved, [['2026-10-17T07:00:00.000Z', 2, 1, 65]]);
  });

  it('health flush preserves OCPP calls arriving during a write and after a database error', async () => {
    const metrics = createHealthMetrics();
    const minute = new Date('2026-10-17T07:00:00.000Z');
    metrics.recordOcppCall({ durationMs: 10, at: minute });
    let release;
    let started;
    const queryStarted = new Promise((resolve) => { started = resolve; });
    const firstFlush = metrics.flush({
      query: async () => {
        started();
        await new Promise((resolve) => { release = resolve; });
      },
    });
    await queryStarted;
    metrics.recordOcppCall({ durationMs: 20, failed: true, at: minute });
    release();
    await firstFlush;

    await assert.rejects(
      metrics.flush({ query: async () => { throw new Error('temporary database error'); } }),
      /temporary database error/
    );
    const retried = [];
    await metrics.flush({ query: async (_sql, params) => { retried.push(params); } });
    assert.deepEqual(retried, [['2026-10-17T07:00:00.000Z', 1, 1, 20]]);
  });

  it('OCPP metrics callback runs once for successful and failed CALL actions', async () => {
    const metrics = [];
    const handler = createOcppMessageHandler({
      requireBoot: false,
      logInfo: () => {},
      logWarning: () => {},
      logError: () => {},
      recordOcppCall: (value) => metrics.push(value),
      handlers: {
        Heartbeat: async () => ({ currentTime: '2026-10-17T07:00:00.000Z' }),
        Fail: async () => { throw new Error('fixture failure'); },
      },
    });
    const connection = { send: (_data, callback) => callback(null) };

    await handler.handleMessage(connection, JSON.stringify([2, 'call-ok', 'Heartbeat', {}]));
    await handler.handleMessage(connection, JSON.stringify([2, 'call-error', 'Fail', {}]));

    assert.equal(metrics.length, 2);
    assert.equal(metrics[0].failed, false);
    assert.equal(metrics[1].failed, true);
    assert.ok(metrics.every((metric) => Number.isSafeInteger(metric.durationMs) && metric.durationMs >= 0));
  });
});
