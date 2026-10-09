# WEB-01 — Thiếu toàn bộ các Header Bảo mật Tầng Web quan trọng (Clickjacking, CSP, MIME-sniffing)

Loại: VULN (Tầng Web) | Severity: Trung bình (CVSS 3.1: 5.4 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N`) | Story/Task: Web Tier / Toàn hệ thống  
Mức xác minh: ĐÃ CHẠY | Trạng thái: MỞ  
Màn hình/URL: Tất cả các route HTTP (`/`, `/app.html`, `/api/*`)  
Trình duyệt + phiên bản: Tất cả các trình duyệt  
Bằng chứng: Kết quả `curl -i http://localhost:3000/` không chứa bất kỳ security header nào; header `X-Powered-By: Express` bị lộ.  

---

## 1. Mô tả
Máy chủ CSMS Express 5 (`backend/src/app.js`) đang phục vụ cả API lẫn các trang giao diện frontend tĩnh (`/index.html`, `/app.html`) nhưng hoàn toàn không cấu hình các HTTP response headers bảo mật tiêu chuẩn ngành (thường được cung cấp bởi thư viện `helmet` hoặc middleware cấu hình thủ công).

Cụ thể các thiếu sót được xác minh trên server thật:
1. **Thiếu `X-Frame-Options` và CSP `frame-ancestors`**: Cho phép trang web của bên thứ ba nhúng CSMS vào thẻ `<iframe>`, tạo điều kiện cho các cuộc tấn công **Clickjacking** (đánh lừa người dùng bấm vào các nút nhạy cảm như Đăng nhập, Khởi động lại trụ, v.v.).
2. **Thiếu `Content-Security-Policy` (CSP)**: Thiếu lớp phòng thủ chiều sâu (Defense-in-Depth) chống lại việc thực thi mã script trái phép (như lỗ hổng `VULN-S04-FE01`).
3. **Thiếu `X-Content-Type-Options: nosniff`**: Trình duyệt có thể thực hiện MIME-sniffing đối với các file tĩnh, tiềm ẩn rủi ro thực thi tệp tin giả mạo.
4. **Thiếu `Referrer-Policy`**: Có thể rò rỉ URL và query parameters cho bên thứ ba.
5. **Tiết lộ `X-Powered-By: Express`**: Cung cấp thông tin nền tảng công nghệ cho kẻ tấn công (Information Disclosure).

