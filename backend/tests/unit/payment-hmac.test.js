const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeSignature, verifySignature } = require('../../src/modules/payments/hmac');
const { getPaymentGateway } = require('../../src/modules/payments/gateway');
const { sandboxGateway } = require('../../src/modules/payments/sandbox-sim');

describe('GYM-65 / S-39: HMAC payment signature & gateway interface', () => {
  const SECRET = 'test-secret-0123456789abcdef0123456789abcd';
  const BODY = '{"orderRef":"TU-TEST0001","gatewayTxnId":"GW-0001","status":"SUCCESS","amountDong":200000}';
  const EXPECTED_SIG = '9ebe7fed7a6ad38ea54953ed44873910aabfa8d4146c1f269b46783e3d98be68';

  it('khớp chính xác vector chữ ký cố định của đặc tả (bảng G)', () => {
    const sig = computeSignature(SECRET, BODY);
    assert.strictEqual(sig, EXPECTED_SIG);
  });

  it('verifySignature trả về true khi chữ ký khớp chính xác', () => {
    assert.strictEqual(verifySignature(SECRET, BODY, EXPECTED_SIG), true);
    // Nhận cả hoa hoặc thường
    assert.strictEqual(verifySignature(SECRET, BODY, EXPECTED_SIG.toUpperCase()), true);
  });

  it('verifySignature trả về false khi thân bị đổi 1 ký tự', () => {
    const tamperedBody = '{"orderRef":"TU-TEST0001","gatewayTxnId":"GW-0001","status":"SUCCESS","amountDong":200001}';
    assert.strictEqual(verifySignature(SECRET, tamperedBody, EXPECTED_SIG), false);
  });

  it('verifySignature trả về false khi chữ ký bị sửa 1 ký tự', () => {
    const badSig = EXPECTED_SIG.slice(0, -1) + (EXPECTED_SIG.slice(-1) === '8' ? '9' : '8');
    assert.strictEqual(verifySignature(SECRET, BODY, badSig), false);
  });

  it('verifySignature trả về false khi chữ ký thiếu, sai định dạng hoặc khác độ dài', () => {
    assert.strictEqual(verifySignature(SECRET, BODY, null), false);
    assert.strictEqual(verifySignature(SECRET, BODY, undefined), false);
    assert.strictEqual(verifySignature(SECRET, BODY, ''), false);
    assert.strictEqual(verifySignature(SECRET, BODY, 'short-sig'), false);
    assert.strictEqual(verifySignature(SECRET, BODY, 'g'.repeat(64)), false); // non-hex
  });

  it('verifySignature trả về false khi secret thiếu hoặc rỗng', () => {
    assert.strictEqual(verifySignature('', BODY, EXPECTED_SIG), false);
    assert.strictEqual(verifySignature(null, BODY, EXPECTED_SIG), false);
  });

  it('gateway interface trả về sandboxGateway adapter mặc định', () => {
    const gateway = getPaymentGateway('SANDBOX');
    assert.strictEqual(gateway, sandboxGateway);
    assert.strictEqual(typeof gateway.createPayment, 'function');
    assert.strictEqual(typeof gateway.verifyWebhook, 'function');
  });

  it('sandboxGateway.createPayment trả về redirectUrl đúng định dạng', () => {
    const res = sandboxGateway.createPayment({ orderRef: 'TU-1234567890abcdef', amountDong: 200000 });
    assert.strictEqual(res.redirectUrl, '/sandbox-gateway/pay?order=TU-1234567890abcdef');
  });

  it('sandboxGateway.verifyWebhook kiểm tra chữ ký và giải mã payload an toàn', () => {
    const valid = sandboxGateway.verifyWebhook({ rawBody: BODY, signature: EXPECTED_SIG, secret: SECRET });
    assert.strictEqual(valid.valid, true);
    assert.deepStrictEqual(valid.payload, {
      orderRef: 'TU-TEST0001',
      gatewayTxnId: 'GW-0001',
      status: 'SUCCESS',
      amountDong: 200000,
    });

    const invalid = sandboxGateway.verifyWebhook({ rawBody: BODY, signature: 'bad', secret: SECRET });
    assert.strictEqual(invalid.valid, false);
  });
});
