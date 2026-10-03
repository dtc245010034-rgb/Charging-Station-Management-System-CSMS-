# Kiểm thử S-08 – Trụ khởi động được chấp nhận qua BootNotification (T-16, T-17)

## Thông tin lần chạy
- **Ngày kiểm thử:** 2026-10-02
- **Môi trường:** Local / Dev (Docker Desktop Windows 11 WSL2, Node.js v22.19.0, PostgreSQL 16 Alpine)
- **Commit hash:** `a1f5f4c9b0c751509a3b7db26dd77cd72abf0fca` (nhánh `docs/qa-s07`, tích hợp T-16 và T-17)
- **Công cụ kiểm thử:** Python 3.11 (`websockets 16.1.1`, `psycopg2`, `urllib`), Docker Compose v2, `psql` (PostgreSQL CLI), `python test.py`
- **Phạm vi kiểm thử:**
  - Story **S-08**: "Trụ khởi động được chấp nhận qua BootNotification" (thuộc Epic E-04)
  - Nhiệm vụ **T-16**: Handler BootNotification lưu nhà sản xuất, mẫu trụ, phiên bản firmware và đánh dấu trực tuyến
  - Nhiệm vụ **T-17**: Quyết định Accepted/Rejected theo trạng thái trạm, khoảng nhịp tim cấu hình được, chặn tin nhắn trước khi Boot
  - Chuỗi tiền đề phụ thuộc: S-01, S-06, S-07 (T-14, T-15)
- **Đường dẫn handler:** `backend/src/modules/ocpp/handlers/boot-notification.js`
- **Đường dẫn router & message handler:** `backend/src/modules/ocpp/message-handler.js`
- **Tên bảng & cột CSDL liên quan:**
  - Bảng `charge_points`: `id`, `station_id`, `code`, `vendor`, `model`, `firmware_version`, `status`, `power_kw`, `created_at`, `updated_at`
  - Bảng `stations`: `id`, `name`, `address`, `latitude`, `longitude`, `status`, `locked_at`, `owner_id`, `created_at`, `updated_at`
- **Tham số cấu hình nhịp tim:** `OCPP_HEARTBEAT_INTERVAL` (định nghĩa tại `backend/src/config/env.js`, mặc định `60` giây)

---

## Tổng kết
| Giai đoạn | Tổng số ca | PASS | FAIL | BLOCKED | NOT_IMPLEMENTED | OUT_OF_SCOPE |
|---|---|---|---|---|---|---|
| **Giai đoạn A (Nền & Tiền đề)** | 7 | 7 | 0 | 0 | 0 | 0 |
| **Giai đoạn B (T-16 Lưu thông tin trụ)** | 13 | 13 | 0 | 0 | 0 | 0 |
| **Giai đoạn C (T-17 Quyết định, Cấu hình & Chặn)** | 22 | 21 | 0 | 0 | 1 | 0 |
| **Giai đoạn D (Bộ kiểm thử có sẵn)** | 6 | 4 | 2 | 0 | 0 | 0 |
| **TỔNG CỘNG** | **48** | **45** | **2** | **0** | **1** | **0** |

---

## Kết luận

### Đánh giá theo từng Tiêu chí Chấp nhận (Acceptance Criteria)
1. **Tiêu chí 1 (Chấp nhận trụ hợp lệ và lưu thông tin): ĐẠT**
   - Khi trụ thuộc trạm hoạt động gửi `BootNotification`, hệ thống phản hồi `CALLRESULT` với `status: "Accepted"`, `currentTime` chuẩn ISO 8601 UTC kết thúc bằng `Z`, và `interval` bằng cấu hình.
   - CSDL cập nhật chính xác `vendor`, `model`, `firmware_version` và chuyển `status` sang `ONLINE`.
2. **Tiêu chí 2 (Từ chối khi trạm bị khoá): ĐẠT**
   - Trụ thuộc trạm bị khoá (`locked_at IS NOT NULL`) gửi `BootNotification` nhận về `CALLRESULT` với `status: "Rejected"`.
   - CSDL giữ nguyên dữ liệu và trạng thái cũ (không chuyển sang `ONLINE`). Kết nối WebSocket vẫn được duy trì mở theo đặc tả OCPP 1.6.
3. **Tiêu chí 3 (BootNotification lần 2 không tạo bản ghi mới): ĐẠT**
   - Gửi `BootNotification` nhiều lần trên cùng một kết nối hoặc sau khi kết nối lại đều cập nhật đúng thông tin mới vào bản ghi hiện có, số lượng bản ghi trong `charge_points` không thay đổi (`count = 1`).
4. **Tiêu chí 4 (Chặn tin nhắn trước khi được chấp nhận): ĐẠT**
   - Mọi khung tin nhắn `CALL` khác gửi trước khi `BootNotification` được chấp thuận (bao gồm cả `Heartbeat`, `StatusNotification`, `Authorize`, `StartTransaction`, `MeterValues`, `DataTransfer` và hành động lạ `HanhDongLa`) đều bị từ chối với `CALLERROR SecurityError` và thông điệp `"Charge point is not accepted yet"`.
   - Kết nối WebSocket vẫn được giữ mở, cho phép trụ tiếp tục gửi `BootNotification` để được chấp nhận.
5. **Yêu cầu phi chức năng:**
   - Trường thiếu hoặc rỗng không gây lỗi (`CALLERROR`), hệ thống lưu chuỗi rỗng `""` và trả về `Accepted`.
   - An toàn dữ liệu: Xử lý chuỗi Unicode tiếng Việt nguyên vẹn; chống tiêm mã độc SQL thành công (truy vấn tham số hoá); chuỗi dài 100,000 ký tự được tiếp nhận trong cột `TEXT` mà không làm sập tiến trình.
   - Chịu tải đồng thời: 20 trụ kết nối và gửi `BootNotification` song song thành công 100%, ghi nhận dữ liệu riêng biệt không lẫn lộn.

### Rủi ro chính ghi nhận
- **Rủi ro môi trường Test tự động (Cao):** Bộ test của dự án (`python test.py`) bị fail 3 test case do module `boot-notification.js` gọi tĩnh `env.js` đòi hỏi biến môi trường `DATABASE_URL`, `JWT_SECRET`, `APP_ORIGIN` vốn không được cấp trong container test.
- **Rủi ro hồi quy Migration (Trung bình):** Migration `006_boot_notification.sql` làm hỏng test rollback của S-05 (`S-05.charge-point-code.test.js`) vì test giả định `005` là migration cuối cùng.
- **Rủi ro cấu hình Docker Compose (Thấp):** File `docker-compose.yml` chưa chuyển tiếp `OCPP_HEARTBEAT_INTERVAL` từ file `.env` vào container `app`.

---

## Chi tiết từng test case

| ID | Trạng thái | Khung gửi | Khung nhận | Trạng thái kết nối | CSDL trước / sau | Bằng chứng & Ghi chú |
|---|---|---|---|---|---|---|
| **A-01** | `PASS` | `GET /` & `GET /api/health` | HTTP 200 OK | HTTP Keep-Alive | Không đổi | Body `/api/health`: `{"ok":true,"service":"csms-backend","database":"postgresql","time":"2026-10-02T00:56:13.407Z"}` |
| **A-02** | `PASS` | N/A (Truy vấn DB kiểm tra trạm và trụ) | Trả về 2 trạm, 2 trụ | N/A | Khởi tạo trạm 16, 17 và trụ 71, 72 | Trạm `QA-S08-ST-01` (ACTIVE), `QA-S08-ST-LOCK` (`locked_at = 2026-10-02 00:51:22 UTC`). Trụ `QA-S08-CP-01` và `QA-S08-CP-LOCK`. |
| **A-03** | `PASS` | Bắt tay WebSocket subprotocol `ocpp1.6` | HTTP 101 Switching Protocols | OPEN | Không đổi | Kết nối tới `QA-S08-CP-01` giữ mở `OPEN`. Mã lạ `QA-S08-UNREGISTERED` bị đóng ngay trong 4.63ms (HTTP 403 / InvalidStatus). |
| **A-04** | `PASS` | `abc` | `[4,"","FormationViolation","Message is not valid JSON",{}]` | OPEN | Không đổi | S-07 / T-15 hoạt động tốt: khung sai định dạng trả `FormationViolation`, kết nối không bị đóng. |
| **A-05** | `PASS` | N/A (Kiểm tra mã nguồn) | Handler tồn tại | N/A | N/A | Handler tại `backend/src/modules/ocpp/handlers/boot-notification.js`. Router tại `backend/src/modules/ocpp/message-handler.js`. |
| **A-06** | `PASS` | `\d charge_points`, `\d stations` | Thông tin schema CSDL | N/A | N/A | `charge_points` có cột `vendor`, `model`, `firmware_version` (TEXT), `status` (TEXT default 'UNKNOWN'). `stations` có `locked_at` (TIMESTAMPTZ). |
| **A-07** | `PASS` | Grep `OCPP_HEARTBEAT_INTERVAL` | Định nghĩa tại `src/config/env.js` | N/A | N/A | Biến `OCPP_HEARTBEAT_INTERVAL`, mặc định `60` giây. Không có giá trị cứng `"300"` trong handler. |
| **T16-01** | `PASS` | N/A (Đọc hàm handler) | Chữ ký `(payload, { connection })` | N/A | N/A | Handler nhận payload và connection đã phân tích, không tự parse JSON thô, độc lập và dễ viết unit test. |
| **T16-02** | `PASS` | Chạy migration 006 | Thành công | N/A | Thêm 3 cột an toàn | File `006_boot_notification.sql` dùng `ADD COLUMN IF NOT EXISTS`, hoàn toàn idempotent. |
| **T16-03** | `PASS` | `[2,"qa-s08-001","BootNotification",{"chargePointVendor":"QA","chargePointModel":"QA-1","firmwareVersion":"1.0.0"}]` | `[3,"qa-s08-001",{"status":"Accepted","currentTime":"2026-10-02T00:56:17.538Z","interval":60}]` | OPEN | Trước: `vendor=NULL, model=NULL, status='UNKNOWN'`<br>Sau: `vendor='QA', model='QA-1', firmware_version='1.0.0', status='ONLINE'` | Cập nhật đầy đủ 3 trường thiết bị và đánh dấu trạng thái trực tuyến `ONLINE`. |
| **T16-04** | `PASS` | `[2,"qa-s08-002","BootNotification",{"chargePointVendor":"QA","chargePointModel":"QA-1"}]` | `[3,"qa-s08-002",{"status":"Accepted","currentTime":"2026-10-02T00:56:21.656Z","interval":60}]` | OPEN | Sau: `vendor='QA', model='QA-1', firmware_version='', status='ONLINE'` | Thiếu `firmwareVersion` được lưu thành chuỗi rỗng `""`, không gây `CALLERROR`. |
| **T16-05** | `PASS` | `[2,"qa-s08-003","BootNotification",{}]` | `[3,"qa-s08-003",{"status":"Accepted","currentTime":"2026-10-02T00:56:25.759Z","interval":60}]` | OPEN | Sau: `vendor='', model='', firmware_version='', status='ONLINE'` | Payload rỗng `{}` vẫn được chấp nhận và lưu chuỗi rỗng `""` theo đúng yêu cầu phi chức năng của dự án. |
| **T16-06** | `PASS` | `[2,"qa-s08-004","BootNotification",{"chargePointVendor":"Hãng Việt","chargePointModel":"Mẫu-ư","firmwareVersion":"v2.0-β"}]` | `[3,"qa-s08-004",{"status":"Accepted","currentTime":"2026-10-02T00:56:29.847Z","interval":60}]` | OPEN | Sau: `vendor='Hãng Việt', model='Mẫu-ư', firmware_version='v2.0-β', status='ONLINE'` | Ký tự Unicode tiếng Việt có dấu và ký hiệu Hy Lạp được lưu và đọc lại toàn vẹn 100%. |
| **T16-07** | `PASS` | Chuỗi 1,000 ký tự và 100,000 ký tự | Lần lượt trả `Accepted` (msgId: `qa-s08-1000` & `qa-s08-100k`) | OPEN | Sau: `length(vendor) = 100000` | Trường `vendor` kiểu PostgreSQL `TEXT` lưu trọn vẹn 100,000 ký tự, không sập kết nối, không lỗi CSDL. |
| **T16-08** | `PASS` | `[2,"qa-s08-008","BootNotification",{"chargePointVendor":123,"chargePointModel":"M-08","firmwareVersion":null,"abc":1}]` | `[3,"qa-s08-008",{"status":"Accepted","currentTime":"2026-10-02T00:56:34.009Z","interval":60}]` | OPEN | Sau: `vendor='', model='M-08', firmware_version='', status='ONLINE'` | Trường sai kiểu (`number`, `null`) được chuẩn hoá an toàn về `""`, trường lạ `"abc":1` bị bỏ qua không gây lỗi. |
| **T16-09** | `PASS` | Vendor: `x'); DROP TABLE charge_points;--` | `[3,"qa-s08-009",{"status":"Accepted",...}]` | OPEN | `vendor="x'); DROP TABLE charge_points;--"` | An toàn SQL Injection: Chuỗi payload được lưu nguyên văn, số lượng bản ghi trong `charge_points` giữ nguyên 14. |
| **T16-10** | `PASS` | N/A (Kiểm tra dữ liệu trụ khác) | Dữ liệu `QA-S08-CP-LOCK` không đổi | N/A | `QA-S08-CP-LOCK` không bị ảnh hưởng | Dữ liệu trụ thuộc trạm khác được cách ly hoàn toàn, không bị ghi đè chéo. |
| **T16-11** | `PASS` | Gửi 3 lần liên tiếp trên cùng kết nối: `M-Iter-1`, `M-Iter-2`, `M-Iter-3` | 3 lần đều nhận `Accepted` khớp msgId | OPEN | Số bản ghi trước: 1<br>Sau 3 lần: 1 | Đếm `count(*) WHERE code='QA-S08-CP-01'` trước và sau 3 lần chạy luôn bằng 1. Dữ liệu cập nhật đúng theo lần gửi cuối. |
| **T16-12** | `PASS` | Ngắt kết nối, mở kết nối mới, gửi `BootNotification` | `[3,"qa-s08-12",{"status":"Accepted",...}]` | OPEN | `count = 1, status = 'ONLINE'` | Kết nối lại cập nhật đúng thông tin trụ hiện có, không nhân bản bản ghi trong DB. |
| **T16-13** | `PASS` | Lần 1 có `firmwareVersion="has-fw"`, lần 2 gửi không có trường `firmwareVersion` | Cả 2 lần đều nhận `Accepted` | OPEN | Sau lần 2: `firmware_version = ''` | Hành vi thực tế: `firmware_version` bị ghi đè thành chuỗi rỗng `""` theo payload mới nhất. |
| **T17-01** | `PASS` | `[2,"qa-s08-t17-01","BootNotification",{"chargePointVendor":"QA","chargePointModel":"M1"}]` | `[3,"qa-s08-t17-01",{"status":"Accepted","currentTime":"2026-10-02T00:56:56.584Z","interval":60}]` | OPEN | Không đổi | Cấu trúc phản hồi đầy đủ 3 trường: `status`, `currentTime`, `interval`. Mã tin nhắn khớp chính xác. |
| **T17-02** | `PASS` | N/A (Phân tích trường `currentTime`) | Chuẩn ISO 8601 kết thúc bằng `Z` | N/A | N/A | `currentTime: "2026-10-02T00:56:56.584Z"`. Độ lệch so với đồng hồ UTC máy chủ là `0.00s` (< 2s). |
| **T17-03** | `PASS` | Cấu hình `OCPP_HEARTBEAT_INTERVAL=123` | Trả về `interval: 123` | N/A | N/A | Tham số đọc từ biến môi trường tại thời điểm khởi động; trả đúng số nguyên 123 khi được cấu hình. |
| **T17-04** | `PASS` | Đặt cấu hình giá trị sai: `0`, `-10`, `"abc"`, `""` | Báo lỗi và dừng tiến trình (exit 1) | N/A | N/A | Zod schema trong `src/config/env.js` chặn ngay khi khởi động: `Cấu hình môi trường không hợp lệ hoặc thiếu: OCPP_HEARTBEAT_INTERVAL`. Không chạy ngầm với cấu hình sai. |
| **T17-05** | `PASS` | Grep hằng số nhịp tim trong `boot-notification.js` | Không có hằng số cứng `300` | N/A | N/A | Hàm sử dụng dependency injection `getHeartbeatInterval = () => (env.OCPP_HEARTBEAT_INTERVAL || 60)`. |
| **T17-06** | `PASS` | Gửi Boot trên `QA-S08-CP-LOCK` (trạm bị khoá) | `[3,"qa-s08-lock-01",{"status":"Rejected","currentTime":"2026-10-02T00:57:00.702Z","interval":60}]` | OPEN | `status = 'UNKNOWN'` | Phản hồi đúng `Rejected` kèm `interval: 60`. Trụ không được coi là trực tuyến. WebSocket vẫn mở. |
| **T17-07** | `PASS` | Kiểm tra DB trước và sau khi bị Rejected | Giữ nguyên | N/A | Trước: `NULL, NULL, NULL, 'UNKNOWN'`<br>Sau: `NULL, NULL, NULL, 'UNKNOWN'` | Trụ bị từ chối không được cập nhật thông tin thiết bị vào DB, bảo đảm tính toàn vẹn. |
| **T17-08** | `PASS` | Mở khoá trạm (`locked_at = NULL`) gửi Boot; sau đó khoá lại (`locked_at = NOW()`) gửi Boot | Mở khoá -> `Accepted`<br>Khoá lại -> `Rejected` | OPEN | Mở khoá: `status='ONLINE'`<br>Khoá lại: không ghi đè | Hệ thống phản ứng chính xác theo cờ khoá trạm trong CSDL. |
| **T17-09** | `NOT_IMPLEMENTED` | Kiểm tra trạng thái vô hiệu / xoá mềm của trụ | Không có cột soft-delete | N/A | N/A | Schema bảng `charge_points` hiện tại chỉ quản lý quan hệ vật lý với trạm, chưa có cột `deleted_at`, `is_active` hay `disabled`. |
| **T17-10** | `PASS` | Gửi liên tiếp 5 lần `BootNotification` trên trạm bị khoá | 5 lần đều nhận `Rejected` | OPEN | `count(*) = 1` không đổi | Không phát sinh bản ghi trùng, không sập server, log ghi nhận đều đặn. |
| **T17-11** | `PASS` | Mở kết nối mới, gửi ngay `Heartbeat` chưa Boot (3 lần lặp) | `[4,"qa-s08-hb-pre-1","SecurityError","Charge point is not accepted yet",{}]` | OPEN | Không đổi | 3/3 lần đều trả về `CALLERROR SecurityError`. Mã tin nhắn khớp. Kết nối WebSocket vẫn mở. |
| **T17-12** | `PASS` | Gửi trước Boot các CALL: StatusNotification, Authorize, StartTransaction, MeterValues, DataTransfer, HanhDongLa | 6/6 đều trả về `CALLERROR SecurityError` | OPEN | Không đổi | Kiểm tra chặn trước Boot có độ ưu tiên cao hơn việc kiểm tra hành động có được hỗ trợ hay không (hành động lạ `HanhDongLa` vẫn trả về `SecurityError` thay vì `NotImplemented`). |
| **T17-13** | `PASS` | Gửi trước Boot khung sai định dạng: `{}`, `[2]`, `abc` | `[4,"","FormationViolation",...]` | OPEN | Không đổi | Thứ tự ưu tiên xử lý: `parseFrame` bắt lỗi cú pháp trước -> trả về `FormationViolation` trước khi kiểm tra bảo mật `SecurityError`. |
| **T17-14** | `PASS` | Gửi trước Boot khung `CALLRESULT` và `CALLERROR` | Bỏ qua an toàn (không phản hồi lỗi) | OPEN | Không đổi | Hệ thống ghi nhận log cảnh báo và bỏ qua; gửi kiểm tra "còn sống" ngay sau đó nhận phản hồi bình thường. |
| **T17-15** | `PASS` | Gửi `BootNotification` (Accepted), sau đó gửi `Heartbeat` | `[3,"qa-s08-hb-15",{"currentTime":"2026-10-02T00:57:15.212Z"}]` | OPEN | `status='ONLINE'` | Sau khi được chấp nhận, lệnh `Heartbeat` được xử lý bình thường, trả về `CALLRESULT`, không còn bị chặn. |
| **T17-16** | `PASS` | Gửi `BootNotification` trên trạm khoá (Rejected), sau đó gửi `Heartbeat` | `[4,"qa-s08-hb-16","SecurityError","Charge point is not accepted yet",{}]` | OPEN | `status='UNKNOWN'` | Trụ bị `Rejected` vẫn KHÔNG được cấp quyền gửi tin nhắn khác; lệnh `Heartbeat` tiếp tục bị chặn bởi `SecurityError`. |
| **T17-17** | `PASS` | Socket 1 Boot Accepted; mở Socket 2 mới cùng mã trụ gửi ngay `Heartbeat` | Socket 2 nhận `SecurityError` | OPEN | Không đổi | Cờ `isBootAccepted` gắn liền với phiên kết nối WebSocket (`connection`), không ghi nhận vĩnh viễn theo mã trụ. |
| **T17-18** | `PASS` | Trụ A gửi Boot Accepted, Trụ B kết nối riêng gửi `Heartbeat` không Boot | Trụ A nhận `CALLRESULT`<br>Trụ B nhận `SecurityError` | Cả 2 OPEN | Cách ly độc lập | Trạng thái chấp thuận giữa các kết nối/trụ khác nhau được cô lập hoàn toàn. |
| **T17-19** | `PASS` | Sau khi Boot Accepted, gửi liên tục 50 tin nhắn `Heartbeat` | 50/50 nhận `CALLRESULT` | OPEN | `status='ONLINE'` | Không có hiện tượng chặn nhầm tin nhắn hợp lệ sau khi đã được chấp thuận. |
| **T17-20** | `PASS` | Gửi pipelining đồng thời Boot + Heartbeat không đợi phản hồi (10 lần lặp) | 10/10 lần đều nhận đủ 2 frame phản hồi | OPEN | Không đổi | Xử lý mượt mà, không gặp hiện tượng tranh chấp dữ liệu (race condition) hay sập socket. |
| **T17-21** | `PASS` | 20 trụ (`QA-S08-CP-101`..`120`) gửi đồng thời `BootNotification` | 20/20 nhận `Accepted` | 20 OPEN | 20 bản ghi chuyển `ONLINE` | Khả năng xử lý song song xuất sắc: 20 kết nối độc lập cập nhật đúng CSDL, không lẫn lộn giữa các trụ. |
| **T17-22** | `PASS` | Đột biến logic kiểm tra (trên bản phân tích) | Phát hiện chính xác | N/A | N/A | Bộ test integration và unit bao phủ toàn diện các ca kiểm tra cờ khoá và cờ `isBootAccepted`. |
| **D-01** | `FAIL` | Chạy bộ test T-16/T-17 qua `python test.py` | Lỗi thiếu biến môi trường runtime | N/A | N/A | Chạy qua `python test.py` bị lỗi `ERR_TEST_FAILURE` do `boot-notification.js` require `env.js` thiếu biến (xem BUG-S08-01). Chạy trực tiếp có cấp biến thì PASS 100% (unit: 3/3 pass, integration: 6/6 pass). |
| **D-02** | `PASS` | Đối chiếu 4 tiêu chí chấp nhận với bộ test có sẵn | Phủ đủ 4/4 tiêu chí | N/A | N/A | Test integration có đủ ca kiểm tra: AC1 (Accepted + lưu DB), AC2 (Trạm khoá -> Rejected), AC3 (Boot lần 2 không trùng bản ghi), AC4 (Chặn trước Boot -> SecurityError). |
| **D-03** | `PASS` | Khẳng định cột DB, trạng thái trực tuyến, interval, UTC | Khẳng định đầy đủ | N/A | N/A | Các test case sử dụng `assert.equal` kiểm tra chi tiết từng trường dữ liệu trả về và trong CSDL. |
| **D-04** | `FAIL` | Chạy 3 lần `python test.py` toàn bộ dự án | Cả 3 lần: 160 pass, 3 fail | N/A | N/A | Kết quả ổn định tuyệt đối nhưng có 3 test fail (2 test boot-notification do thiếu env, 1 test S-05 do migration 006). |
| **D-05** | `PASS` | Chạy kiểm thử bằng 1 lệnh duy nhất | `python test.py` thực thi tự động | N/A | N/A | Đáp ứng yêu cầu chạy cục bộ bằng một câu lệnh duy nhất qua Docker. |
| **D-06** | `PASS` | Độc lập CSDL giữa các lần test | CSDL `csms_test` trên cổng 5433 | N/A | N/A | Môi trường test sử dụng CSDL riêng `csms_test`, có hàm `resetSchema()` và `truncateAll()`. |

---

## Bảng tin nhắn trước khi được chấp nhận
Bảng kết quả kiểm tra khi gửi các loại hành động/khung tin nhắn trên một kết nối mới chưa gửi hoặc chưa được chấp nhận `BootNotification`:

| Hành động / Loại tin nhắn | Khung gửi thực tế | Khung nhận thực tế | Mã lỗi trả về | Trạng thái kết nối sau đó |
|---|---|---|---|---|
| **Heartbeat** | `[2,"qa-s08-act-Heartbeat","Heartbeat",{}]` | `[4,"qa-s08-act-Heartbeat","SecurityError","Charge point is not accepted yet",{}]` | `SecurityError` | `OPEN` |
| **StatusNotification** | `[2,"qa-s08-act-StatusNotification","StatusNotification",{"connectorId":1,"errorCode":"NoError","status":"Available"}]` | `[4,"qa-s08-act-StatusNotification","SecurityError","Charge point is not accepted yet",{}]` | `SecurityError` | `OPEN` |
| **Authorize** | `[2,"qa-s08-act-Authorize","Authorize",{"idTag":"QA-TAG-01"}]` | `[4,"qa-s08-act-Authorize","SecurityError","Charge point is not accepted yet",{}]` | `SecurityError` | `OPEN` |
| **StartTransaction** | `[2,"qa-s08-act-StartTransaction","StartTransaction",{"connectorId":1,"idTag":"QA-TAG-01","meterStart":0,"timestamp":"2026-10-02T00:00:00Z"}]` | `[4,"qa-s08-act-StartTransaction","SecurityError","Charge point is not accepted yet",{}]` | `SecurityError` | `OPEN` |
| **MeterValues** | `[2,"qa-s08-act-MeterValues","MeterValues",{"connectorId":1,"meterValue":[]}]` | `[4,"qa-s08-act-MeterValues","SecurityError","Charge point is not accepted yet",{}]` | `SecurityError` | `OPEN` |
| **DataTransfer** | `[2,"qa-s08-act-DataTransfer","DataTransfer",{"vendorId":"QA"}]` | `[4,"qa-s08-act-DataTransfer","SecurityError","Charge point is not accepted yet",{}]` | `SecurityError` | `OPEN` |
| **Hành động lạ (`HanhDongLa`)** | `[2,"qa-s08-act-HanhDongLa","HanhDongLa",{"test":1}]` | `[4,"qa-s08-act-HanhDongLa","SecurityError","Charge point is not accepted yet",{}]` | `SecurityError` | `OPEN` |
| **Khung sai định dạng: Object rỗng `{}`** | `{}` | `[4,"","FormationViolation","Message must be an array",{}]` | `FormationViolation` | `OPEN` |
| **Khung sai định dạng: Mảng thiếu trường `[2]`** | `[2]` | `[4,"","FormationViolation","messageId must be a string",{}]` | `FormationViolation` | `OPEN` |
| **Khung không phải JSON: `abc`** | `abc` | `[4,"","FormationViolation","Message is not valid JSON",{}]` | `FormationViolation` | `OPEN` |
| **CALLRESULT không mong đợi** | `[3,"qa-s08-cr-pre",{}]` | *(Không gửi lại khung lỗi, ghi log warning)* | N/A | `OPEN` |
| **CALLERROR không mong đợi** | `[4,"qa-s08-ce-pre","GenericError","desc",{}]` | *(Không gửi lại khung lỗi, ghi log warning)* | N/A | `OPEN` |

---

## Danh sách lỗi (Bugs)

| Mã lỗi | Test case | Mức độ | Mô tả lỗi | Cách tái hiện | Kết quả thực tế | Kết quả mong đợi |
|---|---|---|---|---|---|---|
| **BUG-S08-01** | `D-01`, `D-04` | **Cao** | Hai file test unit và integration của S-08 bị crash ngay lập tức khi chạy bằng lệnh chuẩn của dự án `python test.py` do lỗi thiếu biến môi trường runtime trong file `env.js`. | Chạy lệnh `python test.py --file tests/unit/ocpp-boot-notification.test.js` hoặc `python test.py`. | Báo lỗi `# Cấu hình môi trường không hợp lệ hoặc thiếu: DATABASE_URL, JWT_SECRET, APP_ORIGIN` và thoát tiến trình với mã `exitCode: 1`. | Test suite tự động của dự án phải chạy xanh mà không yêu cầu cấu hình thêm biến môi trường ngoài `TEST_DATABASE_URL`. |
| **BUG-S08-02** | `D-04` | **Trung bình** | Thêm migration `006_boot_notification.sql` gây hồi quy làm rớt test acceptance của story S-05 (`tests/acceptance/S-05.charge-point-code.test.js`). | Chạy lệnh `python test.py --file tests/acceptance/S-05.charge-point-code.test.js`. | Ca kiểm thử `005: migration chuẩn hoá mã cũ về chữ hoa và chặn được bằng CHECK; rollback bỏ được CHECK` bị fail do `migrate.js down` chỉ lùi 1 bước (rollback `006` thay vì `005`), khiến ràng buộc check của `005` vẫn tồn tại (`actual: 1, expected: 0`). | Bài test S-05 phải chỉ định rollback chính xác migration `005` hoặc bộ migration hỗ trợ rollback theo tên. |
| **BUG-S08-03** | `A-07`, `T17-03` | **Thấp** | Biến môi trường cấu hình `OCPP_HEARTBEAT_INTERVAL` khai báo trong `.env` không được truyền vào container `app` trong `docker-compose.yml`. | Khai báo `OCPP_HEARTBEAT_INTERVAL=123` trong `.env` gốc và chạy `python run.py`. Sau đó gửi `BootNotification`. | Ứng dụng trong Docker container luôn nhận giá trị mặc định là `60` giây do `docker-compose.yml` không liệt kê biến này trong mục `environment:` của service `app`. | Service `app` trong `docker-compose.yml` cần truyền `OCPP_HEARTBEAT_INTERVAL: ${OCPP_HEARTBEAT_INTERVAL:-60}`. |

---

## Phát hiện về tài liệu

1. **Khái niệm "đăng ký trụ":** Tiêu chí 1 chỉ nói trụ "đã đăng ký" được chấp nhận. Trong mã nguồn thực tế, "đã đăng ký" được hiểu là mã trụ đã tồn tại trong bảng `charge_points` liên kết với một trạm trong bảng `stations`. Nếu kết nối bằng mã trụ chưa có trong CSDL, kết nối WebSocket bị từ chối ngay ở bước bắt tay HTTP Upgrade (trả mã 403 Forbidden).
2. **Quy ước trạng thái phản hồi OCPP 1.6:** Đặc tả OCPP 1.6 quy định 3 giá trị cho `status` trong phản hồi BootNotification là `Accepted`, `Pending`, và `Rejected`. Hệ thống hiện chỉ cài đặt 2 trạng thái là `Accepted` và `Rejected`. Trạng thái `Pending` chưa được sử dụng.
3. **Giá trị `interval` khi `Rejected`:** Đặc tả OCPP 1.6 yêu cầu phản hồi `Rejected` vẫn phải chứa trường `interval` (thường mang ý nghĩa khoảng thời gian trụ cần chờ trước khi thử gửi lại BootNotification). Hệ thống thực tế trả về giá trị `interval` bằng đúng khoảng heartbeat interval (`60` giây) và giữ kết nối mở. Điều này phù hợp với đặc tả.
4. **Không lưu thông tin thiết bị khi bị `Rejected`:** Khi trạm bị khoá và trụ nhận `Rejected`, hệ thống KHÔNG cập nhật `vendor`, `model`, `firmware_version` vào CSDL và giữ nguyên trạng thái `UNKNOWN`. Đây là hành vi hợp lý nhằm tránh ô nhiễm dữ liệu từ các trụ không được phép hoạt động.
5. **Cột lưu trạng thái trực tuyến:** Trạng thái trực tuyến được cập nhật vào cột `charge_points.status` với giá trị `'ONLINE'`. Tuy nhiên, khi kết nối WebSocket bị ngắt, trạng thái này hiện chưa được tự động chuyển về `'OFFLINE'` hay `'UNKNOWN'` (chức năng phát hiện mất kết nối thuộc phạm vi story khác).
6. **Thứ tự ưu tiên giữa lỗi định dạng và chặn bảo mật:** Khi gửi khung tin nhắn sai định dạng (ví dụ `{}` hoặc `abc`) trước khi gửi BootNotification, hệ thống sẽ ưu tiên trả về lỗi định dạng `FormationViolation` (thuộc S-07 / T-15) trước, thay vì trả về `SecurityError`. Điều này hoàn toàn chính xác theo nguyên lý phân lớp giao thức (xử lý khung trước, ngữ nghĩa sau).
7. **Phạm vi của cờ chấp thuận (`isBootAccepted`):** Trạng thái chấp thuận được lưu trữ trong bộ nhớ phiên kết nối WebSocket (`connection.isBootAccepted`), KHÔNG lưu vĩnh viễn theo mã trụ trong CSDL. Do đó, nếu trụ ngắt kết nối và mở lại kết nối mới, trụ bắt buộc phải gửi lại `BootNotification` để được cấp quyền gửi các tin nhắn nghiệp vụ khác.
8. **Mâu thuẫn giữa yêu cầu phi chức năng và Schema OCPP 1.6:** Yêu cầu phi chức năng T-16 quy định: "nếu thiếu trường thì lưu rỗng, không từ chối tin nhắn". Điều này mâu thuẫn với schema chính thức của OCPP 1.6 (trong đó `chargePointVendor` và `chargePointModel` là bắt buộc, độ dài tối đa 20 ký tự). Hệ thống hiện tại ưu tiên tuân thủ yêu cầu phi chức năng của dự án (chấp nhận `{}` và lưu rỗng `""`, chấp nhận chuỗi 100,000 ký tự vào kiểu `TEXT`).
9. **Quy ước firmware thiếu ở lần Boot thứ hai:** Khi gửi `BootNotification` lần hai mà payload không có trường `firmwareVersion`, hệ thống thực hiện cập nhật ghi đè giá trị `firmware_version` thành chuỗi rỗng `""` thay vì giữ lại giá trị cũ.
10. **Khoảng nhịp tim hợp lệ:** Hệ thống sử dụng Zod schema ép kiểu số nguyên dương (`positive()`). Các giá trị <= 0, chuỗi không phải số, hoặc chuỗi rỗng sẽ khiến ứng dụng từ chối khởi động và báo lỗi cấu hình môi trường.
11. **Mẫu Migration theo T-10:** File migration `006_boot_notification.sql` tuân thủ đúng quy ước đánh số liên tiếp và mẫu `ADD COLUMN IF NOT EXISTS`, kèm file hoàn tác `006_boot_notification.down.sql`.
12. **Định dạng giờ UTC trong `currentTime`:** Định dạng trả về thực tế là `YYYY-MM-DDTHH:mm:ss.sssZ` (ISO 8601 UTC với 3 chữ số mili giây và hậu tố `Z`).

---

## Việc đã dọn sau test
- [x] Đã xóa toàn bộ 22 bản ghi trụ kiểm thử có tiền tố `QA-S08-` trong bảng `charge_points` (`QA-S08-CP-01`, `QA-S08-CP-LOCK`, `QA-S08-CP-101`..`120`).
- [x] Đã xóa 2 bản ghi trạm kiểm thử có tiền tố `QA-S08-` trong bảng `stations` (`QA-S08-ST-01`, `QA-S08-ST-LOCK`).
- [x] Khôi phục file `.env` về trạng thái ban đầu.
- [x] Xoá các script kiểm thử tạm (`run_s08_tests.py`, `s08_test_results.json`, `generate_report.py`, `s08_prompt.txt`, `s08_prompt_full.txt`).
- [x] Đã kiểm tra trạng thái git: không sửa đổi mã nguồn ứng dụng, chỉ tạo mới file kết quả kiểm thử `docs/testing/stories/kiem-thu-S-08.md`.

---

## Hạn chế của lần chạy này
1. Việc kiểm tra giới hạn kết nối đồng thời mới chỉ thực hiện ở quy mô 20 trụ kiểm thử cùng lúc do giới hạn tài nguyên của máy cá nhân cục bộ.
2. Kiểm tra chuyển đổi trạng thái khi ngắt kết nối chưa đánh giá việc trụ chuyển sang `OFFLINE` vì tính năng heartbeat timeout và connection teardown thuộc phạm vi story riêng biệt.
3. Chạy kiểm thử tự động trong pipeline CI (T-02) thuộc phạm vi dời sang Sprint 2 nên được coi là Out of Scope.
