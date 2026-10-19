const { BadRequestError } = require('../lib/errors');

const MESSAGE = 'Dữ liệu chứa ký tự không hợp lệ (ký tự rỗng \\u0000)';
const NUL = '\u0000';

// PostgreSQL không lưu được NUL trong kiểu text (lỗi 22021 → trước đây trả 500). Chặn một lần ở tầng dùng chung
// cho mọi chuỗi người dùng nhập (body, query, đường dẫn; kể cả khoá của đối tượng) thay vì từng schema.
// Duyệt bằng ngăn xếp thay vì đệ quy để JSON lồng sâu không làm tràn call stack.
function containsNul(root) {
  const stack = [root];
  while (stack.length) {
    const value = stack.pop();
    if (typeof value === 'string') {
      if (value.includes(NUL)) return true;
    } else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key.includes(NUL)) return true;
        stack.push(child);
      }
    }
  }
  return false;
}

function rejectNulBytes(req, _res, next) {
  if (/%00/i.test(req.originalUrl) || containsNul(req.query) || containsNul(req.body)) return next(new BadRequestError(MESSAGE));
  return next();
}

module.exports = { rejectNulBytes, containsNul };
