# Báo Cáo & Đặc Tả Kiểm Thử S-09: Nhịp Tim và Thời Điểm Liên Lạc Cuối (T-18, T-19)

> **Dự án:** Nền tảng quản lý trạm sạc xe điện (CSMS)  
> **Story ID:** S-09 (Jira: GYM-35)  
> **Người thực hiện:** QA Specialist / Independent AI Tester  
> **Chuẩn quy trình:** [`docs/testing/TESTER_STANDARD.md`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/docs/testing/TESTER_STANDARD.md)  
> **Đường dẫn báo cáo:** `docs/testing/stories/S/kiem_thu-S09.md`  
> **Script kiểm chứng tự động (Repo-Native):** [`tools/verify-s09-live.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/tools/verify-s09-live.js)

---

## 1. Thông Tin Lần Chạy & Môi Trường Kiểm Thử (Execution Metadata)

- **Ngày chạy kiểm thử:** 2026-10-03 (Thời gian: 16:56 UTC+7)
- **Commit SHA:** `ec49cea` (nhánh `nam/docs-kiem-thu-s09-s10-s11`, tích hợp S-09/S-10/S-11)
- **Môi trường thực thi:**
  - Hệ điều hành: Windows 11 (WSL2 / Docker Desktop 4.92.0)
  - Runtime Node.js: v22.23.3 (Container `csms_app:latest`) / Host v24.19.0
  - Cơ sở dữ liệu: PostgreSQL 16 Alpine (`charging-station-management-system-csms--db-1`)
  - Giao thức: WebSocket OCPP 1.6J (`ws://127.0.0.1:3000/ocpp/<CP_CODE>`)
- **Phân loại kiểm thử:** Kết hợp Kiểm thử tự động (Automated Test Suite) + Kiểm thử tích hợp Runtime trên Container sống (Live Integration Test).
- **Mã nguồn liên quan:**
  - `backend/src/server.js`: Hook `updateChargePointLastSeen` và handler `Heartbeat`.
  - `backend/src/modules/ocpp/message-handler.js`: Tầng đón nhận khung và gọi hook `updateLastSeen` trước mọi nghiệp vụ.
  - `backend/migrations/009_charge_point_last_seen_at.sql`: Cột `last_seen_at TIMESTAMPTZ` trong bảng `charge_points`.
  - `backend/tests/integration/ocpp-heartbeat-timezone.test.js`: Bộ test lệch múi giờ trụ ảo.

---

## 2. Bảng Tổng Kết Kết Quả Kiểm Thử (Summary)

| Phân nhóm kiểm thử | Loại kiểm thử | Tổng số ca | PASS | FAIL | BLOCKED | Tỷ lệ Đạt |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Giai đoạn A – Nền tảng (Smoke & Schema)** | Automated / Live | 4 | 4 | 0 | 0 | 100% |
| **Giai đoạn B – Nghiệp vụ T-18 & Acceptance Criteria** | Live Runtime | 5 | 5 | 0 | 0 | 100% |
| **Giai đoạn C – T-19 Lệch Giờ, Khoá Trạm & Tải Biên** | Live Runtime | 4 | 4 | 0 | 0 | 100% |
| **Giai đoạn D – Bộ Test Hồi Quy Tự Động (CI Suite)** | CI Automated | 2 | 2 | 0 | 0 | 100% |
| **TỔNG CỘNG** | | **15** | **15** | **0** | **0** | **100%** |

---

## 3. Ma Trận Truy Vết Tiêu Chí Chấp Nhận & Bằng Chứng Thực Tế (AC Traceability)

| Tiêu chí chấp nhận (AC) | Mô tả yêu cầu | Ca test chứng minh | Bằng chứng thực tế xác thực (Raw Evidence) | Đánh giá |
|---|---|:---:|---|:---:|
| **AC-1: Phản hồi Heartbeat chuẩn ISO 8601 UTC** | Trụ đã Boot gửi `Heartbeat` nhận `CALLRESULT` chứa `currentTime` dạng ISO UTC kết thúc bằng `Z`. | TC-S09-B02 | `[3, "hb-valid-01", {"currentTime": "2026-10-03T09:56:16.892Z"}]`<br>Regex `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` = `true`. | **PASS** |
| **AC-2: Cập nhật `last_seen_at` theo giờ DB** | CSDL cập nhật `charge_points.last_seen_at = CURRENT_TIMESTAMP`, sai lệch với DB `< 2 giây`. | TC-S09-B03 | DB `last_seen_at`: `2026-10-03 09:56:16.887+00`<br>DB `NOW()`: `2026-10-03 09:56:17.189+00`<br>Chênh lệch: **0.302 giây** (< 2.0s). | **PASS** |
| **AC-3: Tin nhắn khác cũng cập nhật liên lạc cuối** | Khung tin nhắn khác (`StatusNotification`, `Authorize`) cũng kích hoạt cập nhật `last_seen_at`. | TC-S09-B05 | `t_before`: `09:56:18.012+00`<br>`t_after_status`: `09:56:19.245+00`<br>Khẳng định `t_after > t_before`. | **PASS** |
| **AC-4: Chặn Heartbeat khi chưa Boot** | Trụ chưa `BootNotification` gửi `Heartbeat` bị từ chối với `SecurityError`. | TC-S09-B01 | `[4, "hb-pre-01", "SecurityError", "Charge point is not accepted yet", {}]`<br>Socket giữ `readyState = 1`. | **PASS** |
| **AC-5: T-19 Đồng hồ trụ lệch không làm sai lệch** | Trụ ảo chạy sai giờ hoặc khác múi giờ, `currentTime` và `last_seen_at` vẫn lấy hoàn toàn từ server CSMS. | TC-S09-C01 | Server Time: `2026-10-03T09:56:19.501Z`<br>DB Now: `2026-10-03T09:56:19.640Z`<br>Độ lệch: **0.139s**, độc lập 100% với giờ client. | **PASS** |
| **AC-6: Trạm bị khoá (Admin Lock)** | Khi trạm bị Admin khoá (`locked_at`), ngắt kết nối WebSocket cũ, từ chối Boot, chặn Heartbeat và không đổi `last_seen_at`. | TC-S09-C02 | Close frame: `code = 1008`, `reason = "Station locked"`<br>Boot: `{"status": "Rejected"}`<br>Heartbeat: `SecurityError`<br>DB: `initialLastSeen === afterLockLastSeen`. | **PASS** |

---

## 4. Đặc Tả Chi Tiết Từng Ca Kiểm Thử (Test Specifications & Verification)

### Giai đoạn A: Nền Tảng & Điều Kiện Tiên Quyết (Smoke & Schema)

| Mã ID | Phân loại | Khung gửi / Thao tác (Input) | Kết quả kỳ vọng (Expected) | Kết quả thực tế (Actual) | Bằng chứng thô (Raw Verification) | Đánh giá |
|---|:---:|---|---|---|---|:---:|
| **TC-S09-A01** | Live API | `GET /api/health` | HTTP 200, `database = postgresql` | HTTP 200, `{"ok":true,"database":"postgresql"}` | Curl response body: `{"ok":true,"database":"postgresql"}` | **PASS** |
| **TC-S09-A02** | Live DB | Query cột `last_seen_at` trong `charge_points` | Cột tồn tại (count = 1) | `count = 1` | SQL: `SELECT count(*) FROM information_schema.columns WHERE table_name='charge_points' AND column_name='last_seen_at'` | **PASS** |
| **TC-S09-A03** | Live WS | Bắt tay WebSocket `/ocpp/DEMO-ST01-CP1` | HTTP 101 Switching Protocols | Socket OPEN (`readyState = 1`) | Protocol thỏa thuận: `ocpp1.6` | **PASS** |
| **TC-S09-A04** | Live WS | Bắt tay WebSocket `/ocpp/MA-TRU-KHONG-TON-TAI` | Bị từ chối HTTP 403 Forbidden | HTTP 403 Forbidden | Log cảnh báo: `[SECURITY_WARN] Unauthorized WebSocket attempt` | **PASS** |

---

### Giai đoạn B: Nhiệm Vụ T-18 & Acceptance Criteria

| Mã ID | Phân loại | Khung gửi (Input) | Kết quả kỳ vọng (Expected) | Kết quả thực tế (Actual) | Bằng chứng thô (Raw Verification) | Đánh giá |
|---|:---:|---|---|---|---|:---:|
| **TC-S09-B01** | Live WS | `[2, "hb-pre-01", "Heartbeat", {}]` (trước Boot) | `CALLERROR SecurityError` | `[4, "hb-pre-01", "SecurityError", "Charge point is not accepted yet", {}]` | WebSocket response frame khớp 100% schema lỗi | **PASS** |
| **TC-S09-B02** | Live WS | `[2, "hb-valid-01", "Heartbeat", {}]` (sau Boot) | `CALLRESULT` có `currentTime` chuẩn ISO UTC | `[3, "hb-valid-01", {"currentTime": "2026-10-03T09:56:16.892Z"}]` | Chuỗi kết thúc bằng chữ `Z`, múi giờ chuẩn quốc tế | **PASS** |
| **TC-S09-B03** | Live DB | Kiểm tra `last_seen_at` của trụ `DEMO-ST01-CP2` | Trùng giờ DB trong vòng 2 giây | Khớp giờ DB, lệch **0.302 giây** | SQL: `SELECT last_seen_at FROM charge_points WHERE code='DEMO-ST01-CP2'` | **PASS** |
| **TC-S09-B04** | Live DB | Đợi 1.1s, gửi tiếp `[2, "hb-valid-02", "Heartbeat", {}]` | `last_seen_at` cập nhật tịnh tiến | `t1 = 09:56:16.887`  `t2 = 09:56:18.012` | Xác nhận `t2 > t1` (tính tịnh tiến chuẩn xác) | **PASS** |
| **TC-S09-B05** | Live DB | Gửi `StatusNotification` đầu nối 1 | `last_seen_at` tiếp tục được cập nhật mới | `t3 = 09:56:19.245` > `t2` | Cột `last_seen_at` cập nhật mà không cần gửi Heartbeat | **PASS** |

---

### Giai đoạn C: T-19 Lệch Giờ, Khoá Trạm & Tải Biên (Edge & NFR)

| Mã ID | Phân loại | Tình huống kiểm thử (Scenario) | Kết quả kỳ vọng (Expected) | Kết quả thực tế (Actual) | Bằng chứng thô (Raw Verification) | Đánh giá |
|---|:---:|---|---|---|---|:---:|
| **TC-S09-C01** | Live Sim | Trụ client giả lập đồng hồ lệch | Server trả giờ chuẩn, DB lưu theo giờ PostgreSQL | Server Time: `09:56:19.501Z`<br>DB Time: `09:56:19.640Z` | Độ lệch chỉ **0.139s**, client không thể làm sai lệch dữ liệu | **PASS** |
| **TC-S09-C02** | Live API/DB | Admin khoá trạm (`PATCH /api/admin/stations/3/lock`) | Đóng WS (1008), từ chối Boot, chặn Heartbeat, DB giữ nguyên | Close 1008 "Station locked", Boot Rejected, Heartbeat SecurityError, DB không đổi | Câu lệnh SQL có điều kiện `AND s.locked_at IS NULL` bảo vệ DB | **PASS** |
| **TC-S09-C03** | Live WS | Gửi 2 tin Heartbeat trùng lặp cùng `messageId` | Không lỗi, phản hồi CALLRESULT | Cả 2 lần đều nhận CALLRESULT thành công | Đảm bảo tính Idempotency và ổn định kết nối | **PASS** |
| **TC-S09-C04** | Live Stress | 6 kết nối trụ sạc gửi Heartbeat đồng thời | Phản hồi toàn bộ trong < 2000ms | 6/6 trụ nhận phản hồi trong **12 mili-giây** | Thời gian phản hồi cực nhanh, không nghẽn CSDL | **PASS** |

---

### Giai đoạn D: Bộ Test Hồi Quy Tự Động (CI Regression)

| Mã ID | Bộ kiểm thử | Lệnh thực thi từ thư mục gốc | Kết quả đầu ra | Đánh giá |
|---|---|---|---|:---:|
| **TC-S09-D01** | Unit test suite | `python test.py --only unit` | `64 test pass, 0 fail (thời gian: 10 giây)` | **PASS** |
| **TC-S09-D02** | Integration test suite | `python test.py --only integration` | `67 test pass, 0 fail (thời gian: 32 giây)` | **PASS** |

---

## 5. Nhật Ký Thực Thi Kiểm Thử Thực Tế (Raw Execution Log)

Bằng chứng thực thi từ công cụ kiểm tra tự động chuẩn của repo:

```
$ node tools/verify-s09-live.js
======================================================================
  KIỂM THỬ XÁC MINH S-09: NHỊP TIM VÀ THỜI ĐIỂM LIÊN LẠC CUỐI (T-18, T-19)
======================================================================

[PASS] TC-S09-A01: Healthcheck GET /api/health trả HTTP 200 và kết nối DB ổn định
[PASS] TC-S09-A02: Cột last_seen_at tồn tại trong bảng charge_points (Migration 009)
[PASS] TC-S09-A03: Kết nối WebSocket thành công với mã trụ hợp lệ DEMO-ST01-CP1 (HTTP 101)
[PASS] TC-S09-A04: Từ chối mã trụ lạ với HTTP 403 Forbidden
[PASS] TC-S09-B01: Chặn Heartbeat trước khi BootNotification (SecurityError: Charge point is not accepted yet)
[PASS] TC-S09-B02: Heartbeat trả về CALLRESULT chứa currentTime chuẩn ISO 8601 UTC kết thúc bằng Z
[PASS] TC-S09-B03: CSDL cập nhật last_seen_at khớp với CURRENT_TIMESTAMP trong vòng 2 giây
[PASS] TC-S09-B04: Lần gửi Heartbeat tiếp theo cập nhật last_seen_at tăng tịnh tiến (t2 > t1)
[PASS] TC-S09-B05: Tin nhắn nghiệp vụ khác (StatusNotification) cũng kích hoạt cập nhật last_seen_at
[PASS] TC-S09-C01: T-19: Đồng hồ client lệch không làm sai lệch: currentTime và last_seen_at hoàn toàn theo giờ DB máy chủ
[PASS] TC-S09-C02: Trạm bị Admin khoá: đóng kết nối (1008 Station locked), từ chối Boot (Rejected), chặn Heartbeat và không cập nhật last_seen_at
[PASS] TC-S09-C03: Gửi trùng lặp Heartbeat cùng messageId được xử lý an toàn (Idempotency)
[PASS] TC-S09-C04: Tải đồng thời 6 trụ gửi Heartbeat song song thành công trong 12ms (< 2000ms)

======================================================================
TỔNG KẾT: 13 Test Cases | PASS: 13 | FAIL: 0
======================================================================
```

---

## 6. Đánh Giá Rủi Ro & Giới Hạn Kiểm Thử (Risk Assessment & Test Limitations)

1. **Giới hạn phần cứng:**
   - Kiểm thử được thực hiện với các trụ sạc ảo (Virtual Charge Point) và script mô phỏng giao thức OCPP 1.6J. Chưa kiểm thử trực tiếp trên thiết bị phần cứng trụ sạc vật lý ngoài thực địa (Physical EVSE Hardware).
2. **Giới hạn điều kiện mạng:**
   - Kịch bản chạy trên mạng nội bộ Docker / Localhost, chưa mô phỏng độ trễ mạng Internet cao (> 500ms) hoặc hiện tượng rớt gói tin ngẫu nhiên ở tầng TCP (Packet loss).
3. **Khuyến nghị cho Sprint tiếp theo:**
   - Cần bổ sung thêm kiểm thử stress test với 100+ kết nối WebSocket đồng thời trên môi trường Staging có mạng Internet thực tế trước khi release bản chính thức.

---

## 7. Hướng Dẫn Tái Hiện (Repo-Native Reproduction Steps)

Mọi thành viên nhóm phát triển và Reviewer đều có thể tái hiện 100% kết quả trên bất kỳ máy nào bằng các lệnh chuẩn từ thư mục gốc của repository:

```bash
# 1. Khởi động môi trường Docker của dự án
python run.py --no-open

# 2. Chạy script kiểm chứng tự động S-09 (Repo-Native)
node tools/verify-s09-live.js

# 3. Kiểm tra dữ liệu trực tiếp trong PostgreSQL container
docker compose exec -T db psql -U csms -d csms -c "SELECT code, last_seen_at FROM charge_points WHERE code LIKE 'DEMO-ST01%' LIMIT 5;"
```
