# VULN-S04-FE01 — Lỗ hổng Stored XSS trong Leaflet Tooltip hiển thị tên trạm trên Bản đồ

Loại: VULN | Severity: Cao (CVSS 3.1: 7.2 - `CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:L/A:N`) | Story/Task: S-04 / T-09  
Mức xác minh: ĐÃ CHẠY | Trạng thái: MỞ  
Màn hình/URL: `/app.html#/operator/map`, `/app.html#/owner/map`  
Vai trò dùng để tái hiện: STATION_OWNER (tạo trạm độc hại) $\rightarrow$ Nạn nhân: OPERATOR / ADMIN (mở bản đồ)  
Trình duyệt + phiên bản: Chromium / Chrome 120+, Firefox 120+  
Bằng chứng: DOM Node Tooltip chứa mã HTML thực thi, không bị escape; không có CSP ngăn chặn.  

---
