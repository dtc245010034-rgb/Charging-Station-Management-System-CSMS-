const {
  ConflictError,
  AppError,
  GatewayTimeoutError,
  ServiceUnavailableError,
  UnprocessableEntityError,
} = require('../../lib/errors');
const { OcppRemoteCallError } = require('./message-handler');

class OcppCommandError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OcppCommandError';
    this.code = code;
  }
}

async function sendRemoteCommand({ commandSender, chargePointCode, action, payload, rejectedMessage, offlineCode = null, offlineMessage = null }) {
  if (!commandSender) throw new ServiceUnavailableError('Chức năng điều khiển từ xa chưa được khởi tạo');

  try {
    const result = await commandSender.send(chargePointCode, action, payload);
    if (result?.status === 'Rejected') {
      throw new UnprocessableEntityError(rejectedMessage || `Trụ sạc từ chối ${action}`);
    }
    if (result?.status !== 'Accepted') {
      throw new ServiceUnavailableError(`Trụ sạc trả phản hồi ${action} không hợp lệ`);
    }
    return result;
  } catch (error) {
    if (error instanceof OcppCommandError && error.code === 'OFFLINE') {
      if (offlineCode) throw new AppError(409, offlineCode, offlineMessage || 'Trụ sạc không có kết nối OCPP');
      throw new ConflictError('Trụ sạc không có kết nối OCPP');
    }
    if (error instanceof OcppRemoteCallError || error?.name === 'OcppRemoteCallError') {
      throw new UnprocessableEntityError(rejectedMessage || `Trụ sạc từ chối ${action}: ${error.message}`);
    }
    if (/^OCPP call timed out:/.test(error?.message || '')) {
      throw new GatewayTimeoutError();
    }
    throw error;
  }
}

// Gửi lệnh CALL từ server xuống trụ đang kết nối (RemoteStart/Stop, Reset...); trụ không có kết nối thì lỗi ngay.
function createCommandSender({ getConnection, sendCall, timeoutMs = 30000 }) {
  return {
    async send(code, action, payload) {
      const connection = getConnection(code);
      if (!connection) throw new OcppCommandError('OFFLINE', 'Trụ sạc không có kết nối OCPP');
      if (connection.readyState !== undefined && connection.readyState !== 1) {
        throw new OcppCommandError('OFFLINE', 'Trụ sạc không có kết nối OCPP');
      }
      return sendCall(connection, action, payload, { timeoutMs });
    },
  };
}

module.exports = { createCommandSender, sendRemoteCommand, OcppCommandError };
