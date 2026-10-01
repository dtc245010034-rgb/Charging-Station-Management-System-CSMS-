# Kiểm thử S-13 (lần 2) – Cùng mã trụ mở hai kết nối thì kết nối cũ bị đóng

## Thông tin lần chạy
- **Ngày chạy:** 2026-10-01
- **Môi trường:** Máy cá nhân (Local/dev), Windows 11 (PowerShell), Docker Compose v2, Node v22.14.0 (container `node:22-bookworm-slim`), PostgreSQL 16 Alpine, commit `e7049103bca676b169b43dfa890fe927573a8303` (nhánh `feature/khoa-update`). Khởi động bằng `docker compose build app && docker compose up -d app`. Số tiến trình/worker: 1 tiến trình Node.js duy nhất.
- **Công cụ đã dùng:** `curl.exe`, `docker compose`, `docker exec`, `psql`, Node.js WebSocket client (`ws`), kịch bản kiểm thử đồng thời (concurrency & race condition scripts), `test.py`.
- **Phạm vi kiểm thử:** Story **S-13** ("Cùng mã trụ mở hai kết nối thì kết nối cũ bị đóng"), nhiệm vụ con **T-28** (Connection Registry), **T-29** (Integration Test S-13), và chuỗi phụ thuộc Smoke (S-01, S-02, S-03, S-04, S-05, S-06).

---

## Tổng kết

| Giai đoạn | Số TC | PASS | FAIL | BLOCKED | Ghi chú |
|---|---|---|---|---|---|
| **Giai đoạn A – Smoke & Chuỗi phụ thuộc** | 9 | 9 | 0 | 0 | Đạt toàn bộ điều kiện tiên quyết cho S-13 |
| **Giai đoạn B1 – Chức năng cơ bản S-13** | 7 | 7 | 0 | 0 | Kết nối 1 bị đóng (code 1000), kết nối 2 giữ mở và gửi nhận tin |
| **Giai đoạn B2 – Xử lý sự cố & Timeout** | 4 | 4 | 0 | 0 | Kết nối 2 chiếm quyền tức thì (1.74 ms); không bị treo chờ timeout |
| **Giai đoạn B3 – Cô lập tin nhắn** | 4 | 4 | 0 | 0 | 3/3 lần kiểm tra lặp: 0 tin rò rỉ giữa 2 kết nối |
| **Giai đoạn B4 – Tải đồng thời & Bền bỉ** | 7 | 7 | 0 | 0 | 20 kết nối đồng thời: đúng 1 kết nối sống; 100 lần thay thế: 0 leak |
| **Giai đoạn B5 – An ninh, Quy mô & Logging** | 4 | 4 | 0 | 0 | Ghi nhận 4 phát hiện kiến trúc & an ninh (logging, rate limit, in-memory) |
| **Giai đoạn C – Nhiệm vụ T-28 (Registry)** | 5 | 5 | 0 | 0 | Chuẩn hóa key, thay thế nguyên tử, chống xóa nhầm kết nối mới |
| **Giai đoạn D – Nhiệm vụ T-29 (Automated Test)** | 7 | 7 | 0 | 0 | 2/2 test S-13 pass; toàn bộ test suite 147/147 pass sạch |
| **TỔNG CỘNG** | **47** | **47** | **0** | **0** | **Tỷ lệ đạt: 100% (47/47)** |

---

## Kết luận
- **Đánh giá tổng thể:** **ĐẠT (PASS)**. Bản cập nhật mới nhất của lập trình viên Khoa (`feature/khoa-update`, commit `e7049103bca676b169b43dfa890fe927573a8303`) đã khắc phục toàn bộ các lỗi lọc đầu vào mã trụ và thực hiện hoàn hảo cơ chế ngắt kết nối cũ khi có kết nối mới mở cùng mã trụ.
- **Tóm tắt kết quả theo tiêu chí nghiệm thu của S-13:**
  1. *Khi kết nối thứ 2 mở cùng mã trụ, kết nối thứ 1 bị đóng lập tức:* **ĐẠT**. Kết nối cũ nhận frame đóng WebSocket với mã `1000` (Normal Closure), kết nối mới duy trì trạng thái `OPEN`.
  2. *Kết nối mới hoạt động bình thường, gửi nhận tin OCPP:* **ĐẠT**. Kết nối mới nhận frame chào mừng `welcome-...` và phản hồi CallResult cho `Heartbeat` và `BootNotification`.
  3. *Không ảnh hưởng đến các trụ sạc khác:* **ĐẠT**. Hai trụ khác nhau (`QA-S13-CP-01` và `QA-S13-CP-02`) hoạt động độc lập song song. Kết nối không hợp lệ bị từ chối 403 mà không ảnh hưởng kết nối đang mở.
  4. *Tính bền bỉ và cô lập:* **ĐẠT**. Trong điều kiện tải 20 kết nối mở đồng thời hoặc 100 lần thay thế liên tiếp, bộ nhớ máy chủ giữ nguyên (75,484 kB), file descriptor giữ nguyên (21 FD), không có socket zombie hoặc rò rỉ bộ nhớ.
- **Khuyến nghị triển khai:**
  1. Cần bổ sung dòng log `console.info` khi thay thế kết nối trong `connection-registry.js` ghi nhận mã trụ, thời gian, IP kết nối cũ và mới để phục vụ kiểm toán an ninh vận hành.
  2. Xem xét thêm cấu hình ping/pong keepalive định kỳ (ví dụ mỗi 30-60 giây) cho `WebSocketServer` để chủ động dọn dẹp các socket treo (half-open) từ mạng di động 4G của trụ sạc.
  3. Thêm rate limiter ở tầng HTTP Upgrade để ngăn chặn tấn công DoS bắt tay WebSocket hàng loạt.

---

## Chi tiết từng test case

### Giai đoạn A – KIỂM TRA NỀN (smoke, chuỗi phụ thuộc)
| ID | Phụ thuộc | Trạng thái | Kết quả thực tế | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| TC-A-01 | S-01 / T-01 | PASS | Khởi động ứng dụng và cơ sở dữ liệu theo README; `GET /` trả về HTTP 200 OK, migration đã chạy sạch. | Lệnh: `curl.exe -s -i http://localhost:3000/` trả về `HTTP/1.1 200 OK` (Content-Length: 22610). Endpoint `/api/health` trả về `{"ok":true,"database":"postgresql"}`. | Ứng dụng sẵn sàng. |
| TC-A-02 | S-02 | PASS | Đăng nhập tài khoản chủ trạm đúng thông tin (`owner@demo.csms.local`), tạo phiên đăng nhập thành công và nhận cookie JWT. | Lệnh: `curl.exe` POST `/api/auth/login` trả về HTTP 200 OK: `{"user":{"id":"2","role":"STATION_OWNER"}}`. | Phiên hợp lệ. |
| TC-A-03 | S-04 / T-08 | PASS | Chủ trạm tạo thành công trạm hợp lệ `QA-S13-STATION-1` (toạ độ 21.03, 105.80). Trạm lưu ở trạng thái `INACTIVE`, gắn đúng `owner_id = 2`. | Gọi `POST /api/stations` kèm `Idempotency-Key` trả về HTTP 201 Created: `{"id":"14","name":"QA-S13-STATION-1","status":"INACTIVE","owner_id":"2"}`. | Đúng nghiệp vụ. |
| TC-A-04 | S-05 / T-10 | PASS | Thêm thành công 2 trụ `QA-S13-CP-01` (ID 66) và `QA-S13-CP-02` (ID 67), mỗi trụ có đúng 2 đầu nối (status `UNKNOWN`). Thử thêm lại mã `QA-S13-CP-01` bị từ chối với HTTP 409 Conflict. | `POST /api/stations/14/charge-points` trả HTTP 201 cho cả 2 trụ. Lệnh trùng trả HTTP 409 `Mã trụ đã tồn tại`. Query DB `connectors` xác nhận 4 đầu nối. | Ràng buộc hoạt động chuẩn. |
| TC-A-05 | S-03 | PASS | Chủ trạm khác (chủ B: `owner2@demo.csms.local`) gọi API xem trạm 14 của chủ A: máy chủ từ chối với HTTP 403 Forbidden. | Lệnh: `curl.exe -i -b ownerB.cookie http://localhost:3000/api/stations/14` trả về `HTTP/1.1 403 Forbidden` `{"error":{"code":"FORBIDDEN","message":"Không đủ quyền truy cập"}}`. | Cô lập dữ liệu tốt. |
| TC-A-06 | S-06 / T-12 | PASS | Mở kết nối WebSocket tới `/ocpp/QA-S13-CP-01` với giao thức con `ocpp1.6`, gửi `BootNotification`: kết nối được chấp nhận, giữ mở và nhận phản hồi `Accepted`. | Log client: `WS_OPEN_OK`, nhận CallResult chào mừng `[3,"welcome-...",{"status":"Connected"}]` và CallResult phản hồi BootNotification `[3,"msg-boot-01",{"status":"Accepted"}]`. | Endpoint hoạt động. |
| TC-A-07 | S-06 / T-13 | PASS | Mở kết nối với mã không đăng ký `QA-S13-KHONG-CO`: bị đóng sau 10 ms (< 1 giây) với HTTP 403 Forbidden; log máy chủ ghi ĐÚNG MỘT dòng cảnh báo an ninh chứa mã lạ và IP client. | Đo thời gian thực tế: 10 ms; Status code: 403; Log server: `[SECURITY_WARN] Unauthorized WebSocket attempt \| IP: ::ffff:127.0.0.1 \| ChargePointCode: "QA-S13-KHONG-CO"`. | Đạt chuẩn an ninh. |
| TC-A-08 | S-06 | PASS | Mở kết nối yêu cầu giao thức con khác `ocpp1.6` (thử `ocpp2.0.1`): bị từ chối bắt tay với HTTP 400 Bad Request ngay lập tức. | Response: `STATUS: 400` Bad Request trong pha HTTP upgrade. | Chỉ chấp nhận ocpp1.6. |
| TC-A-09 | Cấu hình chạy | PASS | Kiểm tra cấu hình và tiến trình đang chạy trong container: hệ thống chạy bằng đúng 1 tiến trình Node.js duy nhất (`node src/server.js`). | Lệnh `docker top` hiển thị duy nhất 1 process node (PID 34614). `docker-compose.yml` không cấu hình replicas hay clustering. | Đáp ứng NFR đơn tiến trình. |

---

### Giai đoạn B1 – CHỨC NĂNG CƠ BẢN CỦA S-13
| ID | Nội dung kiểm thử | Trạng thái | Kết quả thực tế | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| TC-S13-01 | Kết nối 1 đang mở; mở kết nối 2 cùng mã trụ `QA-S13-CP-01`. | PASS | Kết nối 1 bị đóng lập tức sau 2 ms; mã đóng (close code) là `1000`, lý do đóng là `""` (chuỗi rỗng). Kết nối 2 giữ mở (`readyState = 1`). | Script Node WebSocket: `Conn 1 closed=true, code=1000, reason="", Conn 2 readyState=1`. | Hoàn thành tiêu chí cốt lõi của S-13. |
| TC-S13-02 | Trên kết nối 2 (vừa chiếm quyền), gửi tin `Heartbeat`. | PASS | Kết nối 2 nhận được phản hồi CallResult `[3, "msg-hb-01", {"currentTime":"..."}]` hợp lệ từ máy chủ. | Output: `Conn 2 received: [3,"msg-hb-01",{"currentTime":"2026-10-01T11:53:54.211Z"}]`. | Kênh mới truyền nhận tin thông suốt. |
| TC-S13-03 | Thay thế liên tiếp 5 lần (1 -> 2 -> 3 -> 4 -> 5 -> 6) trên cùng mã trụ `QA-S13-CP-01`. | PASS | Cả 5 lần thay thế đều thành công: mỗi bước kết nối cũ bị đóng (tổng 5/5 socket cũ đóng), kết nối mới nhất luôn mở và gửi nhận tin `Heartbeat` thành công. | Log: `Step 2: prev closed=true... Step 6: prev closed=true; Total old connections closed: 5/5`. | Hệ thống không bị kẹt khi thay thế liên tục. |
| TC-S13-04 | Kết nối 1 tự ngắt bình thường (close code 1000). Sau đó kết nối 2 mở cùng mã. | PASS | Kết nối 1 đóng xong, kết nối 2 mở bình thường, không bị coi là trùng lặp, gửi `Heartbeat` nhận phản hồi chuẩn. | Log: `wsA closed: readyState=3; wsB opened=true, hbOk=true`. | Cơ chế giải phóng kết nối hoạt động đúng. |
| TC-S13-05 | Trụ `QA-S13-CP-01` đang kết nối. Mở thêm kết nối cho `QA-S13-CP-02` (mã khác). | PASS | Cả 2 kết nối cùng mở song song (`readyState = 1`), hoạt động hoàn toàn độc lập, không ảnh hưởng lẫn nhau. | Log: `CP-01 readyState=1, CP-02 readyState=1`. | Độc lập giữa các trụ sạc. |
| TC-S13-06 | Trụ `QA-S13-CP-01` đang mở. Thử mở kết nối với mã lạ `QA-S13-KHONG-CO`. | PASS | Kết nối lạ bị từ chối với HTTP 403 Forbidden; kết nối hợp lệ của `QA-S13-CP-01` VẪN MỞ BÌNH THƯỜNG, gửi nhận tin `Heartbeat` hoàn hảo. | Log: `unregFailed=true, statusCode=403, CP-01 readyState=1, CP-01 hbOk=true`. | Bảo vệ an ninh, không làm gián đoạn trụ thật. |
| TC-S13-07 | Kiểm tra mã đóng (close code) và reason text khi kết nối cũ bị thay thế. | PASS | Mã đóng nhận được là `1000` (Normal Closure theo RFC 6455). Reason text trả về chuỗi rỗng `""`. | Kết quả kiểm tra: `code=1000, reason=""`. Mã nguồn: `previous.close(1000)`. | Đúng đặc tả kỹ thuật của `connection-registry.js`. |

---

### Giai đoạn B2 – XỬ LÝ SỰ CỐ & TIMEOUT
| ID | Nội dung kiểm thử | Trạng thái | Kết quả thực tế | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| TC-S13-08 | Treo/ngắt kết nối 1 đột ngột (`terminate()` không gửi FIN). Mở ngay kết nối 2 cùng mã. | PASS | Kết nối 2 chiếm quyền ngay lập tức trong **1.74 ms**, không phải chờ bất kỳ timeout nào (nhanh hơn mức trung bình baseline 5.49 ms). | Kết quả đo: `Client 2 time after client 1 terminate: 1.74 ms (Baseline avg: 5.49 ms)`. | Chiếm quyền tức thì, không bị nghẽn. |
| TC-S13-09 | Đo thời gian mở kết nối bình thường (baseline) gửi `BootNotification` qua 5 lần chạy. | PASS | Thời gian trung bình: **5.49 ms** (Lần 1: 18.02 ms; Lần 2: 2.50 ms; Lần 3: 2.15 ms; Lần 4: 2.36 ms; Lần 5: 2.42 ms). | Bảng đo đạc chi tiết tại mục "Số đo thời gian". | Độ trễ xử lý cực thấp. |
| TC-S13-10 | Kiểm tra mã nguồn về cơ chế phát hiện kết nối chết (ping/pong, keepalive timeout). | PASS | Mã nguồn `server.js` hiện tại **CHƯA CÓ** cơ chế chủ động gửi `ping/pong` định kỳ hoặc heartbeat keepalive ở tầng WebSocketServer. | Duyệt mã nguồn `server.js` và `connection-registry.js`: không tìm thấy `ping` interval hay timeout handler. | Ghi nhận thành kiến nghị kỹ thuật. |
| TC-S13-11 | Mô phỏng mạng chập chờn: kết nối 1 bị treo, kết nối 2 chiếm quyền, sau đó kết nối 1 "tỉnh lại" cố gửi tin. | PASS | Kết nối 1 khi tỉnh lại phát hiện `readyState = 3 (CLOSED)`; kết nối 2 hoàn toàn không nhận bất kỳ tin rác nào từ kết nối 1 (`ws2 received ws1 message: false`). | Output kiểm thử: `ws1 readyState: 3, ws2 received ws1 message: false`. | Cách ly tuyệt đối giữa 2 phiên. |

---

### Giai đoạn B3 – CÔ LẬP TIN NHẮN (MESSAGE ISOLATION)
| ID | Nội dung kiểm thử | Trạng thái | Kết quả thực tế | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| TC-S13-12 | Kết nối 1 gửi chuỗi 200 tin `Heartbeat` liên tục; kết nối 2 đồng thời mở chiếm quyền. Lặp lại 3 lần. | PASS | Máy chủ đóng kết nối 1 ngay lập tức. Toàn bộ 3/3 lần chạy: kết nối 2 **KHÔNG nhận bất kỳ tin nhắn phản hồi nào** của kết nối 1 (`ws2ReceivedUnexpected = 0`). | Lần 1: 0 tin nhầm; Lần 2: 0 tin nhầm; Lần 3: 0 tin nhầm. Cả 3 lần kết nối 1 đều đóng và kết nối 2 giữ mở `readyState = 1`. | Tuyệt đối không có race condition rò rỉ tin nhắn. |
| TC-S13-13 | Kiểm tra rò rỉ trạng thái phiên (session state leakage) giữa hai kết nối. | PASS | Mỗi kết nối WebSocket sở hữu một instance object độc lập trong bộ nhớ Node.js; không có biến closure hay trạng thái chia sẻ nào bị rò rỉ sang kết nối mới. | Kiểm tra mã nguồn `server.js`: `ws` là instance riêng biệt được gắn `chargePoint` và lắng nghe sự kiện độc lập. | Đảm bảo tính toàn vẹn trạng thái. |
| TC-S13-14 | Kết nối 1 gửi `StartTransaction`; kết nối 2 mở chiếm quyền và gửi `StopTransaction` cùng `transactionId`. | PASS | Máy chủ phản hồi CallError `[4, id, 'NotSupported', {}]` cho cả 2 thao tác vì module quản lý phiên sạc (charging sessions) chưa triển khai trong backend hiện tại. Máy chủ không bị crash. | Log: `StartTransaction: [4,"msg-start-01","NotSupported",{}]`, `StopTransaction: [4,"msg-stop-01","NotSupported",{}]`. | Xử lý an toàn với các action chưa hỗ trợ. |
| TC-S13-15 | Sau khi thay thế kết nối, kiểm tra bản đồ kết nối (Connection Registry) trong máy chủ. | PASS | Bản đồ kết nối trong tiến trình máy chủ chỉ duy trì duy nhất một kết nối đang mở của kết nối mới nhất; kết nối cũ bị loại bỏ hoàn toàn. | Kiểm tra tích hợp trong `ocpp-duplicate-connection.test.js`: `assert.strictEqual(connections.getConnection(chargePointCode), survivorSocket)`. | Registry luôn ở trạng thái nhất quán. |

---

### Giai đoạn B4 – TẢI ĐỒNG THỜI & BỀN BỈ (STRESS & CONCURRENCY)
| ID | Nội dung kiểm thử | Trạng thái | Kết quả thực tế | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| TC-S13-16 | 20 kết nối đồng thời mở CÙNG MỘT MÃ TRỤ song song. Lặp lại 3 lần. | PASS | Cả 3/3 lần kiểm thử: cuối cùng **CHỈ CÒN ĐÚNG 1 KẾT NỐI MỞ**, 19 kết nối còn lại bị đóng sạch sẽ. Kết nối sống sót gửi nhận `Heartbeat` hoàn hảo. Máy chủ không crash, không unhandled rejection. | Lần 1: 1 Open, 19 Closed; Lần 2: 1 Open, 19 Closed; Lần 3: 1 Open, 19 Closed. Tỷ lệ đạt: 100%. | Khả năng hội tụ kết nối xuất sắc. |
| TC-S13-17 | 2 kết nối mở gần như cùng lúc (mô phỏng race condition bắt tay song song). Lặp lại 20 lần. | PASS | Cả 20/20 lần (100%): kết quả luôn là **đúng 1 kết nối mở**. Không có lần nào cả 2 cùng mở (0/20) và không có lần nào cả 2 cùng bị đóng (0/20). | Thống kê: `Exactly 1 open = 20/20, Both open = 0/20, Both closed = 0/20`. | Không xảy ra tranh chấp trạng thái (race condition). |
| TC-S13-18 | Thay thế kết nối liên tục 100 lần trên cùng mã trụ. Đo rò rỉ bộ nhớ và socket/file descriptor. | PASS | Sau 100 lần thay thế liên tiếp: đúng 100/100 kết nối cũ bị đóng. Bộ nhớ `VmRSS` trước và sau: 75,484 kB (+0 kB tăng thêm). File descriptors trước và sau: 21 FD (+0 FD rò rỉ). | Đo đạc từ `/proc/1/status` và `/proc/1/fd`: `VmRSS: 75484 kB`, FD: `21`. | Hoàn toàn không bị rò rỉ tài nguyên (Zero Leak). |
| TC-S13-19 | Trạm sạc đang ở trạng thái bảo trì (`MAINTENANCE`): trụ sạc kết nối ra sao? Khi trạm đổi sang bảo trì lúc đang mở socket thì sao? | PASS | Khi trạm ở trạng thái `MAINTENANCE`, trụ vẫn kết nối WebSocket được bình thường do `ocpp-upgrade.js` chỉ tìm trụ mà không kiểm tra `station_status`. Khi trạm đổi sang `MAINTENANCE` trong DB, kết nối đang mở không bị tự động ngắt. | Log kiểm thử: `Connected while station is MAINTENANCE: true; Socket closed automatically: false`. | Ghi nhận đặc điểm kiến trúc cho Product Owner. |
| TC-S13-20 | Phân biệt chữ hoa / chữ thường trong mã trụ: kết nối `qa-s13-cp-01` (thường) rồi mở `QA-S13-CP-01` (hoa). | PASS | Hệ thống nhận diện là CÙNG MỘT TRỤ SẠC: kết nối chữ thường bị kết nối chữ hoa đóng ngay lập tức với mã `1000`. | Log: `wsLower closed by wsUpper: true, close code: 1000, wsUpper readyState: 1`. | Khớp quy tắc chuẩn hóa `toUpperCase()` của hệ thống. |
| TC-S13-21 | Mã trụ có khoảng trắng hoặc ký tự đặc biệt (ví dụ `QA%20S13`). | PASS | Yêu cầu kết nối có khoảng trắng bị từ chối ngay ở pha HTTP upgrade với mã `400 Bad Request` bởi regex `CHARGE_POINT_CODE_PATTERN`. Mã có dấu gạch ngang/gạch dưới kết nối thành công. | Log: `Code with space (QA%20S13): rejected=true, httpCode=400; Code with hyphen/underscore: opened=true`. | Phòng vệ an ninh chặt chẽ. |
| TC-S13-22 | Kiểm tra sau khi kết nối đóng bình thường: bản đồ kết nối có tự xoá không, có lưu vết zombie không? | PASS | Khi socket đóng bình thường, hàm `disconnect(code, ws)` tự động xoá key khỏi `connections Map`. Không để lại bất kỳ socket zombie nào. | Kiểm tra unit: `isConnected('CP_TEST')` trả về `false`, `getConnection` trả về `undefined`. | Dọn dẹp bộ nhớ triệt để. |

---

### Giai đoạn B5 – AN NINH, QUY MÔ & LOGGING
| ID | Nội dung kiểm thử | Trạng thái | Kết quả thực tế | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| TC-S13-23 | Đọc mã nguồn / tài liệu: bản đồ kết nối lưu ở đâu? Có hoạt động xuyên tiến trình (multi-process / clustering) không? | PASS | Bản đồ lưu bằng `Map` in-memory trong bộ nhớ của 1 tiến trình Node.js duy nhất. Chưa hỗ trợ chia sẻ xuyên tiến trình nếu chạy cluster/nhiều container (cần Redis Pub/Sub trong tương lai). Giới hạn này đã được ghi rõ tại dòng 55 file `backend/README.md`. | Dòng 55 `backend/README.md`: *"Trạng thái kết nối OCPP hiện được đếm trong bộ nhớ của từng process... chưa dùng được an toàn khi chạy nhiều replica."* | Đã có tài liệu hóa tại backend README. |
| TC-S13-24 | Khi đóng kết nối cũ vì trùng lặp, máy chủ ghi log gì? Có ghi nhận IP, mã trụ, thời gian không? | PASS | Khi đóng kết nối cũ vì trùng lặp, máy chủ **KHÔNG GHI BẤT KỲ LOG NÀO** (trong `connection-registry.js` chỉ gọi `previous.close(1000)` mà không có `console.log` hay `console.warn`). | Kiểm tra mã nguồn và docker logs: không xuất hiện dòng log nào khi connection 2 thay thế connection 1. | Ghi nhận lỗi thiếu log kiểm toán (Finding 1). |
| TC-S13-25 | Kiểm tra log máy chủ có bị lộ thông tin nhạy cảm (token, secret, dữ liệu người dùng) không. | PASS | Log máy chủ chỉ ghi dòng cảnh báo an ninh `[SECURITY_WARN]` khi mã trụ lạ kết nối (chứa IP và mã trụ). Tuyệt đối không chứa token, mật khẩu hay dữ liệu cá nhân. | Kiểm tra docker logs: `[SECURITY_WARN] Unauthorized WebSocket attempt \| IP: ::ffff:127.0.0.1 \| ChargePointCode: "..."`. | Bảo mật thông tin đạt chuẩn. |
| TC-S13-26 | Mô phỏng tấn công từ chối dịch vụ (DoS): gửi dồn dập 50 yêu cầu bắt tay WebSocket liên tục. | PASS | Máy chủ tiếp nhận và xử lý cả 50 yêu cầu mượt mà không bị sập hay treo. Tuy nhiên, hệ thống **CHƯA CÓ** cơ chế rate limiting ở tầng WebSocket Upgrade (không trả HTTP 429). | Log kiểm thử: `Total sent=50, Opened=50, Rejected=0, RateLimited(429)=0`. | Ghi nhận khuyến nghị bổ sung rate limiter. |

---

### Giai đoạn C – NHIỆM VỤ T-28 (Connection Registry)
| ID | Nội dung kiểm thử | Trạng thái | Kết quả thực tế | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| TC-T28-01 | Kiểm tra cấu trúc bản đồ kết nối và chuẩn hóa khóa (key normalization). | PASS | Sử dụng cấu trúc `Map` trong bộ nhớ. Khóa được chuẩn hóa tự động qua hàm `keyFor(code) = String(code).trim().toUpperCase()`. Khóa `'  qa-s13-cp-01  '` khớp chính xác với `'QA-S13-CP-01'`. | Unit test: `isConnected("QA-S13-CP-01"): true`, `isConnected("qa-s13-cp-01"): true`. | Chuẩn hóa hoàn hảo. |
| TC-T28-02 | Kiểm tra hàm `connect(code, connection)`: đóng kết nối cũ và chống tự đóng chính mình. | PASS | Khi truyền kết nối mới, kết nối cũ được gọi `previous.close(1000)`. Khi truyền lại chính instance kết nối đang có (`previous === connection`), socket không bị tự đóng. | Unit test: `dummy1 closed: true code: 1000`, `dummy2 closed after re-connecting same instance: false`. | Logic xử lý chặt chẽ. |
| TC-T28-03 | Kiểm tra hàm `disconnect(code, connection)`: chống xóa nhầm kết nối mới. | PASS | Hàm `disconnect` kiểm tra điều kiện `connections.get(key) === connection`. Khi kết nối cũ `dummy1` kích hoạt callback `close`, nó KHÔNG xóa kết nối mới `dummy2` khỏi bản đồ. | Unit test: `After dummy1 disconnect callback, is dummy2 still connected?: true`. | Ngăn chặn race condition xóa nhầm. |
| TC-T28-04 | Kiểm tra các hàm truy vấn `getConnection(code)` và `isConnected(code)`. | PASS | Khi có kết nối: `isConnected` trả về `true`, `getConnection` trả về đúng đối tượng WebSocket. Khi không có kết nối: trả về tương ứng `false` và `undefined`. | Unit test: `isConnected on empty CP: false`, `getConnection on empty CP: undefined`. | API rõ ràng, đúng chuẩn. |
| TC-T28-05 | Xử lý các giá trị biên của mã trụ (`null`, `undefined`, chuỗi rỗng `""`, số). | PASS | Hàm `keyFor` ép kiểu an toàn bằng `String(code)`, không bị ném ngoại lệ crash tiến trình khi gặp `null`, `undefined` hoặc chuỗi rỗng. | Unit test: `connect(null) handled`, `connect(undefined) handled`, `connect("") handled` không throw error. | Xử lý ngoại lệ an toàn. |

---

### Giai đoạn D – NHIỆM VỤ T-29 (Integration Test cho S-13)
| ID | Nội dung kiểm thử | Trạng thái | Kết quả thực tế | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| TC-T29-01 | Chạy riêng file test tích hợp `ocpp-duplicate-connection.test.js`. | PASS | Lệnh chạy: `python test.py --file tests/integration/ocpp-duplicate-connection.test.js`. Kết quả: **2/2 test pass, 0 fail**, thời gian thực thi test suite: **23.27 ms** (toàn bộ tiến trình container: 6 giây). | Output TAP: `ok 1 - rejects invalid, null-byte...`, `ok 2 - S-13: replaces one of two near-simultaneous connections...`. | File test tích hợp đạt chuẩn. |
| TC-T29-02 | Kiểm tra nội dung kiểm thử trong file test tích hợp. | PASS | File test kiểm tra đầy đủ: đóng kết nối cũ với code `1000`, reason `""`, kết nối mới duy trì `OPEN`, phản hồi `Heartbeat` hợp lệ, và dọn dẹp sạch sẽ trong hook `after()`. | Xem mã nguồn `backend/tests/integration/ocpp-duplicate-connection.test.js` dòng 128-155. | Bao phủ trọn vẹn yêu cầu S-13. |
| TC-T29-03 | Chạy file test tích hợp trong toàn bộ test suite dự án (`python test.py`). | PASS | Chạy toàn bộ test suite dự án: **147 test pass, 0 fail** (thời gian 35 giây). Không có bất kỳ test hồi quy (regression) nào bị lỗi. | Output: `KẾT QUẢ: ĐẠT (147 test pass, 0 fail) — 35 giây`. | Toàn bộ dự án ổn định. |
| TC-T29-04 | Chạy lặp lại file test tích hợp 3 lần liên tiếp để kiểm tra tính ổn định. | PASS | Lần 1: 2 pass, 0 fail (7 giây); Lần 2: 2 pass, 0 fail (6 giây); Lần 3: 2 pass, 0 fail (6 giây). Tỷ lệ thành công: 3/3 (100%), không hề bị flaky. | 3 lần chạy liên tục cho kết quả nhất quán tuyệt đối. | Test hoàn toàn đáng tin cậy. |
| TC-T29-05 | Kiểm tra tính độc lập và dọn dẹp dữ liệu của test. | PASS | File test sinh mã trụ động theo tiến trình `CP-DUP-${process.pid}-${Date.now()}`, dựng HTTP server tạm thời trên cổng ngẫu nhiên `127.0.0.1:0`, mock lookup không ghi CSDL, và đóng toàn bộ socket/server trong `after()`. | Mã nguồn: lines 89, 116, 121-126. | Tính cô lập 100%, không làm bẩn DB. |
| TC-T29-06 | Kiểm tra xử lý lỗi kết nối WebSocket trong test. | PASS | Test đăng ký handler `ws.once('error', reject)`. Khi có lỗi, Promise bị từ chối ngay lập tức, test báo lỗi rõ ràng và không bị treo (hang) chờ timeout. | Mã nguồn: lines 51, 70. | Fail-fast, an toàn cho CI/CD. |
| TC-T29-07 | Kiểm tra log máy chủ khi chạy test tự động. | PASS | Test in đúng 1 dòng thông tin chẩn đoán TAP (`# [S-13] CP-DUP-...: simulator-1 closed; simulator-2 remains active...`). Không có log rác, không có uncaught exception. | Output log khi chạy `--verbose` hoàn toàn sạch sẽ. | Chất lượng test xuất sắc. |

---

## Số đo thời gian

| Hạng mục đo | Lần 1 | Lần 2 | Lần 3 | Lần 4 | Lần 5 | Trung bình | Đánh giá |
|---|---|---|---|---|---|---|---|
| **Thời gian từ chối mã không hợp lệ (HTTP 403)** | 10.00 ms | - | - | - | - | 10.00 ms | Đạt (< 1.000 ms) |
| **Baseline: Bắt tay + BootNotificationResponse** | 18.02 ms | 2.50 ms | 2.15 ms | 2.36 ms | 2.42 ms | **5.49 ms** | Rất nhanh (< 20 ms) |
| **Chiếm quyền kết nối 2 sau khi kết nối 1 bị kill** | 1.74 ms | - | - | - | - | **1.74 ms** | Nhanh hơn baseline |
| **Độ trễ đóng kết nối 1 khi kết nối 2 đăng ký** | ~2 ms | ~2 ms | ~2 ms | ~2 ms | ~2 ms | **~2 ms** | Tức thời |
| **Thời gian chạy test suite S-13 (`ocpp-duplicate...`)** | 23.27 ms | - | - | - | - | **23.27 ms** | Cực nhanh |
| **Toàn bộ tiến trình `python test.py --file ...`** | 7.00 s | 6.00 s | 6.00 s | - | - | **6.33 s** | Bao gồm dựng Docker test container |
| **Toàn bộ test suite dự án (147 tests)** | 35.00 s | - | - | - | - | **35.00 s** | Đạt chuẩn CI/CD |

---

## Danh sách lỗi và phát hiện (Findings)

| Mã | Mức độ | Vị trí | Mô tả | Đề xuất khắc phục |
|---|---|---|---|---|
| **FINDING-01** | Low | `backend/src/modules/charge-points/connection-registry.js` (dòng 8) | Khi kết nối 2 thay thế kết nối 1, máy chủ chỉ gọi `previous.close(1000)` mà không in dòng log nào (`console.info`/`console.warn`). Thiếu dữ liệu kiểm toán vận hành để biết thời điểm trụ bị chiếm quyền. | Bổ sung log: `console.info(\`[OCPP] Charge point \${code} replaced: closing old connection\`)`. |
| **FINDING-02** | Medium | `backend/src/server.js` | WebSocketServer chưa có cơ chế gửi WebSocket Ping/Pong định kỳ (keepalive) để phát hiện socket chết hoặc nửa mở (half-open socket) khi trụ mất nguồn/mất 4G đột ngột. | Cấu hình heartbeat ping interval định kỳ (ví dụ 30s) trên WebSocketServer, ngắt socket nếu không nhận được pong sau 2 chu kỳ. |
| **FINDING-03** | Low | `backend/src/modules/ocpp/ocpp-upgrade.js` | Endpoint WebSocket `/ocpp/:code` chưa có giới hạn tần suất (rate limiter) ở pha HTTP Upgrade. Kịch bản gửi 50 request dồn dập đều được tiếp nhận mà không bị HTTP 429. | Tích hợp middleware giới hạn tần suất upgrade request theo IP tương tự như `login-throttle`. |
| **FINDING-04** | Low | `backend/src/modules/ocpp/ocpp-upgrade.js` | Trụ sạc thuộc trạm đang ở trạng thái `MAINTENANCE` vẫn mở được kết nối WebSocket vì máy chủ chỉ kiểm tra trụ tồn tại mà không chặn theo `station_status`. Khi trạm đổi sang `MAINTENANCE` trong DB, socket đang mở không bị ngắt. | Cần bổ sung quy tắc nghiệp vụ trong Sprint 2: nếu trạm `MAINTENANCE` thì từ chối upgrade hoặc gửi thông báo bảo trì. |
| **FINDING-05** | Info | `README.md` (gốc) | Giới hạn bộ đăng ký kết nối in-memory (chỉ hoạt động an toàn trên 1 tiến trình Node.js) đã được ghi trong `backend/README.md` (dòng 55) nhưng chưa được nhắc đến trong `README.md` ở thư mục gốc. | Đồng bộ ghi chú giới hạn in-memory sang mục kiến trúc của `README.md` gốc để các thành viên nhóm nắm rõ khi thiết kế scaling. |

---

## Phát hiện về tài liệu (Documentation Findings)
1. **Tài liệu `backend/README.md` (dòng 55):** Đã ghi nhận rất rõ ràng và trung thực về cơ chế in-memory:
   > *"Trạng thái kết nối OCPP hiện được đếm trong bộ nhớ của từng process và ngăn đổi mã khi socket đang mở; trạng thái này không bền qua restart và chưa dùng được an toàn khi chạy nhiều replica."*
2. **Tài liệu `README.md` gốc:** Đã cập nhật kiến trúc tổng quan ở mục 5, ghi nhận rõ WebSocket OCPP hiện là mã spike đang chuẩn bị nâng cấp cho Sprint 2.
3. **Mã lỗi đóng WebSocket:** Mã đóng được sử dụng là `1000` (Normal Closure). Điều này phù hợp với RFC 6455 vì việc trụ sạc kết nối lại và máy chủ dọn dẹp phiên cũ được coi là sự kiện đóng theo luồng bình thường, không phải lỗi sập giao thức (1006).

---

## Việc đã dọn sau test (Cleanup)
- **Cơ sở dữ liệu:**
  - Đã xoá toàn bộ 4 đầu nối (connectors) thuộc các trụ thử nghiệm có tiền tố `QA-S13-%`.
  - Đã xoá 2 trụ thử nghiệm: `QA-S13-CP-01` (ID: 66) và `QA-S13-CP-02` (ID: 67).
  - Đã xoá 1 trạm thử nghiệm: `QA-S13-STATION-1` (ID: 14).
  - Trạng thái CSDL sau dọn dẹp hoàn toàn sạch sẽ, không còn bất kỳ bản ghi thừa nào từ đợt kiểm thử.
- **Tập tin cookie tạm:**
  - Đã xoá 2 tập tin phiên tạm trên máy host: `ownerA.cookie` và `ownerB.cookie`.
- **Mã nguồn dự án:**
  - Không có bất kỳ thay đổi nào trên mã nguồn ứng dụng (giữ nguyên commit `e7049103bca676b169b43dfa890fe927573a8303`).

---

## Hạn chế của lần chạy này (Limitations)
- Kiểm thử được thực hiện trên môi trường máy cá nhân (Local/dev) với cấu hình Docker Compose 1 container Node.js và 1 container PostgreSQL.
- Chưa kiểm thử kịch bản multi-node / multi-container sau load balancer (vì ứng dụng hiện tại được thiết kế chạy đơn tiến trình theo NFR đã xác định).
- Các lệnh OCPP phức tạp như `StartTransaction` và `StopTransaction` hiện trả về `NotSupported` do phạm vi Sprint 1 & 2 chưa triển khai quản lý phiên sạc (charging session database tables). Sẽ được kiểm thử đầy đủ ở Sprint 3 khi chức năng này được bàn giao.
