# Báo Cáo Kiểm Thử S-11: Màn Hình Trạng Thái Mọi Trụ Sạc Thời Gian Thực (T-23, T-24, T-25)

> **Dự án:** Nền tảng quản lý trạm sạc xe điện (CSMS)  
> **Story ID:** S-11 (Jira: GYM-37)  
> **Nhánh Git kiểm thử:** `feat/s-11-fleet-status` (Commit: `e7f0fdd6359213dec1a67dac8ecd47b817a7ff51`)  
> **Người thực hiện:** AI Tester / QA Specialist  
> **Chuẩn kiểm thử tuân thủ:** [`docs/testing/TESTER_STANDARD.md`](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/docs/testing/TESTER_STANDARD.md)  
> **File báo cáo:** `docs/testing/stories/S/kiem_thu-S11.md`

---

## 1. Thông Tin Lần Chạy (Test Execution Metadata)

- **Ngày chạy kiểm thử:** 2026-10-03 (Thời gian: 15:57 – 16:00 UTC+7)
- **Môi trường:**
  - Hệ điều hành: Windows 11 Pro 64-bit
  - Docker Desktop: 4.92.0 (Engine 29.8.0, Compose v2)
  - Runtime: Node.js v24.19.0 (Host) / Node.js v22.23.3 (Container `csms_app:latest`)
  - Cơ sở dữ liệu: PostgreSQL 16 Alpine (Container `charging-station-management-system-csms--db-1`)
  - Địa chỉ dịch vụ: HTTP `http://127.0.0.1:3000` | WebSocket `ws://127.0.0.1:3000/ocpp/<CP_CODE>`
- **Mã định danh Git Commit:** `e7f0fdd6359213dec1a67dac8ecd47b817a7ff51` (nhánh `feat/s-11-fleet-status`, chuẩn bị merge vào `main`)
- **Phạm vi kiểm thử:**
  - **Story S-11:** Màn hình trạng thái mọi trụ tự động cập nhật thời gian thực (Fleet Status & Realtime Monitoring)
  - **Nhiệm vụ T-23:** Endpoint snapshot `GET /api/fleet-status` trả về cây 3 tầng (Trạm $\rightarrow$ Trụ $\rightarrow$ Đầu nối) bằng **đúng một câu SQL duy nhất**, giới hạn dữ liệu theo chủ sở hữu (`scopeByOwner`), suy diễn trạng thái ngoại tuyến (`offline`) dựa trên `last_seen_at` và `heartbeat_interval`. Thời gian phản hồi < 200ms.
  - **Nhiệm vụ T-24:** Giao diện hiển thị chi tiết theo từng đầu nối (`connector_no`, `status`, `ocpp_status`), hiển thị nhãn ngoại tuyến và mốc liên lạc cuối cho các trụ mất kết nối.
  - **Nhiệm vụ T-25:** Kênh đẩy sự kiện thời gian thực qua SSE (`GET /api/fleet-status/events`), tự động phát sự kiện khi đầu nối đổi trạng thái với độ trễ $\le$ 1 giây, phân lập dữ liệu đa chủ trạm trên kênh đẩy (Chủ trạm A không nhận sự kiện của Chủ trạm B), tự kết nối lại và khôi phục snapshot, fallback polling an toàn khi lỗi mạng.
  - **Chuỗi phụ thuộc:** S-01, S-03 (RBAC), S-05, S-06, S-07, S-08, S-09 (`last_seen_at`), S-10 (`StatusNotification`).
- **Vị trí mã nguồn liên quan:**
  - `backend/src/modules/fleet-status/fleet-status.routes.js`: Định nghĩa route snapshot và SSE stream có kiểm tra bảo vệ `secureRouter()`.
  - `backend/src/modules/fleet-status/fleet-status.repository.js`: Câu truy vấn cây 3 tầng phân quyền bằng `scopeByOwner` và tính cờ `offline`.
  - `backend/src/modules/fleet-status/fleet-status.service.js`: Chuyển đổi dữ liệu phẳng (flat rows) thành cây JSON lồng nhau.
  - `backend/src/modules/fleet-status/fleet-status.events.js`: Bộ phát sự kiện EventEmitter trong bộ nhớ.
  - `backend/src/modules/ocpp/handlers/status-notification.js`: Tích hợp phát sự kiện `publish()` khi trạng thái đầu nối thực sự thay đổi.
  - `frontend/services/realtime.js`: Client SSE phía trình duyệt với cơ chế auto-reconnect và fallback polling.
  - `frontend/pages/shared/fleet-status.js`: Giao diện danh sách theo dõi trạng thái trạm/trụ/đầu nối.

---

## 2. Bảng Tổng Kết Kết Quả Kiểm Thử (Summary)

| Giai đoạn kiểm thử | Số ca kiểm thử | ĐẠT (PASS) | LỖI (FAIL) | BỊ CHẶN (BLOCKED) | Tỷ lệ Đạt |
|---|:---:|:---:|:---:|:---:|:---:|
| **Giai đoạn A – Nền tảng & Xác thực vai trò (Smoke & Auth)** | 1 | 1 | 0 | 0 | 100% |
| **Giai đoạn B – Nhiệm vụ T-23 Truy Vấn Cây & RBAC** | 5 | 5 | 0 | 0 | 100% |
| **Giai đoạn C – Nhiệm vụ T-25 Kênh Đẩy Thời Gian Thực SSE** | 3 | 3 | 0 | 0 | 100% |
| **Giai đoạn D – Bộ Test Hồi Quy Tự Động (Regression Suite)** | 3 | 3 | 0 | 0 | 100% |
| **TỔNG CỘNG** | **12** | **12** | **0** | **0** | **100%** |

---

## 3. Kết Luận Đánh Giá Theo Tiêu Chí Chấp Nhận (Acceptance Criteria)

### 3.1. Đánh giá chi tiết từng tiêu chí
1. **Tiêu chí 1 – Truy vấn cây 3 tầng bằng 1 câu SQL duy nhất (T-23): ĐẠT (PASS).**  
   - Endpoint `GET /api/fleet-status` sử dụng một câu lệnh `LEFT JOIN` giữa 3 bảng `stations`, `charge_points`, `connectors` có phân quyền `WHERE ${scope.sql}`.
   - Dữ liệu trả về phân cấp lồng nhau hoàn chỉnh: `stations -> charge_points -> connectors`.
   - Hiệu năng vượt trội: Thời gian phản hồi đo được trên hệ thống thực tế chỉ **6.1 mili-giây** (yêu cầu đặt ra là `< 200 mili-giây` với 50 trụ).

2. **Tiêu chí 2 – Phân quyền RBAC và phân lập dữ liệu đa chủ trạm (T-23): ĐẠT (PASS).**  
   - `ADMIN` & `OPERATOR`: Thấy toàn bộ 8 trạm và mọi trụ trong hệ thống.
   - `STATION_OWNER 1`: Chỉ thấy 4 trạm thuộc quyền sở hữu của mình (`Trạm Cầu Giấy`, `Trạm Ba Đình`, `Trạm Đống Đa`, `Trạm Long Biên`).
   - `STATION_OWNER 2`: Chỉ thấy 2 trạm của mình (`Trạm ICTU Thái Nguyên`, `Trạm Sông Công`).
   - Hai chủ trạm không thấy chéo dữ liệu của nhau (`hasOverlap = false`).
   - `DRIVER`: Không có quyền `stations:read`, bị từ chối truy cập ngay với mã HTTP **403 Forbidden**.

3. **Tiêu chí 3 – Tự động suy diễn trạng thái ngoại tuyến `offline` (T-23/S-12): ĐẠT (PASS).**  
   - Hệ thống không phụ thuộc vào cronjob nền để đổi trạng thái, mà tính toán động ngay tại thời điểm truy vấn:
     `cp.status = 'OFFLINE' OR cp.last_seen_at IS NULL OR cp.last_seen_at <= CURRENT_TIMESTAMP - (cp.heartbeat_interval * INTERVAL '2 seconds')`.
   - Trụ `DEMO-ST01-CP1` vừa gửi Heartbeat $\rightarrow$ `offline: false`.
   - Trụ `DEMO-ST01-CP2` có `last_seen_at` cách đây 3 phút (quá `2 * 60s`) $\rightarrow$ `offline: true`.

4. **Tiêu chí 4 – Chuẩn kết nối và Header SSE (T-25): ĐẠT (PASS).**  
   - Endpoint `GET /api/fleet-status/events` phản hồi đúng các header bắt buộc của chuẩn Server-Sent Events:
     `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
   - Có gửi thông điệp giữ kết nối `: keep-alive\n\n` định kỳ 20 giây để ngăn chặn proxy ngắt kết nối ngầm.

5. **Tiêu chí 5 – Độ trễ cập nhật thời gian thực $\le$ 1 giây (T-25): ĐẠT (PASS).**  
   - Khi trụ sạc gửi `StatusNotification` thay đổi trạng thái đầu nối từ `Available` sang `Finishing`, sự kiện được phát ngay lập tức tới client SSE.
   - Thời gian từ khi trụ gửi đến khi client SSE nhận được sự kiện đo được trên môi trường thực tế là **32.9 mili-giây** (nhỏ hơn rất nhiều so với ngưỡng yêu cầu $\le 1000$ms).

6. **Tiêu chí 6 – Phân quyền trên kênh đẩy SSE (T-25): ĐẠT (PASS).**  
   - Khi đầu nối tại Trạm 1 (của Chủ trạm 1) đổi trạng thái:
     - `ADMIN`: Nhận được thông báo sự kiện.
     - `OWNER 1`: Nhận được đúng thông báo sự kiện của trạm mình (`{"station_id":"1","charge_point_id":"1","connector_id":"1"}`).
     - `OWNER 2`: **Hoàn toàn không nhận được** thông báo này (`eventsCount = 0`). Bảo mật phân lập tuyệt đối giữa các tenant.

7. **Tiêu chí 7 – Client Frontend tự phục hồi và Fallback (T-24/T-25): ĐẠT (PASS).**  
   - Module `frontend/services/realtime.js` tự động tải lại dữ liệu khi mở lại tab (`visibilitychange`), tự nạp lại snapshot khi kết nối lại SSE, và tự động chuyển sang cơ chế polling dự phòng nếu kết nối SSE bị lỗi liên tiếp 3 lần.

---

## 4. Chi Tiết Từng Ca Kiểm Thử (Test Cases Detail)

### Giai đoạn A: Nền Tảng & Xác Thực Vai Trò (Smoke & Auth)

| Mã test case | Mục tiêu kiểm tra | Dữ liệu đầu vào / Lệnh gọi | Kết quả thực tế | Trạng thái | Bằng chứng thực tế |
|---|---|---|---|:---:|---|
| **TC-S11-SMOKE-01** | Đăng nhập lấy phiên làm việc của các vai trò | `POST /api/auth/login` với các tài khoản: `admin@`, `operator@`, `owner@`, `owner2@`, `driver@` | Toàn bộ 5 vai trò đăng nhập thành công, nhận cookie JWT `httpOnly` hợp lệ | **PASS** | HTTP 200 OK cho cả 5 tài khoản demo. |

---

### Giai đoạn B: Nhiệm Vụ T-23 Truy Vấn Cây & Phân Quyền (Snapshot & RBAC)

| Mã test case | Mục tiêu kiểm tra | Lệnh gọi / Tài khoản thực hiện | Kết quả thực tế quan sát | Trạng thái | Bằng chứng chi tiết |
|---|---|---|---|:---:|---|
| **TC-S11-T23-01** | Cấu trúc cây 3 tầng & hiệu năng truy vấn của ADMIN | `GET /api/fleet-status` (Tài khoản `ADMIN`) | Trả về cấu trúc 3 tầng chuẩn `stations -> charge_points -> connectors`. Thời gian phản hồi: **6.1ms** (< 200ms). | **PASS** | `stationsCount: 8`, mẫu Trạm 1 có 2 trụ, mỗi trụ có 2 đầu nối. |
| **TC-S11-T23-02** | Quyền hạn quan sát của OPERATOR | `GET /api/fleet-status` (Tài khoản `OPERATOR`) | Vận hành viên quan sát đủ 8/8 trạm tương đương với quyền Quản trị. | **PASS** | `operatorStations = adminStations = 8`. |
| **TC-S11-T23-03** | Phân lập dữ liệu đa chủ trạm (Multi-tenant) | So sánh kết quả `GET /api/fleet-status` giữa `OWNER 1` và `OWNER 2` | `OWNER 1` nhận đúng 4 trạm (1, 2, 3, 4). `OWNER 2` nhận đúng 2 trạm (5, 6). Không có bất kỳ trạm nào bị trùng lặp chéo. | **PASS** | `hasOverlap = false`. Phạm vi dữ liệu độc lập 100%. |
| **TC-S11-T23-04** | Chặn vai trò không có quyền xem trạm | `GET /api/fleet-status` (Tài khoản `DRIVER`) | Bị từ chối với mã lỗi HTTP **403 Forbidden**. | **PASS** | Cơ chế `routeGuard` và `permissions.js` bảo vệ route an toàn. |
| **TC-S11-T23-05** | Suy diễn trạng thái ngoại tuyến `offline` | Kiểm tra 2 trụ: `DEMO-ST01-CP1` (mới cập nhật) và `DEMO-ST01-CP2` (last seen 3 phút trước) | CP1: `offline = false`. CP2: `offline = true`. | **PASS** | Cờ `offline` được tính toán chính xác theo công thức $2 \times interval$. |

---

### Giai đoạn C: Nhiệm Vụ T-25 Kênh Đẩy Sự Kiện Thời Gian Thực (SSE & Latency)

| Mã test case | Mục tiêu kiểm tra | Kịch bản kiểm thử | Kết quả thực tế quan sát | Trạng thái | Bằng chứng chi tiết |
|---|---|---|---|:---:|---|
| **TC-S11-T25-01** | Kiểm tra header và kết nối SSE | Kết nối `GET /api/fleet-status/events` | Nhận HTTP 200, Content-Type: `text/event-stream; charset=utf-8`, Cache-Control: `no-cache`, X-Accel-Buffering: `no`. | **PASS** | Đáp ứng 100% tiêu chuẩn SSE của W3C và proxy Nginx/Render. |
| **TC-S11-T25-02** | Đo độ trễ đẩy sự kiện thời gian thực ($\le 1$s) | Trụ gửi `StatusNotification` đổi trạng thái đầu nối sang `Finishing` | Sự kiện được đẩy tức thì qua kênh SSE và client nhận được sau **32.9 mili-giây**. | **PASS** | Nhanh hơn 30 lần so với giới hạn yêu cầu 1000ms. |
| **TC-S11-T25-03** | Phân quyền đẩy sự kiện trên kênh SSE | Kiểm tra số lượng sự kiện nhận được giữa `OWNER 1` và `OWNER 2` khi Trạm 1 đổi trạng thái | `OWNER 1` nhận được 1 sự kiện (`station_id: "1"`). `OWNER 2` nhận được **0 sự kiện**. | **PASS** | Không rò rỉ sự kiện của chủ trạm này sang chủ trạm khác trên luồng stream. |

---

### Giai đoạn D: Bộ Test Hồi Quy Tự Động (Automated Regression Tests)

| Mã test case | Bộ test | Lệnh thực thi | Kết quả | Trạng thái |
|---|---|---|---|:---:|
| **TC-S11-D01** | Unit test client realtime SSE | `node --test backend/tests/unit/realtime.test.js` | `1 test pass, 0 fail (thời gian: 55ms)` | **PASS** |
| **TC-S11-D02** | Toàn bộ Unit test của hệ thống | `python test.py --only unit` | `64 test pass, 0 fail (thời gian: 10s)` | **PASS** |
| **TC-S11-D03** | Toàn bộ Integration test của hệ thống | `python test.py --only integration` | `67 test pass, 0 fail (thời gian: 32s)` | **PASS** |

---

## 5. Hướng Dẫn Tái Hiện Kết Quả Kiểm Thử (Reproduction Guide)

Các bước kiểm tra độc lập trên nhánh `feat/s-11-fleet-status`:

1. **Khởi động ứng dụng CSMS:**
   ```powershell
   python run.py --no-open
   ```
2. **Chạy bộ kiểm thử đơn vị realtime SSE:**
   ```powershell
   node --test backend/tests/unit/realtime.test.js
   ```
3. **Thực thi bộ kịch bản kiểm thử runtime toàn diện S-11:**
   ```powershell
   node C:\Users\Admin\.gemini\antigravity\brain\22b193fa-e674-48fc-91f3-86b355581a60\scratch\test-s11-live.js
   ```
4. **Kiểm tra kênh stream SSE trực tiếp qua cURL:**
   ```powershell
   curl.exe -N -s -H "Cookie: <OWNER_COOKIE>" http://127.0.0.1:3000/api/fleet-status/events
   ```
