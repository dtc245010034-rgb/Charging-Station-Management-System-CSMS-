const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createHeartbeatHandler } = require('../../src/modules/ocpp/handlers/heartbeat');

describe('Heartbeat: HeartbeatRequest phải là {}', () => {
  const handler = createHeartbeatHandler({ now: () => '2026-10-03T00:00:00.000Z' });

  it('payload rỗng → trả currentTime', async () => {
    assert.deepEqual(await handler({}), { currentTime: '2026-10-03T00:00:00.000Z' });
  });

  for (const [name, payload] of [['có trường lạ', { a: 1 }], ['mảng', []], ['chuỗi', 'x'], ['null', null], ['không có payload', undefined]]) {
    it(`payload ${name} → FormationViolation`, async () => {
      await assert.rejects(() => handler(payload), (error) => error.name === 'OcppCallError' && error.code === 'FormationViolation');
    });
  }
});
