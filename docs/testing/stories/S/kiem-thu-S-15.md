# Kiểm thử S-15 – Xác thực thẻ qua Authorize (T-32, T-33)

## Thông tin lần chạy
- **Ngày kiểm thử:** 2026-10-04 (Thời gian: 20:56:00 UTC+7)
- **Môi trường:** Local / Dev (Windows 11, Docker Compose v2, Node.js v22+, PostgreSQL 16 Alpine, nhánh `nam/GYM-41-xac-thuc-the-authorize`).
- **Phạm vi kiểm thử:**
  - Story **S-15**: "Xác thực thẻ qua Authorize" (thuộc Epic E-04, thẻ Jira GYM-41, 2 SP).
  - Nhiệm vụ **T-32**: Bảng `id_tags` (Migration 016) lưu mã thẻ định danh RFID (`tag` tối đa 20 ký tự CiString20Type, unique, ràng buộc `status IN ('ACTIVE', 'BLOCKED')`, `expires_at`, khóa ngoại tới `users`).
  - Nhiệm vụ **T-33**: Handler `Authorize` tra cứu CSDL (dùng `ocppPool` có `lock_timeout`), kiểm tra trạng thái trạm/trụ, thẩm định trạng thái qua hàm thuần `evaluateIdTag`, che giấu mã thẻ trong log (NFR: chỉ hiển thị 4 ký tự cuối), từ chối `FormationViolation` nếu mã thẻ vượt quá 20 ký tự.
- **Đường dẫn module:**
  - Migration: `backend/migrations/016_id_tags.sql` & `016_id_tags.down.sql`
  - Handler & Logic thẩm định: `backend/src/modules/ocpp/handlers/authorize.js`
  - Tích hợp server: `backend/src/server.js`
  - Seed demo: `backend/scripts/seed-demo.js`
- **File kiểm thử thực thi:**
  - `backend/tests/integration/migrate-016-id-tags.test.js`
  - `backend/tests/unit/ocpp-authorize-commands.test.js`
  - `backend/tests/acceptance/S-15.authorize.test.js`
  - `backend/tests/integration/seed-demo.test.js`

---

## Tổng kết kết quả kiểm thử

| Giai đoạn / Nhóm kiểm thử | Tổng số ca | PASS | FAIL | BLOCKED | Ghi chú |
|---|:---:|:---:|:---:|:---:|---|
| **A. Migration 016 (T-32)** | 2 | 2 | 0 | 0 | Tạo bảng `id_tags`, unique tag, index `user_id`, rollback sạch |
| **B. Unit test & Logic thuần (T-33)** | 7 | 7 | 0 | 0 | `evaluateIdTag`, `maskIdTag`, mock pool các trạng thái thẻ |
| **C. Acceptance Test Suite S-15** | 8 | 8 | 0 | 0 | Đạt toàn bộ AC1–AC5 và NFRs với CSDL PostgreSQL thật |
| **D. Tích hợp Seed demo** | 5 | 5 | 0 | 0 | Khởi tạo thẻ demo cho tài xế, chạy lại không trùng |
| **TỔNG CỘNG** | **22** | **22** | **0** | **0** | **Tỷ lệ đạt: 100% (22/22 ca PASS)** |

---

## Đánh giá theo Tiêu chí chấp nhận (Acceptance Criteria)

### 1. AC1: Thẻ hợp lệ, trạm hoạt động $\rightarrow$ `Accepted`
- **Kết quả:** **ĐẠT (PASS)**.
- Khi trụ thuộc trạm đang hoạt động (`ACTIVE`, không bị khoá) gửi `Authorize` với thẻ có trạng thái `ACTIVE` và chưa hết hạn, hệ thống phản hồi `CALLRESULT` chứa `{ idTagInfo: { status: "Accepted" } }`.

### 2. AC2: Thẻ bị khoá $\rightarrow$ `Blocked`
- **Kết quả:** **ĐẠT (PASS)**.
- Thẻ có trạng thái `status = 'BLOCKED'` trong bảng `id_tags` nhận về `{ idTagInfo: { status: "Blocked" } }`.

### 3. AC3: Thẻ quá hạn $\rightarrow$ `Expired`
- **Kết quả:** **ĐẠT (PASS)**.
- Thẻ có `expires_at < now()` nhận về `{ idTagInfo: { status: "Expired" } }`.

### 4. AC4: Thẻ không có trong CSDL $\rightarrow$ `Invalid` và ghi nhật ký lần thử
- **Kết quả:** **ĐẠT (PASS)**.
- Thẻ lạ không tồn tại trong `id_tags` phản hồi `{ idTagInfo: { status: "Invalid" } }`. Hệ thống ghi nhận cảnh báo trong log: `[OCPP] Authorize: Thẻ không tồn tại hoặc không hợp lệ | ...`.

### 5. AC5: Trạm tạm ngừng hoặc bị khoá $\rightarrow$ `Blocked`
- **Kết quả:** **ĐẠT (PASS)**.
- Kể cả khi thẻ hoàn toàn hợp lệ:
  - Nếu trạm có trạng thái `INACTIVE` hoặc `MAINTENANCE`: phản hồi `Blocked`.
  - Nếu trạm bị quản trị viên khoá (`locked_at IS NOT NULL`): phản hồi `Blocked` (hoặc lớp cổng bảo mật khung chặn với `SecurityError`).

### 6. Yêu cầu phi chức năng (NFR)
- **Bảo mật dữ liệu định danh:** Log tuyệt đối không in mã thẻ thô đầy đủ. Hàm `maskIdTag` chỉ giữ lại tối đa 4 ký tự cuối (ví dụ: `TAG-VALID-1234` $\rightarrow$ `**********1234`).
- **Tuân thủ OCPP 1.6 (CiString20Type):** Thẻ dài hơn 20 ký tự bị từ chối ngay ở tầng handler với lỗi `OcppCallError('FormationViolation', ...)` $\rightarrow$ khung gửi lại `[4, messageId, "FormationViolation", ...]`.
- **Tái sử dụng cho Sprint 3 (S-17):** Hàm thuần `evaluateIdTag({ tagRecord, station, now })` được xuất độc lập, sẵn sàng để `StartTransaction` tái sử dụng mà không cần viết lại logic kiểm tra thẻ.

---

## Chi tiết test case Acceptance (File `S-15.authorize.test.js`)

| Test Case | Tiêu chí | Khung gửi | Khung nhận / Kết quả | Bằng chứng |
|---|---|---|---|---|
| **TC-01** | AC1 | `[2, "auth-1", "Authorize", {"idTag": "TAG-VALID-1234"}]` | `[3, "auth-1", {"idTagInfo": {"status": "Accepted"}}]` | PASS (12.35ms) |
| **TC-02** | AC2 | `[2, "auth-2", "Authorize", {"idTag": "TAG-BLOCKED-5678"}]` | `[3, "auth-2", {"idTagInfo": {"status": "Blocked"}}]` | PASS (2.19ms) |
| **TC-03** | AC3 | `[2, "auth-3", "Authorize", {"idTag": "TAG-EXPIRED-9999"}]` | `[3, "auth-3", {"idTagInfo": {"status": "Expired"}}]` | PASS (2.40ms) |
| **TC-04** | AC4 | `[2, "auth-4", "Authorize", {"idTag": "NON-EXISTENT-TAG"}]` | `[3, "auth-4", {"idTagInfo": {"status": "Invalid"}}]` | PASS (2.18ms) + Warning Log |
| **TC-05** | AC5 | Gửi tới trạm `INACTIVE` và trạm có `locked_at` | Trả về `status: "Blocked"` | PASS (2.08ms) |
| **TC-06** | NFR Log | Gửi thẻ bí mật `SECRETTAG1234` | Log ghi `*********1234`, không lộ `SECRETTAG1234` | PASS (1.66ms) |
| **TC-07** | OCPP 1.6 | Gửi `idTag` 21 ký tự | Trả về `[4, "auth-long", "FormationViolation", ...]` | PASS (0.48ms) |
| **TC-08** | S-17 Export | Gọi hàm thuần `evaluateIdTag` trực tiếp | Trả về đúng 4 trạng thái chuẩn | PASS (0.14ms) |

---

## Kết luận
Story **S-15 (GYM-41)** đã hoàn thành xuất sắc, đáp ứng 100% Definition of Done (DoD), không gây hồi quy (regression) và sẵn sàng đóng gói.
