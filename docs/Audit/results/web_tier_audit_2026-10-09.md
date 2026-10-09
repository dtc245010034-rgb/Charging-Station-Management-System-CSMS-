# BÁO CÁO KIỂM TOÁN AN NINH: TẦNG WEB & FRONTEND (CSMS)

> Thời điểm thực hiện: **09/10/2026**  
> Môi trường: Docker Compose Live Server (`http://localhost:3000`)  
> Đối tượng: Tầng Web Express 5, Giao diện người dùng thuần JS (Vanilla JS), Leaflet Map, SSE Streams, Security Headers.  
> Thực hiện bởi: AI Security Auditor / Tester độc lập.  

---

## 1. Tóm tắt một trang

| Mục kiểm toán | Kết quả | Chi tiết |
|---|:---:|---|
| **Bảo vệ XSS trong ứng dụng thuần** | **PARTIAL** | Hầu hết các component dùng `dom.js` an toàn (`document.createTextNode`), nhưng phát hiện **Stored XSS** tại `station-map.js` khi dùng Leaflet `bindTooltip` ([VULN-S04-FE01](../../testing/bugs/VULN-S04-FE01.md)). |
| **Bảo vệ CSRF** | **PASS** | `requireJson.js` chặn Origin lạ và bắt buộc Content-Type `application/json`; cookie dùng `SameSite=Lax`. |
| **Bảo vệ Clickjacking** | **FAIL** | Máy chủ thiếu hoàn toàn `X-Frame-Options` và CSP `frame-ancestors` ([WEB-01](../../testing/bugs/WEB-01.md)). |
| **Header bảo mật tầng Web** | **FAIL** | Thiếu `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`; lộ `X-Powered-By: Express` ([WEB-01](../../testing/bugs/WEB-01.md)). |
| **Cách ly dữ liệu SSE (`fleet-status/events`)** | **PASS** | SSE lọc sự kiện chặt chẽ theo `event.ownerId === req.user.id` cho trạm của chủ khác; đóng luồng khi JWT hết hạn. |
| **Phân quyền & Kiểm soát truy cập (RBAC / IDOR)** | **PASS** | Mọi API thử nghiệm chéo tài khoản (Driver, Owner A vs Owner B) đều bị chặn 403 Forbidden. |
| **Lưu trữ Client-Side & Dữ liệu nhạy cảm** | **PASS** | Token xác thực nằm trong cookie `HttpOnly`; `localStorage` chỉ lưu tuỳ chọn theme sáng/tối; không lưu secret hay thông tin cá nhân. |
| **Tệp tĩnh & Duyệt thư mục** | **PASS** | Không có file nhạy cảm trong thư mục `frontend/`; Express static ngăn chặn triệt để Path Traversal (`404 Not Found`). |

---

## 2. Bảng phát hiện (Findings Summary)

| Mã lỗi | Loại | Mức độ (Severity) | Vị trí | Tóm tắt |
|---|:---:|:---:|---|---|
| **[VULN-S04-FE01](../../testing/bugs/VULN-S04-FE01.md)** | VULN | **Cao (High - 7.2)** | `frontend/components/station-map.js:80,84` | Stored XSS trong Leaflet Tooltip khi hiển thị tên trạm sạc trên bản đồ. |
| **[WEB-01](../../testing/bugs/WEB-01.md)** | VULN | **Trung bình (Medium - 5.4)** | `backend/src/app.js` | Thiếu toàn bộ các Header Bảo mật (CSP, X-Frame-Options, nosniff, Referrer-Policy); lộ `X-Powered-By`. |
| **TEST-DEBT-FE01** | TEST-DEBT | **Thấp (Low)** | `tools/verify-ui-round6.js` | Kịch bản kiểm thử giao diện E2E chưa được đưa vào CI / pipeline test mặc định (`python test.py`). |

---

## 3. Đánh giá chi tiết từng phân vùng

### 3.1 Bảng Sink & Nguồn dữ liệu (DOM / XSS Analysis)
- Toàn bộ source code nghiệp vụ của frontend (`frontend/app/`, `frontend/components/`, `frontend/pages/`) tuân thủ nghiêm ngặt mô hình xây dựng DOM an toàn thông qua helper `frontend/app/dom.js`:
  - `h(tag, props, ...children)` chuyển tất cả chuỗi thành `document.createTextNode(String(child))`.
  - Không tồn tại lệnh gán `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` nào trong mã nguồn ứng dụng tự viết.
- **Ngoại lệ nguy hiểm duy nhất:** Việc tích hợp thư viện Leaflet (`frontend/vendor/leaflet/leaflet.js`). Leaflet mặc định gán `t.innerHTML = e` khi nội dung tooltip là dạng chuỗi. Do `station-map.js` truyền trực tiếp `point.name` (dữ liệu do người dùng nhập) vào `marker.bindTooltip(point.name)`, mã độc HTML/SVG bị chèn thẳng vào DOM mà không qua escape.

### 3.2 Tầng Web & HTTP Security Headers
- Kiểm tra phản hồi HTTP từ máy chủ `http://localhost:3000`:
```http
HTTP/1.1 200 OK
X-Powered-By: Express
Vary: Origin
Access-Control-Allow-Credentials: true
```
- **Nhận xét:** Ứng dụng chưa có middleware bảo vệ tầng web (như `helmet`). Việc thiếu `X-Frame-Options` cho phép nhúng `iframe` dẫn tới nguy cơ Clickjacking, và thiếu CSP làm mất đi lớp khiên bảo vệ chiều sâu đối với các lỗi XSS.

### 3.3 Phân quyền giao diện vs Phân quyền Backend
- Nút bấm **Reset từ xa** (`fleet-status.js`): Kiểm tra quyền `charge-points:reset` trước khi render; nếu người dùng không phải `ADMIN`/`OPERATOR`, nút hoàn toàn không được tạo trong DOM.
- Thử nghiệm gọi thẳng API `POST /api/charge-points/1/reset` và `POST /api/stations` bằng vai trò `DRIVER`: Backend trả về `403 FORBIDDEN`.
- Thử nghiệm gọi API `PATCH /api/stations/5` và `GET /api/stations/5` của Chủ trạm B bằng tài khoản Chủ trạm A: Backend trả về `403 FORBIDDEN`.
- $\rightarrow$ Cơ chế phân quyền và kiểm soát truy cập đa chủ trạm (Tenant Isolation) hoạt động hoàn toàn chính xác và nhất quán giữa giao diện và backend.

### 3.4 Kênh đẩy sự kiện thời gian thực (SSE)
- Kiểm tra route `GET /api/fleet-status/events`:
