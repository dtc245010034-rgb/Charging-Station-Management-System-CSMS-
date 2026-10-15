const path = require('node:path');
const { z } = require('zod');
const { assertNode } = require('./nodeVersion');
try {
  assertNode(process.versions.node);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Test đặt CSMS_SKIP_DOTENV=1 để .env trên máy dev không che các ca "thiếu biến môi trường".
if (!process.env.CSMS_SKIP_DOTENV) require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().min(1),
  LOGIN_IP_MAX_FAILURES: z.coerce.number().int().positive().default(20),
  // Số proxy tin cậy đứng trước app (0 = không tin X-Forwarded-For).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Khoảng nhịp tim OCPP heartbeat interval (giây), mặc định 60 giây theo đặc tả OCPP 1.6
  OCPP_HEARTBEAT_INTERVAL: z.coerce.number().int().positive().default(60),
  // Chu kỳ gửi Ping giữ kết nối WebSocket (giây), mặc định 30 giây (B9)
  OCPP_PING_INTERVAL: z.coerce.number().int().positive().default(30),
  // Giới hạn tần suất tin nhắn cho mỗi kết nối (tin/giây), mặc định 50 (B3)
  OCPP_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(50),
  // Thời gian chờ phản hồi CALL từ trụ (giây), mặc định 30
  OCPP_COMMAND_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
  // Thời gian chờ StopTransaction sau RemoteStopTransaction Accepted, mặc định 2 phút
  REMOTE_STOP_WAIT_SECONDS: z.coerce.number().int().positive().default(120),
  // Thời gian trụ không gửi tin trước khi phiên sạc bị đánh dấu bất thường, mặc định 6 giờ
  SESSION_ABNORMAL_AFTER_SECONDS: z.coerce.number().int().positive().default(21600),
  // Trần chờ trụ rời Finishing/SuspendedEV trước khi chốt phí chiếm chỗ
  IDLE_MAX_WAIT_MIN: z.coerce.number().int().positive().default(60),
  // Chu kỳ job nền thử lại và tìm phiên cần lập hóa đơn
  BILLING_JOB_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  // Khử trùng connector_errors: bỏ qua lỗi y hệt đã ghi trong N giây gần nhất (0 = tắt), mặc định 60
  OCPP_ERROR_DEDUP_SECONDS: z.coerce.number().int().min(0).default(60),
  // Số ngày giữ câu trả lời đã gửi để nhận ra tin OCPP trùng messageId (S-14), mặc định 7
  OCPP_MESSAGE_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  // Cửa sổ phát lại (giây): tin cùng messageId, cùng hành động, cùng nội dung trong cửa sổ này nhận lại câu cũ; ngoài cửa sổ hoặc khác nội dung là tin mới (F8), mặc định 600
  OCPP_DUPLICATE_REPLAY_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  // Thời gian tối đa (giây) một truy vấn của handler OCPP chờ khoá hàng trước khi trả InternalError (F10), mặc định 5
  OCPP_LOCK_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(5),
  // Thời gian tối đa (giây) máy chủ chờ một truy vấn PostgreSQL trả kết quả, áp cho cả hai pool; 0 = không giới hạn, mặc định 30
  // Số luồng SSE tối đa đồng thời cho mỗi tài khoản (vượt thì luồng cũ nhất bị đóng), mặc định 5
  SSE_MAX_CONNECTIONS_PER_USER: z.coerce.number().int().positive().default(5),
  DB_QUERY_TIMEOUT_SECONDS: z.coerce.number().int().min(0).default(30),
  // Giới hạn tần suất trong bộ nhớ (một tiến trình): check-code theo tài khoản, số lần dò email trùng khi đăng ký theo IP, bắt tay OCPP theo (IP, mã trụ)
  CHECK_CODE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
  REGISTER_CONFLICT_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(5),
  OCPP_HANDSHAKE_LIMIT_PER_10S: z.coerce.number().int().positive().default(5),
  // Số dòng ACCESS_DENIED tối đa ghi vào audit_logs mỗi phút cho mỗi tài khoản
  AUDIT_DENIED_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  WALLET_MIN_BALANCE_DONG: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()
  ),
  WALLET_AUDIT_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
  SANDBOX_GATEWAY: z.coerce.number().int().min(0).max(1).default(0),
  PAYMENT_WEBHOOK_SECRET: z.string().min(32).optional(),
  INTERNAL_BASE_URL: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().url().optional()
  ),
  EMAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
}).superRefine((data, ctx) => {
  if (data.SANDBOX_GATEWAY === 1 && (!data.PAYMENT_WEBHOOK_SECRET || data.PAYMENT_WEBHOOK_SECRET.length < 32)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PAYMENT_WEBHOOK_SECRET bắt buộc và phải có ít nhất 32 ký tự khi SANDBOX_GATEWAY=1',
      path: ['PAYMENT_WEBHOOK_SECRET'],
    });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
  console.error(`Cấu hình môi trường không hợp lệ hoặc thiếu: ${names.join(', ')}`);
  process.exit(1);
}

module.exports = parsed.data;
