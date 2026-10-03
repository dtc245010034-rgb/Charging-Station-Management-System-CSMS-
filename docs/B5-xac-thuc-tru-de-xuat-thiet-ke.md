# B5 — Xác thực trụ OCPP: đề xuất thiết kế (chưa có code)

> Trạng thái: **đề xuất, chờ PO Lê Đình Tuấn chọn phương án**. Tài liệu này không đổi hành vi hệ thống. Người soạn: phuc (GYM-37). Cần review thêm của lead dev Nguyễn Văn Hữu vì có migration và quyền mới.

## 1. Vấn đề

`/ocpp/:chargePointCode` chỉ kiểm tra mã trụ có trong CSDL và trạm không bị khoá. Ai biết mã trụ đều kết nối được. Theo S-13, kết nối mới **thay thế** kết nối cũ nên kẻ ẩn danh đá được trụ thật ra khỏi hệ thống. Hậu quả theo ghi nhận của vòng kiểm thử trước (tài liệu này không tự tái hiện lại): trụ thật mất kết nối, trụ giả gửi Boot/StatusNotification/Heartbeat hợp lệ, dữ liệu trạng thái bị ghi đè, `charge_points.status` thành `ONLINE` dù không có trụ thật. Mã trụ không phải bí mật (hiện trên giao diện, nhãn dán trên trụ).

## 2. Hai phương án để PO chọn

| | A. OCPP Security Profile 1 (Basic Auth) | B. Ghi nhận rủi ro cho demo |
|---|---|---|
| Nội dung | Trụ gửi `Authorization: Basic base64(code:secret)` khi bắt tay WebSocket; server kiểm trước khi đăng ký kết nối | Giữ nguyên; ghi rủi ro vào README, chỉ chạy trong mạng tin cậy |
| Chặn được kẻ ẩn danh đá trụ | Có | Không |
| Công sức ước tính | 2–3 ngày (migration, upgrade handler, API cấp/đổi mật khẩu, giao diện hiển thị một lần, test) | 0,5 ngày (chỉ tài liệu) |
| Điều kiện | Trụ thật hỗ trợ Basic Auth; `wss://` ở production | Không dùng cho dữ liệu thật |

Đề xuất của người soạn: **A, bật bằng cờ** để không phá demo (mục 4), đồng thời ghi B vào README trong lúc chờ.

## 3. Thiết kế phương án A

**Dữ liệu (migration 013, có file `.down.sql`):**
- `charge_points.auth_secret_hash TEXT NULL`, `auth_secret_set_at TIMESTAMPTZ NULL`. Không lưu mật khẩu gốc.
- Băm: argon2id qua gói `argon2` đã có sẵn trong `backend/package.json` và đang dùng ở `backend/src/lib/password.js`, nên không thêm phụ thuộc mới; tái sử dụng cùng cách băm và cùng kiểu so khớp chống dò thời gian như mật khẩu người dùng. Không dùng bcrypt vì cắt mật khẩu ở 72 byte.
- Mật khẩu trụ: 24 ký tự ngẫu nhiên (≥ 128 bit entropy), sinh phía server, hiện **một lần** cho người cấp.

**Luồng bắt tay (trong `ocpp-upgrade.js`, trước mọi thay đổi sổ kết nối):**
1. Đọc `Authorization`; `username` phải trùng mã trong URL (không phân biệt hoa thường như `keyFor`).
2. Tra `auth_secret_hash`; so sánh bằng `crypto.timingSafeEqual` trên kết quả scrypt. Trụ không tồn tại, không có hash hoặc sai mật khẩu đều trả cùng một đáp ứng `401` + `WWW-Authenticate: Basic realm="ocpp"`, rồi huỷ socket. Không phân biệt "mã không tồn tại" với "sai mật khẩu" để không dò được mã trụ.
3. Chỉ sau khi xác thực thành công mới gọi `connections.connect`. **Tác động lên S-13:** kết nối thay thế chỉ được chấp nhận sau xác thực; kết nối ẩn danh thất bại không đụng tới sổ kết nối hay CSDL, nên không còn đá được trụ thật.
4. Giới hạn thử sai theo (IP, mã trụ) bằng cơ chế như `login_throttle`; ghi `audit_logs` với hành động `OCPP_AUTH_FAILED`.

**Cấp và đổi mật khẩu:** `POST /api/charge-points/:id/auth-secret` (tạo/đổi, trả mật khẩu một lần), `DELETE` (thu hồi, trụ bị ngắt). Quyền mới `charge_point:manage_secret` cho ADMIN và chủ trạm của trụ đó, thêm vào ma trận quyền một nguồn; **PR chứa quyền này cần lead dev review**. Đổi/thu hồi thì đóng kết nối hiện tại bằng `closeWithGrace`.

## 4. Cờ môi trường và triển khai từng bước

`OCPP_AUTH_MODE`:
- `off` (mặc định, giữ hành vi demo hiện nay);
- `optional`: trụ **đã có** hash thì bắt buộc xác thực, trụ chưa có vẫn vào như cũ (di chuyển dần từng trụ);
- `required`: mọi trụ phải xác thực (production).

Với `required`, từ chối kết nối không qua TLS: kiểm `X-Forwarded-Proto: https` khi `TRUST_PROXY` > 0, nếu không thì từ chối khởi động ở `NODE_ENV=production` trừ khi có cờ rõ ràng. Basic Auth qua `ws://` lộ mật khẩu nên **không** có ý nghĩa nếu thiếu TLS.

## 5. Nghị định 13/2023 và log

- Mật khẩu trụ không phải dữ liệu cá nhân nhưng tuyệt đối không ghi vào log, audit, thông báo lỗi hay ảnh chụp.
- IP của thiết bị gửi sai mật khẩu có thể là dữ liệu cá nhân nếu là IP của cá nhân: chỉ ghi vào `audit_logs` (có kiểm soát truy cập), không ghi vào log ứng dụng; đặt thời hạn lưu theo quy định của dự án.
- Không đưa toạ độ GPS hay thông tin người dùng vào bất kỳ thông điệp xác thực nào.

## 6. Kế hoạch kiểm thử (viết trước, thấy FAIL rồi mới code)

1. Kết nối không có `Authorization` ở chế độ `required` → 401, sổ kết nối không đổi, DB không đổi.
2. Sai mật khẩu và mã không tồn tại cho **cùng** đáp ứng (nội dung và thời gian xấp xỉ).
3. Kẻ ẩn danh khi trụ thật đang ONLINE: trụ thật **không** bị đá, DB vẫn `ONLINE` (hồi quy S-13).
4. Hai kết nối cùng xác thực hợp lệ: kết nối mới thay thế như S-13.
5. Thu hồi mật khẩu đóng kết nối hiện tại; đổi mật khẩu thì mật khẩu cũ bị từ chối.
6. `optional`: trụ chưa có hash vẫn vào; trụ có hash thì bắt buộc.
7. Mật khẩu không xuất hiện trong log/audit (kiểm bằng chuỗi cố định).

## 7. Câu hỏi cho PO

1. Chọn A hay B cho đợt demo? Nếu A, mốc bật `required` ở môi trường nào?
2. Trụ thật của khách hàng (nếu có) hỗ trợ Basic Auth hay cần mTLS (Profile 3) về sau?
3. Ai được cấp/đổi mật khẩu trụ: chỉ ADMIN hay cả chủ trạm?
4. Thời hạn lưu IP trong `audit_logs` là bao lâu?
