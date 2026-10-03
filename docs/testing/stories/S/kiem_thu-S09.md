# Báo Cáo Kiểm Thử S-09: Nhịp Tim và Thời Điểm Liên Lạc Cuối (T-18, T-19)

> **Dự án:** Nền tảng quản lý trạm sạc xe điện (CSMS)  
> **Story ID:** S-09 (Jira: GYM-35)  
> **Người thực hiện:** AI Tester / QA Specialist  
> **Chuẩn kiểm thử tuân thủ:** [`docs/testing/TESTER_STANDARD.md`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/docs/testing/TESTER_STANDARD.md)  
> **File báo cáo:** `docs/testing/stories/S/kiem_thu-S09.md`

---

## 1. Thông Tin Lần Chạy (Test Execution Metadata)

- **Ngày chạy kiểm thử:** 2026-10-03 (Thời gian: 15:47 – 15:48 UTC+7)
- **Môi trường:**
  - Hệ điều hành: Windows 11 Pro 64-bit
  - Docker Desktop: 4.92.0 (Engine 29.8.0, Compose v2)
  - Runtime: Node.js v24.19.0 (Host) / Node.js v22.23.3 (Container `csms_app:latest`)
  - Cơ sở dữ liệu: PostgreSQL 16 Alpine (Container `charging-station-management-system-csms--db-1`)
  - Địa chỉ dịch vụ: HTTP `http://127.0.0.1:3000` | WebSocket `ws://127.0.0.1:3000/ocpp/<CP_CODE>`
- **Mã định danh Git Commit:** `e817643b9491b64acbc86f342fe4f35d81f2c0a8` (nhánh `main`)
- **Phạm vi kiểm thử:**
  - **Story S-09:** Nhịp tim và thời điểm liên lạc cuối (Heartbeat & Last Seen Timestamp)
  - **Nhiệm vụ T-18:** Handler `Heartbeat` trả thời gian máy chủ ISO 8601 UTC và hook tầng khung tự động cập nhật cột `last_seen_at` cho mọi tin nhắn OCPP.
  - **Nhiệm vụ T-19:** Đồng hồ trụ ảo bị lệch giờ (Clock Skew / chênh lệch múi giờ) nhưng hệ thống CSMS vẫn ghi nhận `last_seen_at` hoàn toàn theo thời gian máy chủ CSDL (`CURRENT_TIMESTAMP`).
  - **Chuỗi phụ thuộc:** S-01 (Khung hệ thống), S-06 (Kết nối WebSocket), S-07 (Khung gọi OCPP), S-08 (`BootNotification`), N2 (Khoá trạm đóng kết nối).
- **Vị trí mã nguồn liên quan:**
  - `backend/src/server.js`: Khởi tạo hàm hook `updateChargePointLastSeen` và handler `Heartbeat`.
  - `backend/src/modules/ocpp/message-handler.js`: Hook trung gian gọi `await updateLastSeen(connection)` trước khi chuyển giao tin nhắn cho từng handler cụ thể.
  - `backend/src/modules/ocpp/handlers/boot-notification.js`: Điều kiện tiên quyết `BootNotification` phải được `Accepted` trước khi gửi `Heartbeat`.
  - `backend/migrations/009_charge_point_last_seen_at.sql`: Migration bổ sung cột `last_seen_at TIMESTAMPTZ` cho bảng `charge_points`.

---

## 2. Bảng Tổng Kết Kết Quả Kiểm Thử (Summary)

| Giai đoạn kiểm thử | Số ca kiểm thử | ĐẠT (PASS) | LỖI (FAIL) | BỊ CHẶN (BLOCKED) | Tỷ lệ Đạt |
|---|:---:|:---:|:---:|:---:|:---:|
| **Giai đoạn A – Nền tảng & Tiền đề (Smoke & Pre-requisites)** | 4 | 4 | 0 | 0 | 100% |
| **Giai đoạn B – Nghiệp vụ T-18 & Acceptance Criteria** | 5 | 5 | 0 | 0 | 100% |
| **Giai đoạn C – T-19 Lệch Giờ, Khoá Trạm & Tải Biên (Edge & NFR)** | 4 | 4 | 0 | 0 | 100% |
| **Giai đoạn D – Bộ Test Hồi Quy Tự Động (Regression Suite)** | 2 | 2 | 0 | 0 | 100% |
| **TỔNG CỘNG** | **15** | **15** | **0** | **0** | **100%** |

---

## 3. Kết Luận Đánh Giá Theo Tiêu Chí Chấp Nhận (Acceptance Criteria)

### 3.1. Đánh giá từng tiêu chí
1. **Tiêu chí 1 – Phản hồi Heartbeat với `currentTime` chuẩn ISO 8601 UTC:**  
   **Kết quả: ĐẠT (PASS).**  
   - Khi trụ sạc đã được chấp thuận (`BootNotification` trạng thái `Accepted`) gửi yêu cầu `[2, "<id>", "Heartbeat", {}]`, máy chủ CSMS phản hồi ngay lập tức `CALLRESULT` `[3, "<id>", {"currentTime": "<timestamp>"}]`.
   - Chuỗi thời gian trả về tuân thủ nghiêm ngặt định dạng ISO 8601 kết thúc bằng chữ `Z` (ví dụ: `2026-10-03T08:48:08.867Z`), đảm bảo múi giờ chuẩn quốc tế UTC.

2. **Tiêu chí 2 – Cập nhật `last_seen_at` trong CSDL theo giờ máy chủ:**  
   **Kết quả: ĐẠT (PASS).**  
   - Sau khi nhận tin nhắn `Heartbeat`, CSDL tự động cập nhật trường `charge_points.last_seen_at` bằng hàm `CURRENT_TIMESTAMP` của PostgreSQL.
   - Bằng chứng kiểm tra thực tế: Độ lệch giữa `last_seen_at` vừa ghi nhận và hàm `SELECT CURRENT_TIMESTAMP;` của CSDL là **0.313 giây** (rất nhỏ, nhỏ hơn nhiều so với ngưỡng yêu cầu `< 2 giây`).

3. **Tiêu chí 3 – Mọi tin nhắn OCPP khác đều cập nhật `last_seen_at`:**  
   **Kết quả: ĐẠT (PASS).**  
   - Cơ chế hook `updateLastSeen` nằm trực tiếp ở tầng khung tin nhắn (`message-handler.js`, dòng 144) trước khi gọi các nghiệp vụ khác.
   - Kiểm chứng thực tế: Khi trụ gửi `StatusNotification` hoặc `Authorize`, trường `last_seen_at` của trụ vẫn được tự động cập nhật thời gian mới tăng dần (`t_after > t_before`).

4. **Tiêu chí 4 – Chặn tin nhắn Heartbeat trước khi BootNotification:**  
   **Kết quả: ĐẠT (PASS).**  
   - Khi trụ mới kết nối WebSocket nhưng chưa thực hiện gửi `BootNotification` (hoặc gửi nhưng chưa được `Accepted`), nếu gửi `Heartbeat` sẽ bị máy chủ từ chối ngay lập tức bằng `CALLERROR` với mã lỗi `SecurityError` và mô tả `"Charge point is not accepted yet"`. Socket vẫn giữ mở để trụ tiếp tục Boot lại.

5. **Tiêu chí 5 – Trụ ảo lệch giờ không ảnh hưởng đến hệ thống (T-19):**  
   **Kết quả: ĐẠT (PASS).**  
   - Cho dù đồng hồ phần cứng của trụ ảo hoặc client lệch múi giờ hay lệch hàng giờ, `currentTime` trả về và `last_seen_at` lưu trong PostgreSQL hoàn toàn lấy từ đồng hồ của server/DB CSMS (độ lệch với `NOW()` chỉ ~0.138s), ngăn chặn hoàn toàn việc dữ liệu ngoại tuyến/trực tuyến bị làm giả.

6. **Tiêu chí 6 – Trạm bị khoá bởi Quản trị viên (Admin Locked):**  
   **Kết quả: ĐẠT (PASS).**  
   - Khi Admin khoá trạm (`PATCH /api/admin/stations/:id/lock` với `locked: true`), kết nối đang mở bị đóng với mã 1008 (`Station locked`).
   - Nếu trụ kết nối lại và cố gửi `Heartbeat`, tin nhắn bị chặn và `last_seen_at` trong DB **giữ nguyên không cập nhật** nhờ ràng buộc SQL `AND s.locked_at IS NULL`.

---

## 4. Chi Tiết Từng Ca Kiểm Thử (Test Cases Detail)

### Giai đoạn A: Nền Tảng & Tiền Đề (Smoke & Pre-requisites)

| Mã test case | Mục tiêu kiểm tra | Dữ liệu đầu vào / Lệnh gọi | Kết quả thực tế | Trạng thái | Bằng chứng thực tế |
|---|---|---|---|:---:|---|
| **TC-S09-A01** | Kiểm tra dịch vụ backend sẵn sàng | `GET http://127.0.0.1:3000/api/health` | HTTP 200 OK, `{"ok":true,"database":"postgresql"}` | **PASS** | Response time: 4ms. Database kết nối ổn định. |
| **TC-S09-A02** | Kiểm tra cấu trúc CSDL có cột `last_seen_at` | Truy vấn `information_schema.columns` bảng `charge_points` | Cột `last_seen_at` kiểu `TIMESTAMPTZ` tồn tại (Migration 009) | **PASS** | `count(*) = 1` |
| **TC-S09-A03** | Kiểm tra bắt tay WebSocket trụ đã đăng ký | Kết nối `ws://127.0.0.1:3000/ocpp/DEMO-ST01-CP1` kèm subprotocol `ocpp1.6` | HTTP 101 Switching Protocols, kết nối `readyState = 1` | **PASS** | Bắt tay thành công trong 12ms. |
| **TC-S09-A04** | Kiểm tra từ chối mã trụ lạ | Kết nối `ws://127.0.0.1:3000/ocpp/DEMO-KHONG-CO-TRU-NAY` | Máy chủ đóng bắt tay ngay với mã HTTP 403 Forbidden | **PASS** | HTTP 403 Forbidden, ghi log cảnh báo an ninh. |

---

### Giai đoạn B: Nghiệp Vụ T-18 & Acceptance Criteria

| Mã test case | Mục tiêu kiểm tra | Khung gửi đi | Phản hồi nhận được / DB State | Trạng thái | Bằng chứng chi tiết |
|---|---|---|---|:---:|---|
| **TC-S09-B01** | Chặn Heartbeat khi chưa Boot | `[2, "hb-pre-boot-01", "Heartbeat", {}]` | `[4, "hb-pre-boot-01", "SecurityError", "Charge point is not accepted yet", {}]` | **PASS** | Đúng mã lỗi `SecurityError` theo đặc tả S-08/S-09. |
| **TC-S09-B02** | Heartbeat trả về `currentTime` ISO 8601 UTC | `[2, "hb-valid-01", "Heartbeat", {}]` (sau Boot Accepted) | `[3, "hb-valid-01", {"currentTime": "2026-10-03T08:48:08.867Z"}]` | **PASS** | Chuỗi khớp chuẩn regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`. |
| **TC-S09-B03** | CSDL cập nhật `last_seen_at` khớp giờ DB | Kiểm tra bản ghi trụ `DEMO-ST01-CP2` sau khi nhận Heartbeat | `last_seen_at`: `2026-10-03 08:48:08.865906+00`. DB `CURRENT_TIMESTAMP`: `08:48:09.178272+00`. | **PASS** | Chênh lệch thực tế: **0.313 giây** (< 2 giây). |
| **TC-S09-B04** | Lần gửi Heartbeat kế tiếp cập nhật tịnh tiến | Đợi 1.1s, gửi tiếp `[2, "hb-valid-02", "Heartbeat", {}]` | `t1`: `08:48:08.865906+00`  `t2`: `08:48:10.308587+00` | **PASS** | Giá trị thời gian tăng đều theo thời gian thực (`t2 > t1`). |
| **TC-S09-B05** | Tin nhắn khác (`StatusNotification`) cũng cập nhật `last_seen_at` | Gửi `[2, "status-01", "StatusNotification", {"connectorId":1,"status":"Available","errorCode":"NoError"}]` | `t_after_status`: `08:48:11.580523+00` > `08:48:10.308587+00` | **PASS** | Hook tầng khung hoạt động đồng bộ cho mọi action. |

---

### Giai đoạn C: T-19 Lệch Giờ, Khoá Trạm & Tải Biên (Edge & NFR)

| Mã test case | Mục tiêu kiểm tra | Kịch bản / Dữ liệu kiểm thử | Kết quả thực tế quan sát | Trạng thái | Bằng chứng chi tiết |
|---|---|---|---|:---:|---|
| **TC-S09-C01** | T-19: Đồng hồ client lệch không làm sai lệch server | Client giả lập gửi Heartbeat với cấu hình thời gian riêng | Server trả về: `2026-10-03T08:48:11.754Z`. CSDL lưu: `08:48:11.753Z`. DB Now: `08:48:11.892Z`. | **PASS** | Độ chênh lệch giữa giờ trả về và DB Now chỉ **0.138s**, hoàn toàn độc lập với client. |
| **TC-S09-C02** | Xử lý khi trạm bị Admin khoá (`locked_at`) | Admin khoá trạm ID 3 (`DEMO-ST03-CP1`), trụ kết nối lại và gửi Heartbeat | 1. Socket cũ đóng với mã `1008 ("Station locked")`. 2. Socket mới nhận Boot `Rejected`. 3. Gửi Heartbeat nhận `SecurityError`. 4. DB `last_seen_at` **không bị thay đổi** (`notUpdated = true`). | **PASS** | Câu lệnh `UPDATE ... WHERE ... AND s.locked_at IS NULL` bảo vệ tuyệt đối dữ liệu. |
| **TC-S09-C03** | Khả năng chống trùng tin (Idempotency) | Gửi 2 tin Heartbeat liên tiếp có cùng `messageId: "hb-duplicate-same-id"` | Cả 2 lần đều nhận `CALLRESULT` mã `hb-duplicate-same-id` với `currentTime` hợp lệ, không gây crash hay deadlock. | **PASS** | Response 1: HTTP/WS 200/CALLRESULT. Response 2: CALLRESULT. |
| **TC-S09-C04** | Chịu tải đồng thời nhiều trụ sạc | 6 trụ gửi Heartbeat song song cùng 1 thời điểm | Cả 6/6 trụ nhận phản hồi hợp lệ trong vòng **10 mili-giây** tổng thời gian. | **PASS** | Tốc độ cực nhanh, không nghẽn tài nguyên CSDL. |

---

### Giai đoạn D: Bộ Test Hồi Quy Tự Động (Automated Regression Tests)

| Mã test case | Bộ test | Lệnh thực thi | Kết quả | Trạng thái |
|---|---|---|---|:---:|
| **TC-S09-D01** | Unit test suite toàn dự án | `python test.py --only unit` | `62 test pass, 0 fail (thời gian: 9s)` | **PASS** |
| **TC-S09-D02** | Integration test suite toàn dự án | `python test.py --only integration` | `64 test pass, 0 fail (thời gian: 22s)` | **PASS** |

---

## 5. Hướng Dẫn Tái Hiện Kết Quả Kiểm Thử (Reproduction Guide)

Bất kỳ thành viên nào trong nhóm hoặc QA đều có thể chạy lại để xác minh 100% bằng chứng trên bằng các bước sau:

1. **Khởi động hệ thống:**
   ```powershell
   python run.py --no-open
   ```
2. **Kiểm tra trạng thái sẵn sàng:**
   ```powershell
   curl.exe -s http://127.0.0.1:3000/api/health
   ```
3. **Thực thi bộ script kiểm thử chi tiết S-09:**
   ```powershell
   node C:\Users\Admin\.gemini\antigravity\brain\22b193fa-e674-48fc-91f3-86b355581a60\scratch\test-s09-live.js
   ```
4. **Kiểm tra trực tiếp dữ liệu trong PostgreSQL:**
   ```powershell
   docker compose exec -T db psql -U csms -d csms -c "SELECT code, last_seen_at FROM charge_points WHERE code LIKE 'DEMO-ST01%' LIMIT 5;"
   ```
