const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthorizeHandler, evaluateIdTag, maskIdTag } = require('../../src/modules/ocpp/handlers/authorize');
const { createCommandSender, OcppCommandError } = require('../../src/modules/ocpp/commands');
const { OcppCallError } = require('../../src/modules/ocpp/frames');

describe('S-15 Authorize unit tests', () => {
  const mockPool = {
    query: async (sql, params) => {
      if (sql.includes('FROM id_tags')) {
        const tag = params[0];
        if (tag === 'ACTIVE-TAG') return { rows: [{ id: 1, tag, status: 'ACTIVE', expires_at: null }] };
        if (tag === 'BLOCKED-TAG') return { rows: [{ id: 2, tag, status: 'BLOCKED', expires_at: null }] };
        if (tag === 'EXPIRED-TAG') return { rows: [{ id: 3, tag, status: 'ACTIVE', expires_at: '2020-01-01T00:00:00Z' }] };
        return { rows: [] };
      }
      if (sql.includes('FROM stations')) {
        return { rows: [{ id: 10, status: 'ACTIVE', locked_at: null }] };
      }
      return { rows: [] };
    },
  };

  const handler = createAuthorizeHandler({ pool: mockPool, logWarning: () => {}, logInfo: () => {}, logError: () => {} });

  it('thẻ hợp lệ trả về Accepted', async () => {
    assert.deepEqual(await handler({ idTag: 'ACTIVE-TAG' }), { idTagInfo: { status: 'Accepted' } });
  });

  it('thẻ bị khoá trả về Blocked', async () => {
    assert.deepEqual(await handler({ idTag: 'BLOCKED-TAG' }), { idTagInfo: { status: 'Blocked' } });
  });

  it('thẻ quá hạn trả về Expired', async () => {
    assert.deepEqual(await handler({ idTag: 'EXPIRED-TAG' }), { idTagInfo: { status: 'Expired' } });
  });

  it('thẻ không có trong DB hoặc thiếu idTag trả về Invalid', async () => {
    assert.deepEqual(await handler({ idTag: 'UNKNOWN-TAG' }), { idTagInfo: { status: 'Invalid' } });
    assert.deepEqual(await handler({ idTag: '' }), { idTagInfo: { status: 'Invalid' } });
    assert.deepEqual(await handler({}), { idTagInfo: { status: 'Invalid' } });
  });

  it('thẻ dài hơn 20 ký tự ném OcppCallError FormationViolation', async () => {
    await assert.rejects(
      () => handler({ idTag: 'A'.repeat(21) }),
      (err) => err instanceof OcppCallError && err.code === 'FormationViolation'
    );
  });

  it('maskIdTag che giấu thông tin thẻ, chỉ hiện tối đa 4 ký tự cuối', () => {
    assert.equal(maskIdTag('12345678'), '****5678');
    assert.equal(maskIdTag('1234'), '1234');
    assert.equal(maskIdTag('99'), '99');
  });

  it('evaluateIdTag là hàm thuần xuất ra được', () => {
    assert.equal(typeof evaluateIdTag, 'function');
    assert.equal(evaluateIdTag({ tagRecord: { status: 'ACTIVE' }, station: { status: 'ACTIVE' } }), 'Accepted');
    assert.equal(evaluateIdTag({ tagRecord: { status: 'BLOCKED' }, station: { status: 'ACTIVE' } }), 'Blocked');
    assert.equal(evaluateIdTag({ tagRecord: { status: 'ACTIVE' }, station: { status: 'INACTIVE' } }), 'Blocked');
    assert.equal(evaluateIdTag({ tagRecord: null }), 'Invalid');
  });
});

describe('commands: gửi lệnh từ server xuống trụ (nền cho S-16)', () => {
  it('trụ không có kết nối: báo lỗi OFFLINE ngay, không chờ hết thời gian', async () => {
    let called = false;
    const sender = createCommandSender({ getConnection: () => undefined, sendCall: async () => { called = true; } });
    const started = Date.now();
    await assert.rejects(() => sender.send('CP-1', 'RemoteStartTransaction', { idTag: 'X' }), (error) => {
      assert.ok(error instanceof OcppCommandError);
      assert.equal(error.code, 'OFFLINE');
      return true;
    });
    assert.ok(Date.now() - started < 100);
    assert.equal(called, false);
  });

  it('socket đã đóng: báo OFFLINE và không gửi CALL xuống trụ', async () => {
    let called = false;
    const sender = createCommandSender({
      getConnection: () => ({ readyState: 3 }),
      sendCall: async () => { called = true; },
    });
    await assert.rejects(() => sender.send('CP-1', 'Reset', { type: 'Soft' }), (error) => error.code === 'OFFLINE');
    assert.equal(called, false);
  });

  it('trụ đang kết nối: chuyển đúng kết nối, hành động, nội dung và thời gian chờ', async () => {
    const connection = { id: 'ws-1' };
    const seen = [];
    const sender = createCommandSender({
      getConnection: (code) => (code === 'CP-1' ? connection : undefined),
      sendCall: async (conn, action, payload, options) => { seen.push([conn, action, payload, options]); return { status: 'Accepted' }; },
      timeoutMs: 7000,
    });
    assert.deepEqual(await sender.send('CP-1', 'Reset', { type: 'Soft' }), { status: 'Accepted' });
    assert.deepEqual(seen, [[connection, 'Reset', { type: 'Soft' }, { timeoutMs: 7000 }]]);
  });

  it('lỗi từ trụ hoặc hết thời gian được chuyển nguyên cho nơi gọi', async () => {
    const sender = createCommandSender({ getConnection: () => ({}), sendCall: async () => { throw new Error('OCPP call timed out: Reset'); } });
    await assert.rejects(() => sender.send('CP-1', 'Reset', {}), /timed out/);
  });
});
