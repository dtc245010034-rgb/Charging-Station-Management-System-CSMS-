const { describe, it } = require('node:test');
const assert = require('node:assert');
const { errorHandler } = require('../../src/middlewares/errorHandler');
const { NotFoundError } = require('../../src/lib/errors');

function handle(err) {
  const res = { statusCode: null, body: null, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } };
  const orig = console.error;
  console.error = () => {};
  try { errorHandler(err, {}, res, () => {}); } finally { console.error = orig; }
  return res;
}

describe('S-01 errorHandler', () => {
  it('22P02 → 400', () => {
    const r = handle(Object.assign(new Error('invalid input syntax for type bigint: "abc"'), { code: '22P02' }));
    assert.strictEqual(r.statusCode, 400);
    assert.ok(!r.body.error.message.includes('bigint'));
  });

  it('23505 → 409', () => {
    const r = handle(Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), { code: '23505' }));
    assert.strictEqual(r.statusCode, 409);
    assert.ok(!r.body.error.message.includes('users_email_key'));
  });

  it('AppError giữ status, code, message', () => {
    const r = handle(new NotFoundError('Không tìm thấy trạm'));
    assert.strictEqual(r.statusCode, 404);
    assert.deepStrictEqual(r.body, { error: { code: 'NOT_FOUND', message: 'Không tìm thấy trạm' } });
  });

  it('lỗi lạ → 500 message chung, không lộ stack hay nội dung lỗi', () => {
    const r = handle(new Error('connection to server at "10.0.0.5" failed'));
    assert.strictEqual(r.statusCode, 500);
    assert.deepStrictEqual(Object.keys(r.body.error).sort(), ['code', 'message']);
    assert.ok(!JSON.stringify(r.body).includes('10.0.0.5'));
    assert.ok(!JSON.stringify(r.body).includes('at '));
  });
});
