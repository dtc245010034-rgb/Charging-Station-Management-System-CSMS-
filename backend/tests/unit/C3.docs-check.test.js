const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkSummary } = require('../../../tools/check-docs');

describe('C3: tools/check-docs.js kiểm TONG-KET-DU-AN.md', () => {
  it('tài liệu thật hợp lệ: 66 thẻ, mọi tệp test được nhắc đều có trong repo', () => {
    const { problems, rows } = checkSummary();
    assert.deepStrictEqual(problems, []);
    assert.strictEqual(rows, 66);
  });

  const withDoc = (text) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c3-')), 'doc.md');
    fs.writeFileSync(file, text);
    return checkSummary(file);
  };

  it('bắt tên tệp test không tồn tại', () => {
    const { problems } = withDoc('## 1. Bảng Tổng Hợp 1 Thẻ\n| S-01 | GYM-7 | x | Done | `acceptance/S-20.invoicing.test.js` `auth.test.js` |\n');
    assert.deepStrictEqual(problems, ['Tệp kiểm thử không tồn tại: acceptance/S-20.invoicing.test.js', 'Tệp kiểm thử không tồn tại: auth.test.js']);
  });

  it('bắt tiêu đề không khớp số dòng của bảng', () => {
    const { problems } = withDoc('## 1. Bảng Tổng Hợp 39 Thẻ\n| S-01 | GYM-7 | x | Done | - |\n| S-02 | GYM-8 | y | Done | - |\n');
    assert.deepStrictEqual(problems, ['Tiêu đề ghi 39 thẻ nhưng bảng có 2 dòng']);
  });
});
