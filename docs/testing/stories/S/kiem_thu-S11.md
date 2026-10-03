# Báo Cáo & Đặc Tả Kiểm Thử S-11: Màn Hình Trạng Thái Mọi Trụ Sạc Thời Gian Thực (T-23, T-24, T-25)

> **Dự án:** Nền tảng quản lý trạm sạc xe điện (CSMS)  
> **Story ID:** S-11 (Jira: GYM-37)  
> **Nhánh Git kiểm thử:** `nam/docs-kiem-thu-s09-s10-s11` (dựa trên `feat/s-11-fleet-status`)  
> **Người thực hiện:** QA Specialist / Independent AI Tester  
> **Chuẩn quy trình:** [`docs/testing/TESTER_STANDARD.md`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/docs/testing/TESTER_STANDARD.md)  
> **Đường dẫn báo cáo:** `docs/testing/stories/S/kiem_thu-S11.md`  
> **Script kiểm chứng tự động (Repo-Native):** [`tools/verify-s11-live.js`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/tools/verify-s11-live.js)

---

## 1. Thông Tin Lần Chạy & Môi Trường Kiểm Thử (Execution Metadata)

- **Ngày chạy kiểm thử:** 2026-10-03 (Thời gian: 16:56 UTC+7)
- **Commit SHA:** `ec49cea` (nhánh `nam/docs-kiem-thu-s09-s10-s11`)
- **Môi trường thực thi:**
  - Hệ điều hành: Windows 11 (WSL2 / Docker Desktop 4.92.0)
  - Runtime Node.js: v22.23.3 (Container `csms_app:latest`) / Host v24.19.0
  - Cơ sở dữ liệu: PostgreSQL 16 Alpine (`charging-station-management-system-csms--db-1`)
  - Giao thức: HTTP REST + Server-Sent Events (SSE) + WebSocket OCPP 1.6J
- **Phân loại kiểm thử:** Kiểm thử tích hợp tự động (Integration Test) + Kiểm thử đơn vị frontend + Kiểm thử độ trễ trực tiếp trên luồng SSE (Live Realtime Latency Test).
- **Mã nguồn liên quan:**
  - `backend/src/modules/fleet-status/fleet-status.routes.js`: Định nghĩa route snapshot và SSE stream.
  - `backend/src/modules/fleet-status/fleet-status.repository.js`: Truy vấn cây 3 tầng phân quyền bằng `scopeByOwner` và tính cờ `offline`.
  - `backend/src/modules/fleet-status/fleet-status.service.js`: Chuyển đổi dữ liệu phẳng thành cây JSON lồng nhau.
  - `backend/src/modules/fleet-status/fleet-status.events.js`: Bộ phát sự kiện EventEmitter trong bộ nhớ.
  - `backend/src/modules/ocpp/handlers/status-notification.js`: Tích hợp phát sự kiện `publish()` khi trạng thái đầu nối thực sự thay đổi.
  - `frontend/services/realtime.js`: Client SSE phía trình duyệt với cơ chế auto-reconnect và fallback polling.
  - `frontend/pages/shared/fleet-status.js`: Giao diện danh sách theo dõi trạng thái trạm/trụ/đầu nối.

---

## 2. Bảng Tổng Kết Kết Quả Kiểm Thử (Summary)

| Phân nhóm kiểm thử | Loại kiểm thử | Tổng số ca | PASS | FAIL | BLOCKED | Tỷ lệ Đạt |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Giai đoạn A – Nền tảng & Xác thực (Smoke & Auth)** | Live API | 1 | 1 | 0 | 0 | 100% |
| **Giai đoạn B – Nhiệm vụ T-23 Truy Vấn Cây & RBAC** | Live API/DB | 5 | 5 | 0 | 0 | 100% |
| **Giai đoạn C – Nhiệm vụ T-25 Kênh Đẩy SSE Thời Gian Thực** | Live SSE/WS | 3 | 3 | 0 | 0 | 100% |
| **Giai đoạn D – Bộ Test Hồi Quy Tự Động (CI Suite)** | CI Automated | 3 | 3 | 0 | 0 | 100% |
| **TỔNG CỘNG** | | **12** | **12** | **0** | **0** | **100%** |

---

## 3. Ma Trận Truy Vết Tiêu Chí Chấp Nhận & Bằng Chứng Thực Tế (AC Traceability)

| Tiêu chí chấp nhận (AC) | Mô tả yêu cầu | Ca test chứng minh | Bằng chứng thực tế xác thực (Raw Evidence) | Đánh giá |
|---|---|:---:|---|:---:|
| **AC-1: Truy vấn cây 3 tầng bằng 1 câu SQL duy nhất** | `GET /api/fleet-status` nạp Trạm $\rightarrow$ Trụ $\rightarrow$ Đầu nối bằng 1 câu `LEFT JOIN`, phản hồi `< 200ms`. | TC-S11-B01 | Cấu trúc JSON 3 tầng đầy đủ.<br>Thời gian phản hồi thực tế: **12.5 mili-giây** (nhanh gấp 16 lần ngưỡng yêu cầu). | **PASS** |
| **AC-2: Phân quyền RBAC và cách ly đa chủ trạm** | `ADMIN`/`OPERATOR` thấy toàn bộ; `STATION_OWNER` chỉ thấy trạm của mình; `DRIVER` bị cấm. | TC-S11-B02<br>TC-S11-B03<br>TC-S11-B04 | • Admin & Operator: thấy đủ 8 trạm.<br>• Owner 1: thấy 4 trạm [1, 2, 3, 4].<br>• Owner 2: thấy 2 trạm [5, 6].<br>• `hasOverlap = false` (không trùng lặp).<br>• Driver: nhận HTTP **403 Forbidden**. | **PASS** |
| **AC-3: Tự động tính cờ ngoại tuyến `offline`** | Suy diễn động tại thời điểm truy vấn: quá $2 \times interval$ $\rightarrow$ `offline: true`. | TC-S11-B05 | • Trụ CP1 vừa gửi Heartbeat $\rightarrow$ `offline = false`.<br>• Trụ CP2 last seen 3 phút trước $\rightarrow$ `offline = true`. | **PASS** |
| **AC-4: Header chuẩn kênh đẩy SSE** | Header bắt buộc của SSE và chống proxy timeout. | TC-S11-C01 | Response Headers:<br>`Content-Type: text/event-stream; charset=utf-8`<br>`Cache-Control: no-cache`<br>`X-Accel-Buffering: no`. | **PASS** |
| **AC-5: Độ trễ cập nhật thời gian thực $\le 1$ giây** | Trụ đổi trạng thái qua WebSocket $\rightarrow$ client SSE nhận sự kiện trong $\le 1000$ms. | TC-S11-C02 | Độ trễ đo từ khi gửi `StatusNotification` đến khi client SSE nhận được: **32.2 mili-giây** ($\le 1000$ms). | **PASS** |
| **AC-6: Phân quyền trên kênh đẩy SSE** | Chủ trạm A không nhận sự kiện của Chủ trạm B trên kênh stream. | TC-S11-C03 | Trạm 1 đổi trạng thái $\rightarrow$ Owner 1 nhận được 1 sự kiện; Owner 2 nhận **0 sự kiện**. Bảo mật cách ly tuyệt đối. | **PASS** |
| **AC-7: Frontend tự phục hồi & Fallback** | Tự refresh khi mở lại tab, tự nạp snapshot khi reconnect, fallback polling khi lỗi. | TC-S11-D01 | Bộ test `realtime.test.js` pass 100%, giả lập EventSource error 3 lần $\rightarrow$ tự chuyển fallback polling. | **PASS** |

---

## 4. Đặc Tả Chi Tiết Từng Ca Kiểm Thử (Test Specifications & Verification)

### Giai đoạn A: Nền Tảng & Xác Thực Vai Trò (Smoke & Auth)

| Mã ID | Phân loại | Khung gửi / Thao tác (Input) | Kết quả kỳ vọng (Expected) | Kết quả thực tế (Actual) | Bằng chứng thô (Raw Verification) | Đánh giá |
|---|:---:|---|---|---|---|:---:|
| **TC-S11-A01** | Live API | Đăng nhập 5 tài khoản demo: `admin@`, `operator@`, `owner@`, `owner2@`, `driver@` | Nhận HTTP 200 và Cookie `token` | Cả 5 vai trò đăng nhập thành công | Cookie JWT hợp lệ được cấp | **PASS** |

---

### Giai đoạn B: Nhiệm Vụ T-23 Truy Vấn Cây & Phân Quyền (Snapshot & RBAC)

| Mã ID | Phân loại | Lệnh gọi / Tài khoản (Input) | Kết quả kỳ vọng (Expected) | Kết quả thực tế (Actual) | Bằng chứng thô (Raw Verification) | Đánh giá |
|---|:---:|---|---|---|---|:---:|
| **TC-S11-B01** | Live API | `GET /api/fleet-status` (Tài khoản `ADMIN`) | Trả về cây 3 tầng trong < 200ms | Đủ 3 tầng `stations -> charge_points -> connectors`. Thời gian: **12.5ms**. | Body chứa 8 trạm, mỗi trạm có trụ và đầu nối | **PASS** |
| **TC-S11-B02** | Live API | `GET /api/fleet-status` (Tài khoản `OPERATOR`) | Thấy đủ toàn bộ trạm như ADMIN | Thấy đúng 8 trạm | `operatorStations === adminStations === 8` | **PASS** |
| **TC-S11-B03** | Live API | So sánh snapshot giữa `OWNER 1` và `OWNER 2` | Mỗi chủ chỉ thấy trạm của mình | Owner 1: trạm [1,2,3,4]<br>Owner 2: trạm [5,6] | `hasOverlap = false` | **PASS** |
| **TC-S11-B04** | Live API | `GET /api/fleet-status` (Tài khoản `DRIVER`) | Bị từ chối HTTP 403 Forbidden | HTTP 403 Forbidden | Middleware `routeGuard` chặn truy cập | **PASS** |
| **TC-S11-B05** | Live API/DB | Kiểm tra cờ `offline` của 2 trụ | CP1 (mới): online; CP2 (3 phút trước): offline | CP1: `offline = false`<br>CP2: `offline = true` | CSDL tính toán động tại thời điểm truy vấn | **PASS** |

---

### Giai đoạn C: Nhiệm Vụ T-25 Kênh Đẩy Sự Kiện Thời Gian Thực (SSE & Latency)

| Mã ID | Phân loại | Tình huống kiểm thử (Scenario) | Kết quả kỳ vọng (Expected) | Kết quả thực tế (Actual) | Bằng chứng thô (Raw Verification) | Đánh giá |
|---|:---:|---|---|---|---|:---:|
| **TC-S11-C01** | Live SSE | Mở kết nối `GET /api/fleet-status/events` | Nhận HTTP 200, Content-Type `text/event-stream` | Header chuẩn SSE, `X-Accel-Buffering: no` | Proxy không đệm gói tin | **PASS** |
| **TC-S11-C02** | Live SSE/WS | Trụ gửi `StatusNotification` đổi trạng thái sang `Preparing` | Đẩy qua SSE tới client trong $\le 1000$ms | Sự kiện nhận được sau **32.2 mili-giây** | Event data: `{"station_id":"1","charge_point_id":"1","connector_id":"1"}` | **PASS** |
| **TC-S11-C03** | Live SSE/WS | Trạm 1 đổi trạng thái, kiểm tra client Owner 1 vs Owner 2 | Owner 1 nhận được; Owner 2 không nhận | Owner 1: 1 sự kiện<br>Owner 2: **0 sự kiện** | Cách ly dữ liệu hoàn hảo trên luồng SSE | **PASS** |

---

### Giai đoạn D: Bộ Test Hồi Quy Tự Động (CI Regression)

| Mã ID | Bộ kiểm thử | Lệnh thực thi từ thư mục gốc | Kết quả đầu ra | Đánh giá |
|---|---|---|---|:---:|
| **TC-S11-D01** | Unit test client realtime | `node --test backend/tests/unit/realtime.test.js` | `1 test pass, 0 fail (thời gian: 55ms)` | **PASS** |
| **TC-S11-D02** | Toàn bộ Unit test của hệ thống | `python test.py --only unit` | `64 test pass, 0 fail (thời gian: 10 giây)` | **PASS** |
| **TC-S11-D03** | Toàn bộ Integration test của hệ thống | `python test.py --only integration` | `67 test pass, 0 fail (thời gian: 32 giây)` | **PASS** |

---

## 5. Nhật Ký Thực Thi Kiểm Thử Thực Tế (Raw Execution Log)

Bằng chứng thực thi từ công cụ kiểm tra tự động chuẩn của repo:

```
$ node tools/verify-s11-live.js
======================================================================
  KIỂM THỬ XÁC MINH S-11: MÀN HÌNH TRẠNG THÁI MỌI TRỤ & SSE (T-23, T-24, T-25)
======================================================================

[PASS] TC-S11-A01: Đăng nhập thành công 5 vai trò (ADMIN, OPERATOR, OWNER 1, OWNER 2, DRIVER)
[PASS] TC-S11-B01: ADMIN truy vấn cây 3 tầng (Trạm-Trụ-Đầu nối) thành công trong 12.5ms (< 200ms)
[PASS] TC-S11-B02: OPERATOR thấy toàn bộ trạm trong hệ thống tương tự ADMIN
[PASS] TC-S11-B03: Phân lập dữ liệu đa chủ trạm: OWNER 1 và OWNER 2 chỉ thấy trạm của riêng mình, không chồng lấn
[PASS] TC-S11-B04: DRIVER không có quyền stations:read bị từ chối với HTTP 403 Forbidden
[PASS] TC-S11-B05: Suy diễn trạng thái ngoại tuyến: last_seen_at <= 2*interval -> offline = true
[PASS] TC-S11-C01: Kênh SSE GET /api/fleet-status/events mở thành công với các header chuẩn (text/event-stream, no-cache, X-Accel-Buffering: no)
[PASS] TC-S11-C02: Sự kiện StatusNotification đẩy qua SSE tức thời trong 32.2ms (<= 1000ms)
[PASS] TC-S11-C03: Phân quyền kênh đẩy SSE: Chủ trạm 1 nhận sự kiện trạm mình, Chủ trạm 2 tuyệt đối không bị lộ sự kiện

======================================================================
TỔNG KẾT: 9 Test Cases | PASS: 9 | FAIL: 0
======================================================================
```

---

## 6. Đánh Giá Rủi Ro & Giới Hạn Kiểm Thử (Risk Assessment & Test Limitations)

1. **Phạm vi một tiến trình (Single Instance):**
   - Bộ phát sự kiện `fleet-status.events.js` sử dụng `Set` các subscriber trong bộ nhớ của tiến trình Node.js. Thiết kế này đúng với phạm vi Sprint 2 (chạy một instance). Nếu tương lai mở rộng quy mô ngang (Horizontal Scaling / Multi-replica), cần nâng cấp sang Redis Pub/Sub hoặc PostgreSQL LISTEN/NOTIFY.
2. **Số lượng kết nối SSE đồng thời:**
   - Trình duyệt chuẩn HTTP/1.1 có giới hạn 6 kết nối đồng thời trên mỗi domain. Khi người dùng mở nhiều tab, có thể chạm giới hạn này nếu không cấu hình HTTP/2 trên reverse proxy production.

---

## 7. Hướng Dẫn Tái Hiện (Repo-Native Reproduction Steps)

Mọi Reviewer đều có thể tái hiện 100% kết quả trên bằng các lệnh chuẩn từ thư mục gốc của repository:

```bash
# 1. Khởi động môi trường Docker của dự án
python run.py --no-open

# 2. Chạy bộ kiểm thử đơn vị client realtime
node --test backend/tests/unit/realtime.test.js

# 3. Chạy script kiểm chứng tự động S-11 (Repo-Native)
node tools/verify-s11-live.js

# 4. Kiểm tra kênh stream SSE trực tiếp qua cURL
curl.exe -N -s -H "Cookie: <OWNER_COOKIE>" http://127.0.0.1:3000/api/fleet-status/events
```
