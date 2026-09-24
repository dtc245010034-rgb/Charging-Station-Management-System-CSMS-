class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Yêu cầu không hợp lệ') { super(400, 'BAD_REQUEST', message); }
}
class UnauthorizedError extends AppError {
  constructor(message = 'Yêu cầu đăng nhập') { super(401, 'UNAUTHORIZED', message); }
}
class ForbiddenError extends AppError {
  constructor(message = 'Không đủ quyền truy cập') { super(403, 'FORBIDDEN', message); }
}
class NotFoundError extends AppError {
  constructor(message = 'Không tìm thấy dữ liệu') { super(404, 'NOT_FOUND', message); }
}
class ConflictError extends AppError {
  constructor(message = 'Dữ liệu đã tồn tại') { super(409, 'CONFLICT', message); }
}

module.exports = { AppError, BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError };
