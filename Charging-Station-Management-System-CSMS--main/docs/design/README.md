# Thiết kế giao diện (UX Redesign Level 3)

- `CSMS_UX_Redesign_Level_3_Operator_Dashboard.md` — đặc tả đã duyệt (nguồn sự thật cho giao diện).
- `operator-dashboard-baseline.webp` — ảnh tham chiếu Operator Operations Center.

## Trạng thái triển khai (cập nhật 03/10/2026)

| Hạng mục (mục 23 của đặc tả) | Trạng thái |
|---|---|
| P0 Foundation: token, dark/light, App Shell, Sidebar, Topbar, Role Switcher, router, auth state, permission helper, responsive | Xong |
| P1 Operator: Dashboard, danh sách trạm, danh sách trụ, chi tiết trụ (drawer), bản đồ | Xong, dùng dữ liệu thật |
| P1 Operator: trạng thái trụ/đầu nối thời gian thực (S-11) | Xong: `GET /api/fleet-status` + SSE, trạng thái `ONLINE`/`UNAVAILABLE` hiển thị đúng nhóm |
| P1 Operator: phiên sạc, cảnh báo, điều khiển từ xa, OCPP, nhật ký | **Chưa có backend** — mục menu ẩn (`enabled:false` trong `app/workspace.js`), bật khi story `since` xong |
| P2 Chủ trạm (quản lý trạm/trụ), Quản trị (tạo tài khoản), Kế toán (khung) | Xong phần có API |
| P3 Driver: shell mobile-first + tài khoản | Xong khung; tìm trạm/sạc/ví chờ backend |

## Quyết định lệch so với đặc tả (có lý do)

- **Router theo hash** (`#/operator/stations/12`) thay vì đường dẫn thật: backend không cần trả `index` cho mọi URL.
- **`services/realtime.js` dùng SSE** (không phải `websocket.js`) cho trạng thái trụ: `/api/fleet-status/events`, tự nối lại và đồng bộ lại snapshot; chỉ khi SSE không dùng được mới polling 15 giây. Các màn hình chưa có kênh đẩy vẫn polling.
- **Leaflet được vendor** (`frontend/vendor/leaflet`, MIT) thay cho CDN; không dùng Google Fonts (font hệ thống) — không gọi tài nguyên ngoài ngoài ô bản đồ OpenStreetMap.
- **Chưa có khối nào hiển thị số giả**: khối chưa có dữ liệu (cảnh báo, hiệu suất, phiên sạc) hiện trạng thái rỗng có giải thích.
- Nhóm hiển thị trạng thái ánh xạ ở **một chỗ** (`app/status.js`); giá trị OCPP gốc không đổi.
- KPI “Cảnh báo” hiện “—”: severity phải do business rule quyết định (mục 10), chưa có nguồn.

## Việc còn lại
Chi tiết phiên sạc, Alert Center, Remote Control (kèm audit), OCPP Monitor, Audit Log, ví/hoá đơn của Driver — làm cùng các story backend tương ứng (xem nav `since`).

## Ảnh chụp giao diện hiện có
Thư mục `screenshots/` (chụp 28/9/2026 bằng dữ liệu thử): đăng nhập/đăng ký (sáng, tối, lỗi kiểm tra), bảng điều khiển Operator (tối, sáng, cả trang), tìm kiếm Ctrl+K, thông báo, menu người dùng, danh sách trạm/trụ, ngăn kéo chi tiết, lọc trụ, bản đồ, tài khoản, chọn workspace (đa vai trò), Chủ trạm (form thêm trạm, thêm trụ, sửa trụ), Quản trị (tạo tài khoản), Kế toán, Tài xế và Operator trên điện thoại. Ô bản đồ xám vì môi trường chụp không tải được nền OpenStreetMap. Ảnh kiểm tra giao diện sau vòng 6 (desktop 1280 px, mobile 390 px, trước/sau F2) nằm ở [`../testing/ui-round6/`](../testing/ui-round6/); nền bản đồ thật **chưa kiểm** trên mạng có Internet.
