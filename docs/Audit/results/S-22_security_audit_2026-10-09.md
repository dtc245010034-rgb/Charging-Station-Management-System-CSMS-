# BÁO CÁO KIỂM TOÁN AN NINH: S-22 (DRIVER SESSION REALTIME)

> Thời điểm thực hiện: **09/10/2026**  
> Tiêu chuẩn kiểm toán: `Evidence-First` (Security Audit Spec v3.0)  
> Phạm vi: Mã nguồn S-22 (`sessions.routes.js`, `sessions.service.js`, `sessions.repository.js`, `sessions.events.js`, `frontend/pages/driver/session.js`).  
> Thực hiện bởi: AI Security Auditor / Dev.

---

## 1. Tóm tắt kết quả kiểm toán

| Phân vùng kiểm toán | Đánh giá | Mức độ | Bằng chứng kiểm chứng |
|---|:---:|:---:|---|
| **1. Kiểm soát truy cập & IDOR (NĐ 13)** | **PASS** | `SECURE` | Cố tình truy cập `GET /api/sessions/:id` của tài xế khác bị chặn 403 `FORBIDDEN` và ghi `audit_logs` `ACCESS_DENIED`. |
| **2. Cô lập luồng SSE thời gian thực** | **PASS** | `SECURE` | Luồng `/api/me/sessions/events` lọc gói tin per-connection theo `event.driverId === req.user.id`. Đã kiểm chứng 2 tài xế song song trên live HTTP server. |
| **3. Giới hạn thời gian sống luồng SSE** | **PASS** | `SECURE` | Luồng SSE tự động ngắt kết nối chính xác khi JWT hết hạn (đo thực tế 2 giây trong `tests/unit/S-22.live-sse-verification.test.js`). |
| **4. Phòng chống SQL Injection** | **PASS** | `SECURE` | 100% truy vấn trong `sessions.repository.js` sử dụng tham số hóa `$1, $2`, không nối chuỗi thô. |
| **5. Bảo vệ XSS tầng Frontend** | **PASS** | `SECURE` | Toàn bộ giao diện `driver/session.js` sử dụng `dom.js` (`document.createTextNode`), không dùng `innerHTML` hay chèn HTML thô. |
| **6. Quản trị tài nguyên & Rò rỉ bộ nhớ** | **PASS** | `SECURE` | Hàm `render()` trả về `cleanup()` đóng sạch sẽ `EventSource` và `setInterval` khi rời trang. |
| **7. Bảo mật định danh cá nhân (PII)** | **PASS** | `SECURE` | Mã thẻ RFID luôn che 4 ký tự cuối (`id_tag_masked`), không log hoặc trả về mã thẻ thô trong JSON hay log ứng dụng. |

---

## 2. Chi tiết phân tích kỹ thuật (Technical Evidence Ladder)

### 2.1 Kiểm soát truy cập & Phòng chống IDOR
- **Mã nguồn:** [sessions.service.js:82-87](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/backend/src/modules/sessions/sessions.service.js#L82-L87)
  ```javascript
  if (!isAdminOrOperator && String(row.driver_id) !== String(user.id)) {
    if (deniedLimiter.take(`actor:${user.id}`).allowed) {
      await audit.record(user.id, 'ACCESS_DENIED', 'charging_session', sessionId, {}, user.ip).catch(() => {});
    }
    throw new ForbiddenError('Không có quyền truy cập phiên sạc của tài xế khác');
  }
  ```
- **Chứng minh:**
  - `tests/unit/S-22.sessions-service.test.js`: Kiểm tra từ chối tài xế A khi truy cập phiên của tài xế B $\rightarrow$ 403 `FORBIDDEN`.
  - Có cơ chế rate-limit chống spam `deniedLimiter` bảo vệ bảng `audit_logs`.

### 2.2 Bảo vệ quyền riêng tư luồng SSE (Event Stream Privacy)
- **Mã nguồn:** [sessions.routes.js:68-73](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/backend/src/modules/sessions/sessions.routes.js#L68-L73)
  ```javascript
  unsubscribe = subscribe((event) => {
    if (closed || String(event.driverId) !== String(req.user.id)) return;
    const data = JSON.stringify(event);
    send(`data: ${data}\n\n`);
  });
  ```
- **Chứng minh:**
  - `tests/unit/S-22.live-sse-verification.test.js`: Mở 2 kết nối HTTP thật cho Driver A và Driver B. Khi publish sự kiện cho Driver A, Driver B hoàn toàn không nhận được dữ liệu và ngược lại.

### 2.3 Bảo vệ quá tải và tự hủy SSE khi hết hạn phiên (Token Expiry)
- **Mã nguồn:** [sessions.routes.js:78-83](file:///c:/Users/Admin/Downloads/Charging-Station-Management-System-CSMS-/backend/src/modules/sessions/sessions.routes.js#L78-L83)
  - Sử dụng `Math.min(Math.max(req.user.exp * 1000 - Date.now(), 0), 2 ** 31 - 1)` để chống tràn số nguyên 32 bit của `setTimeout`.
  - Đóng socket và gọi `cleanup()` khi JWT hết hạn.
- **Chứng minh:**
  - Đã chạy kiểm chứng với token 2s trong `tests/unit/S-22.live-sse-verification.test.js`, luồng ngắt kết nối sau 2006ms.

---

## 3. Kết luận kiểm toán
- **Trạng thái:** **PASS TOÀN DIỆN (AUDIT PASSED)**.
- **Khuyến nghị:** Sẵn sàng đưa vào nhánh chính hoặc bàn giao sang kiểm thử chấp nhận người dùng (UAT).
