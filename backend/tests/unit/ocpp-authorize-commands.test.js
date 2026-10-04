const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthorizeHandler } = require('../../src/modules/ocpp/handlers/authorize');
const { createCommandSender, OcppCommandError } = require('../../src/modules/ocpp/commands');

describe('Authorize (ghim hành vi hiện tại trước khi S-15 thay bằng tra bảng id_tags)', () => {
  const authorize = createAuthorizeHandler();

  it('có idTag thì Accepted, thiếu hoặc rỗng thì Invalid', async () => {
    assert.deepEqual(await authorize({ idTag: 'ABC123' }), { idTagInfo: { status: 'Accepted' } });
    assert.deepEqual(await authorize({ idTag: '' }), { idTagInfo: { status: 'Invalid' } });
    assert.deepEqual(await authorize({}), { idTagInfo: { status: 'Invalid' } });
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
