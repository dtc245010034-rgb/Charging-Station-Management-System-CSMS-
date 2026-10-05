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
class UnprocessableEntityError extends AppError {
  constructor(message = 'Trụ sạc từ chối lệnh') { super(422, 'CHARGE_POINT_REJECTED', message); }
}
class GatewayTimeoutError extends AppError {
  constructor(message = 'Trụ sạc không phản hồi kịp thời') { super(504, 'OCPP_CALL_TIMEOUT', message); }
}
class ServiceUnavailableError extends AppError {
  constructor(message = 'Chức năng hiện không khả dụng') { super(503, 'SERVICE_UNAVAILABLE', message); }
}

class TooManyRequestsError extends AppError {
  constructor(retryAfterSec, message = 'Quá nhiều yêu cầu, vui lòng thử lại sau') {
    super(429, 'TOO_MANY_REQUESTS', message);
    this.retryAfterSec = retryAfterSec;
  }
}

module.exports = {
  TooManyRequestsError,
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  GatewayTimeoutError,
  ServiceUnavailableError,
};
