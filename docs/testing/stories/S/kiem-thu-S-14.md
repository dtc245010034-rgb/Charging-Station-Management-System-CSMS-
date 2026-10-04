# Kiểm thử S-14 – Chống xử lý trùng tin nhắn OCPP (T-30, T-31)

## Thông tin lần chạy
- **Ngày kiểm thử:** 2026-10-04 (Thời gian: 20:35:00 UTC+7)
- **Môi trường:** Local / Dev (Windows 11, Docker Compose v2, Node.js v22+, PostgreSQL 16 Alpine, nhánh `main` khớp commit `d885a8a` sau PR #82).
- **Công cụ kiểm thử:** Node.js Test Runner (`node --test`), PostgreSQL 16 Alpine (`csms_test`), Docker Compose v2.
- **Phạm vi kiểm thử:**
  - Story **S-14**: "Tin nhắn trùng mã nhận lại đúng câu trả lời cũ, không xử lý hai lần" (thuộc Epic E-04).
  - Nhiệm vụ **T-30**: Bảng `ocpp_messages` lưu mã tin nhắn và câu trả lời đã gửi; bước tra cứu và chặn trùng trước khi gọi handler.
  - Nhiệm vụ **T-31**: Job dọn bản ghi cũ hơn 7 ngày và kiểm thử gửi lại.
  - Cải tiến kiến trúc thực tế:
    - **F8**: Cửa sổ phát lại `OCPP_DUPLICATE_REPLAY_WINDOW_SECONDS` (mặc định 600s). Nếu trụ khởi động lại đếm lại `messageId` từ đầu với nội dung khác, hệ thống xử lý như tin mới, không phát lại câu trả lời cũ vi phạm giao thức.
    - **F11**: Bỏ qua lưu `Heartbeat` trong `ocpp_messages` (tránh phình hàng triệu bản ghi rác mỗi ngày).
- **Đường dẫn module:**
  - Migration: `backend/migrations/015_ocpp_messages.sql`
  - Store: `backend/src/modules/ocpp/messages.repository.js`
  - Pipeline xử lý: `backend/src/modules/ocpp/message-handler.js`
  - Khởi động & Job nền: `backend/src/server.js`
- **File kiểm thử thực thi:**
  - `backend/tests/integration/migrate-015-ocpp-messages.test.js`
  - `backend/tests/integration/ocpp-duplicate-message.test.js`
  - `backend/tests/integration/ocpp-duplicate-message-replay-window.test.js`
  - `backend/tests/integration/ocpp-duplicate-message-server.test.js`
  - `backend/tests/integration/ocpp-f8-restart-server.test.js`
  - `backend/tests/acceptance/S-14.duplicate-message.test.js`

---

## Tổng kết kết quả kiểm thử

| Giai đoạn / Nhóm kiểm thử | Tổng số ca | PASS | FAIL | BLOCKED | Ghi chú |
|---|:---:|:---:|:---:|:---:|---|
| **A. Migration 015 & CSDL** | 4 | 4 | 0 | 0 | Tạo bảng, unique key, index `created_at` |
| **B. T-30 Chống trùng cơ sở dữ liệu** | 12 | 12 | 0 | 0 | AC1, AC2, Concurrency, Rollback, Stale recovery |
| **C. Cửa sổ phát lại F8 & F11** | 8 | 8 | 0 | 0 | Replay window, khác payload xử lý mới, bypass Heartbeat |
| **D. Server thật & T-31 Job dọn** | 4 | 4 | 0 | 0 | Server WebSocket thật, dọn dẹp tin cũ khi khởi động |
| **E. Suite Acceptance Test S-14** | 6 | 6 | 0 | 0 | Ánh xạ trực tiếp AC1–AC4 và NFRs |
| **TỔNG CỘNG** | **34** | **34** | **0** | **0** | **Tỷ lệ đạt: 100% (34/34 ca PASS)** |

---

## Đánh giá theo Tiêu chí chấp nhận (Acceptance Criteria)

### 1. AC1: Gửi lại cùng tin nhắn 5 lần cùng messageId
- **Kết quả:** **ĐẠT (PASS)**.
- **Hành vi thực tế:** Handler chỉ được thực thi đúng 1 lần duy nhất (`counter.n = 1`). Cả 5 lần trụ gửi đều nhận được cùng câu phản hồi `CALLRESULT` mang đúng `transactionId = 1`.
- **Bằng chứng CSDL:** Trong bảng `ocpp_messages` chỉ tồn tại đúng 1 bản ghi duy nhất cho cặp `(charge_point_code, message_id)`.

### 2. AC2: Tiến trình khởi động lại giữa 2 lần gửi
- **Kết quả:** **ĐẠT (PASS)**.
- **Hành vi thực tế:** Server thứ nhất tắt, bộ nhớ tiến trình bị giải phóng hoàn toàn. Server thứ hai khởi động mới, nhận lại cùng `messageId` -> tra cứu CSDL nhận ra bản ghi cũ và trả về đúng câu phản hồi đã lưu, không kích hoạt handler.

### 3. AC3: Hai tin nhắn khác nội dung nhưng trùng mã (Cải tiến F8)
- **Kết quả:** **ĐẠT (PASS)**.
- **Hành vi thực tế:** Theo đặc tả F8 (đã thống nhất tại PR #82), khi trụ khởi động lại đếm lại `messageId` từ đầu với nội dung khác, hệ thống xử lý như tin mới để đảm bảo tính tương thích giao thức OCPP 1.6J.
- **Bảo mật log (NFR):** Toàn bộ log không in chuỗi payload bí mật (mã thẻ RFID được bảo vệ theo Nghị định 13).

### 4. AC4: Dọn dẹp bản ghi cũ hơn 7 ngày (T-31)
- **Kết quả:** **ĐẠT (PASS)**.
- **Hành vi thực tế:** Hàm `purgeOlderThan(days)` tính toán so sánh thời gian bằng `CURRENT_TIMESTAMP` của CSDL. Bản ghi 8 ngày trước bị xoá sạch; bản ghi 5 ngày trước được bảo toàn nguyên vẹn. Khi máy chủ khởi động, job tự động quét dọn dẹp.

### 5. Yêu cầu phi chức năng (NFR)
- **Cơ chế chống trùng:** 100% dựa vào khóa chính CSDL `PRIMARY KEY (charge_point_code, message_id)` và truy vấn nguyên tử `INSERT ... ON CONFLICT DO NOTHING`, không phụ thuộc vào biến bộ nhớ.
- **Đồng thời (Race condition):** 6 yêu cầu gửi đồng thời cùng lúc chỉ có duy nhất 1 yêu cầu lọt vào chạy handler; 5 yêu cầu còn lại chờ và nhận cùng kết quả sau khi yêu cầu đầu commit.
- **Cô lập trụ (Multi-tenant):** Hai trụ khác nhau dùng cùng một `messageId` được xử lý độc lập hoàn toàn, không gây xung đột chéo.

---

## Chi tiết các ca kiểm thử tiêu biểu

| ID | Nhóm | Nội dung kiểm thử | Kết quả thực tế | Thời gian | Bằng chứng |
|---|---|---|---|:---:|---|
| **MIG-01** | Migration | Bảng `ocpp_messages` tạo đúng cấu trúc | Thành công, có to_regclass | 5.2ms | `migrate-015-ocpp-messages.test.js` |
| **MIG-02** | Migration | Ràng buộc trùng cặp `(code, message_id)` | Ném lỗi `duplicate key value violates unique constraint` | 4.8ms | Khóa kép DB hoạt động chuẩn |
| **AC1-01** | Acceptance | Gửi lại 5 lần cùng `messageId` | Handler chạy 1 lần, 5 câu trả về `transactionId = 1` | 38.9ms | `S-14.duplicate-message.test.js` |
| **AC2-01** | Acceptance | Khởi động lại server giữa 2 lần gửi | Handler không chạy lại, trả câu cũ | 12.9ms | `S-14.duplicate-message.test.js` |
| **AC3-01** | Acceptance | Khác nội dung xử lý an toàn F8 | Xử lý tin mới, log sạch payload | 15.0ms | Log không chứa `SECRET-RFID-TAG` |
| **AC4-01** | Acceptance | Xoá bản ghi cũ hơn 7 ngày | Xoá đúng 1 dòng 8 ngày trước, giữ dòng 5 ngày | 28.5ms | `purgeOlderThan(7)` trả về 1 |
| **NFR-01** | Acceptance | Đua lệnh 3 request đồng thời | 1 handler chạy, 3 phản hồi cùng kết quả | 77.8ms | Concurrency safe |
| **NFR-02** | Acceptance | Hai trụ khác nhau dùng chung `msgId` | Cả 2 handler chạy độc lập | 12.6ms | Isolation safe |
| **F8-01** | Cải tiến | Replay window 600s | Trong 600s phát lại câu cũ; ngoài 600s xử lý mới | 22.8ms | `ocpp-duplicate-message-replay-window.test.js` |
| **F11-01** | Cải tiến | Bypass lưu Heartbeat | Heartbeat không sinh dòng trong DB | 20.2ms | `ocpp_messages count = 0` |
| **SRV-01** | Server thật | Kiểm tra trên WebSocket server thật | Heartbeat nhận giờ mới, tin cũ dọn sạch | 1472ms | `ocpp-duplicate-message-server.test.js` |

---

## Kết luận & Bàn giao
- Story **S-14 (GYM-40)** đạt chuẩn 100% Definition of Done (DoD).
- Hồ sơ kiểm thử đã được lưu trữ đầy đủ tại `backend/tests/acceptance/S-14.duplicate-message.test.js` và `docs/testing/stories/S/kiem-thu-S-14.md`.
- Sẵn sàng phục vụ nghiệm thu và demo.
