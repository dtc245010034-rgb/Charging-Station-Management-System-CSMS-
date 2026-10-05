class OcppCommandError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OcppCommandError';
    this.code = code;
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

module.exports = { createCommandSender, OcppCommandError };
