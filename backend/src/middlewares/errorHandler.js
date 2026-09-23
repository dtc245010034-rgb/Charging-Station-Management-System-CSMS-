const { ZodError } = require('zod');
const { AppError } = require('../lib/errors');

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Lỗi hệ thống';
  let details;

  if (err instanceof AppError) {
    ({ status, code } = err);
    message = err.message;
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = err.issues[0]?.message || 'Dữ liệu không hợp lệ';
    details = err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
  } else if (err.code === '22P02') {
    status = 400;
    code = 'BAD_REQUEST';
    message = 'Dữ liệu không đúng kiểu';
  } else if (err.code === '23505') {
    status = 409;
    code = 'CONFLICT';
    message = 'Dữ liệu đã tồn tại';
  } else if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    status = err.status;
    code = 'BAD_REQUEST';
    message = 'Yêu cầu không hợp lệ';
  }

  if (status >= 500) console.error(err);
  return res.status(status).json({ error: details ? { code, message, details } : { code, message } });
}

module.exports = { errorHandler };
