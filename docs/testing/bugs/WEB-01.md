# WEB-01 — Thiếu toàn bộ các Header Bảo mật Tầng Web quan trọng (Clickjacking, CSP, MIME-sniffing)

Loại: VULN (Tầng Web) | Severity: Trung bình (CVSS 3.1: 5.4 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N`) | Story/Task: Web Tier / Toàn hệ thống  
Mức xác minh: ĐÃ CHẠY | Trạng thái: MỞ  
Màn hình/URL: Tất cả các route HTTP (`/`, `/app.html`, `/api/*`)  
Trình duyệt + phiên bản: Tất cả các trình duyệt  
Bằng chứng: Kết quả `curl -i http://localhost:3000/` không chứa bất kỳ security header nào; header `X-Powered-By: Express` bị lộ.  

---

