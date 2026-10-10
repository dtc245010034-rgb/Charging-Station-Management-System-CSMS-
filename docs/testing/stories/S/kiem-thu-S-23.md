# Hồ sơ kiểm thử S-23 (GYM-49)

**Tính năng:** Vận hành viên dừng phiên sạc từ xa (`RemoteStopTransaction`)  
**Mã Story:** S-23 (GYM-49, 2 SP, Must)  
**Nhánh kiểm thử:** `minh/GYM49-S23` (commit `e836b3a`)  
**Người kiểm thử:** Tester & Code Auditor  
**Thời điểm kiểm thử:** 10/10/2026 (khoảng 18:30 UTC+7)  
**Môi trường kiểm thử:** 
- Hệ điều hành: Windows 11
- Nền tảng: Node.js v22/v24, Docker Compose v2
- Cơ sở dữ liệu: PostgreSQL 16 Alpine (`csms` cổng 5432 và `csms_test` cổng 5433)
- Máy chủ CSMS: Express 5 + WebSocket (`ws`), lắng nghe tại `http://localhost:3000`

---

## 1. Tổng quan phạm vi kiểm thử

- **T-49 (Backend API & OCPP):**
  - Endpoint `POST /api/sessions/:id/stop` kiểm tra quyền `sessions:stop` (`ADMIN`, `OPERATOR`).
  - Gửi lệnh `RemoteStopTransaction { transactionId }` xuống trụ sạc qua kết nối WebSocket.
  - Phản hồi HTTP 202 `Accepted` kèm hạn chót `deadline` (mặc định 120s `REMOTE_STOP_WAIT_SECONDS`).
  - Xử lý các mã lỗi: Trụ từ chối (HTTP 422), Ngoại tuyến (HTTP 409), Hết giờ chờ CALL (HTTP 504), Tranh chấp bấm trùng (HTTP 409).
  - Tích hợp handler `StopTransaction` kết thúc phiên (`status = 'COMPLETED'`, `remote_stop_status = 'STOPPED'`), gỡ cờ `needs_review` tạm thời nếu trước đó timeout.
  - Background job `remote-stop-job.js` quét các phiên `ACCEPTED` quá deadline, đánh dấu `TIMED_OUT` và `needs_review = true`, không tự đóng phiên.
  - Ghi nhật ký kiểm toán vào `audit_logs` cho mọi trạng thái (`ACCEPTED`, `REJECTED`, `OFFLINE`, `ERROR`, `TIMEOUT`, `STOPPED`).
- **T-50 (Frontend UI):**
  - Trang quản lý phiên sạc `frontend/pages/shared/sessions.js` cho Vận hành viên và Quản trị viên.
  - Danh sách phiên sạc đang hoạt động (`status = 'CHARGING'`).
  - Nút "Dừng phiên" có hộp thoại xác nhận, khóa nút khi đang gửi, hiển thị nhãn "Đang chờ trụ" và đồng hồ đếm ngược `Còn mm:ss`.
  - Hiển thị 3 loại thông báo lỗi phân biệt: Ngoại tuyến, Từ chối, Quá hạn chờ phản hồi.
- **Simulator & Công cụ:**
  - `tools/demo-charge-point.js`: Cờ `--remote-stop <accept|reject|silent|error>` và lệnh CLI `start`, `remote-stop-mode`.

---

## 2. Tổng kết kết quả kiểm thử tự động

| Nhóm kiểm thử | File kiểm thử | Số ca | PASS | FAIL | Ghi chú |
|---|---|:---:|:---:|:---:|---|
| **Acceptance (E2E)** | `backend/tests/acceptance/S-23.remote-stop.test.js` | 6 | 6 | 0 | Chạy với server process thật & PostgreSQL test thật (8154 ms) |
| **Unit – Job Timeout** | `backend/tests/unit/S-23.remote-stop-job.test.js` | 2 | 2 | 0 | Kiểm tra câu SQL DB time, chống quét chồng chéo |
| **Unit – Commands** | `backend/tests/unit/ocpp-authorize-commands.test.js` | 1 | 1 | 0 | Ánh xạ lỗi dùng chung: Accepted, 422, 409, 504 |
| **Unit – UI Router** | `backend/tests/unit/frontend.test.js` | 2 | 2 | 0 | Quyền truy cập trang phiên sạc: Operator/Admin thấy, Owner/Accountant ẩn |
| **Integration – Migration** | `backend/tests/integration/migrate-017-charging-sessions.test.js` | 1 | 1 | 0 | Rollback 025 (xóa cột và index) và up lại sạch |
| **Regression – S-18** | `backend/tests/unit/ocpp-stop-transaction.test.js` | 8 | 8 | 0 | Handler StopTransaction không bị ảnh hưởng tiêu cực |
| **Regression – S-22** | `backend/tests/unit/S-22.sessions.test.js` | 16 | 16 | 0 | Service sessions formatSession & đọc phiên tài xế |
| **Linter** | `npm run lint` (`eslint backend frontend`) | — | 100% | 0 | Sạch cú pháp, không có warning |
| **TỔNG CỘNG** | | **36** | **36** | **0** | **100% PASS** |

---

## 3. Bằng chứng kiểm thử thực tế với Trụ ảo Live (Live Simulator Verification)

Đã thực hiện kịch bản kiểm thử trực tiếp trên môi trường Docker thực tế (`http://localhost:3000` và `ws://localhost:3000/ocpp/*`):

### Kịch bản 1: Luồng thành công trọn vẹn (Happy Path)
1. **Đăng nhập Vận hành viên:** `operator@demo.csms.local` $\rightarrow$ Nhận session cookie hợp lệ.
2. **Trụ ảo kết nối:** `DEMO-ST01-CP1` kết nối WebSocket `ws://localhost:3000/ocpp/DEMO-ST01-CP1`.
3. **Khởi tạo phiên:** Trụ gửi `BootNotification` (`Accepted`), `StatusNotification` (`Preparing`), và `StartTransaction` (đầu nối 1, số đo ban đầu `12500 Wh`).
   - Kết quả: Hệ thống cấp `transactionId = 35`, trạng thái `CHARGING`.
4. **Vận hành viên xem danh sách:** Gọi `GET /api/sessions` $\rightarrow$ Phiên #35 hiển thị đầy đủ thông tin trạm, trụ, đầu nối.
5. **Vận hành viên bấm Dừng phiên:** Gọi `POST /api/sessions/35/stop`:
   - Phản hồi từ máy chủ: HTTP `202 Accepted`, kèm `deadline: "2026-10-10T11:33:52.000Z"`.
   - Giao tiếp phía trụ ảo: Nhận frame `[2, msgId, "RemoteStopTransaction", { "transactionId": 35 }]`.
   - Phản hồi phía trụ ảo: Gửi `[3, msgId, { "status": "Accepted" }]`.
6. **Trụ ảo ngắt sạc thực tế:** Trụ ảo gửi `StopTransaction` (`transactionId: 35`, `meterStop: 18500 Wh`, `reason: "Remote"`).
   - Máy chủ xác nhận: Trả về `[3, msgId, {}]`.
7. **Kiểm tra chốt phiên:** Gọi `GET /api/sessions/35`:
   - `status`: `COMPLETED`
   - `remote_stop_status`: `STOPPED`
   - `stop_reason`: `Remote`
   - `current_kwh`: `6` $((18500 - 12500)/1000)$
   - `needs_review`: `false`
$\rightarrow$ **Kết quả:** **ĐẠT (Thành công 100%)**.

### Kịch bản 2: Trụ từ chối dừng (Rejected)
1. Kết nối trụ ảo `DEMO-ST01-CP2`, mở phiên #36.
2. Cấu hình trụ ảo trả về `{ "status": "Rejected" }` khi nhận lệnh dừng.
3. Vận hành viên bấm dừng phiên $\rightarrow$ Máy chủ trả về HTTP `422 Unprocessable Entity`.
4. Kiểm tra DB: Phiên vẫn tiếp tục hoạt động (`status = 'CHARGING'`), `remote_stop_status = 'REJECTED'`.
$\rightarrow$ **Kết quả:** **ĐẠT**.

### Kịch bản 3: Trụ ngoại tuyến (Offline)
1. Ngắt kết nối socket của trụ ảo `DEMO-ST01-CP2`.
2. Vận hành viên gửi yêu cầu dừng $\rightarrow$ Máy chủ kiểm tra kết nối và trả về HTTP `409 Conflict` trong < 100ms.
3. Mã lỗi trả về: `CHARGE_POINT_OFFLINE`. Không có tin nhắn CALL nào bị gửi đi.
$\rightarrow$ **Kết quả:** **ĐẠT**.

---

## 4. Bảng đối chiếu Tiêu chí Chấp nhận (Acceptance Criteria & NFR)

| Tiêu chí | Mô tả tiêu chí | Kết quả kiểm thử | Đánh giá |
|---|---|---|:---:|
| **AC-01** | Trụ chấp nhận dừng: Phiên giữ `CHARGING`, trạng thái lệnh chuyển `ACCEPTED`, đếm ngược 120s chờ `StopTransaction`. | Trả HTTP 202 kèm deadline; phiên chỉ đóng khi nhận StopTransaction thật từ trụ. | **ĐẠT** |
| **AC-02** | Trụ từ chối dừng: Trả HTTP 422, phiên tiếp tục sạc, trạng thái `REJECTED`. | Trả 422 `CHARGE_POINT_REJECTED`; phiên không bị gián đoạn. | **ĐẠT** |
| **AC-03** | Trụ ngoại tuyến: Trả HTTP 409 ngay lập tức, không gửi tin nhắn mạng. | Trả 409 `CHARGE_POINT_OFFLINE` trong < 100ms. | **ĐẠT** |
| **AC-04** | Hết giờ chờ phản hồi lệnh (timeout 30s): Trả HTTP 504, đánh dấu `ERROR` và `needs_review = true`. | Bật cờ xem xét với lý do `REMOTE_STOP_RESULT_UNKNOWN`. | **ĐẠT** |
| **AC-05** | Chặn bấm trùng: Đang có lệnh chờ (`SENDING` hoặc `ACCEPTED`) trả HTTP 409 Conflict. | Khóa hàng `FOR UPDATE`, chặn double-send thành công. | **ĐẠT** |
| **AC-06** | Quá hạn 120s không có `StopTransaction`: Chuyển `TIMED_OUT`, `needs_review = true`, không tự đóng phiên. | Job nền quét theo giờ DB, bảo toàn `status = 'CHARGING'`. | **ĐẠT** |
| **AC-07** | Nhận `StopTransaction` muộn: Chốt số kWh, chuyển `STOPPED`, tự động gỡ cờ review tạm thời. | Phiên hoàn tất sạch sẽ, không giữ cờ review sai. | **ĐẠT** |
| **NFR-01** | Phân quyền RBAC: Chỉ `ADMIN` và `OPERATOR` được phép dừng phiên. | `STATION_OWNER`, `DRIVER`, `ACCOUNTANT` nhận 403 Forbidden. | **ĐẠT** |
| **NFR-02** | Nhật ký kiểm toán: Ghi vết đầy đủ mọi pha vào `audit_logs`. | Ghi nhận actor, entity, charge_point_id, IP và kết quả. | **ĐẠT** |
| **NFR-03** | Bảo vệ dữ liệu cá nhân (NĐ 13): Không lưu mã thẻ thô. | Chỉ hiển thị mã che 4 số cuối `id_tag_masked`. | **ĐẠT** |

---

## 5. Hướng dẫn Kiểm tra Thủ công trên Trình duyệt (Manual UI Verification)

Dành cho Tester hoặc Product Owner kiểm tra giao diện người dùng:
1. Mở trình duyệt tại địa chỉ `http://localhost:3000`.
2. Đăng nhập với tài khoản:
   - Email: `operator@demo.csms.local`
   - Mật khẩu: `demo12345`
3. Nhấp vào mục **"Phiên sạc"** trên thanh điều hướng bên trái (URL `/#/operator/sessions`).
4. Quan sát danh sách các phiên sạc đang hoạt động:
   - Kiểm tra mã trụ, tên trạm, cổng sạc, số kWh tiêu thụ.
   - Thử nghiệm trên màn hình thu nhỏ (Mobile width: 360px - 400px): Các thẻ phiên sạc hiển thị ngay ngắn, không bị vỡ layout.
5. Nhấp nút **"Dừng phiên"**:
   - Xuất hiện hộp thoại xác nhận: *"Gửi yêu cầu dừng phiên #... trên trụ ...?"*.
   - Nhấn **OK** $\rightarrow$ Nút chuyển sang trạng thái disabled mang nhãn *"Đang chờ trụ"*, phía dưới hiện đếm ngược: *"Trụ đã chấp nhận yêu cầu dừng... còn 01:59"*.
   - Sau khi trụ xác nhận kết thúc $\rightarrow$ Xuất hiện thông báo thanh card xanh thông báo phiên đã kết thúc thành công.

---

## 6. Kết luận của Tester & Auditor

1. **Chất lượng mã nguồn & Kiến trúc:** Nhánh `minh/GYM49-S23` hoàn thành xuất sắc toàn bộ các yêu cầu của Story S-23 (GYM-49). Mã nguồn tuân thủ đúng các quyết định kỹ thuật D1, D9, D10 của Sprint 3.
2. **Độ ổn định:** Vượt qua 100% các ca kiểm thử chấp nhận tự động và kiểm thử trực tiếp trên trụ ảo mô phỏng.
3. **Đánh giá Definition of Done (DoD):** **ĐẠT ĐỦ ĐIỀU KIỆN MERGE**.
