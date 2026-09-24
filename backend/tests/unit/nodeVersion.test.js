const { describe, it } = require('node:test');
const assert = require('node:assert');
const { assertNode } = require('../../src/config/nodeVersion');

describe('Node phiên bản tối thiểu', () => {
  it('Node < 22.7 → ném lỗi nêu rõ yêu cầu', () => {
    for (const v of ['18.19.1', '20.11.0', '22.6.9', '22.0.0']) assert.throws(() => assertNode(v), /22\.7/, v);
  });
  it('Node >= 22.7 → hợp lệ', () => {
    for (const v of ['22.7.0', '22.23.2', '24.0.0']) assert.doesNotThrow(() => assertNode(v), v);
  });
});
