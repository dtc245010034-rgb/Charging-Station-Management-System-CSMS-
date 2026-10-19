# Tổng Kết Dự Án CSMS (Chặng 1 — Chặng 9)

> Đồ án Thực tập cơ sở ICTU × CodeGym · nhóm **TTCS_T926_K8S4_N3**  
> Dự án: Nền tảng Vận hành Trạm Sạc Xe Điện (CSMS - Charging Station Management System) theo chuẩn OCPP 1.6J.

---

## 1. Bảng Tổng Hợp 66 Thẻ Story (Jira ↔ Kiểm Thử ↔ Trạng Thái)

> Nguồn: Jira dự án GYM (đọc ngày 19/10/2026), mỗi dòng đối chiếu từng thẻ, không suy ra từ công thức. Thẻ `S-xx` có mã Jira `GYM-n` (S-01…S-05 là GYM-7…GYM-11; từ S-06 trở đi là `GYM-(xx+26)`).
> Trạng thái ghi **đúng như Jira tại thời điểm trên**: 62 thẻ **Done**; 4 thẻ đang ở trạng thái **Review** (S-45, S-50, S-51, S-65), chưa phải Done, chờ nhóm đổi trạng thái sau khi nghiệm thu.
> Cột «Tệp kiểm thử» chỉ liệt kê tệp CÓ trong repo (tên nằm trong `backend/tests/`, trừ tệp `tools/…`), đối chiếu theo mã thẻ trong tên tệp hoặc trong mô tả `describe`. `node tools/check-docs.js` (chạy trong CI) kiểm tra từng tên tệp còn tồn tại và số dòng của bảng khớp tiêu đề.

| Thẻ | Mã Jira | Tiêu đề (theo Jira) | Trạng thái Jira | Tệp kiểm thử tự động |
|---|---|---|---|---|
| S-01 | GYM-7 | Khung ứng dụng chạy được trên máy cá nhân | Done | `acceptance/S-01.baseline.test.js`<br>`integration/create-admin.test.js`<br>`integration/migrate.test.js`<br>`unit/env.test.js`<br>`unit/errorHandler.test.js`<br>`unit/no-backdoor.test.js` |
| S-02 | GYM-8 | Đăng nhập bằng email và mật khẩu, khoá tạm khi sai nhiều lần | Done | `acceptance/S-02.frontend.test.js`<br>`acceptance/S-02.login-ip.test.js`<br>`acceptance/S-02.login.test.js`<br>`unit/frontend.test.js` |
| S-03 | GYM-9 | Mỗi vai trò chỉ thấy và thao tác được phần việc của mình | Done | `acceptance/S-03.accounts.test.js`<br>`acceptance/S-03.csrf.test.js`<br>`acceptance/S-03.rbac-matrix.test.js`<br>`acceptance/S-03.rbac.test.js`<br>`acceptance/S-03.route-guard.test.js`<br>`acceptance/S-03.trust-proxy.test.js`<br>`unit/eslint-guard.test.js` |
| S-04 | GYM-10 | Chủ trạm tạo và sửa thông tin trạm sạc | Done | `acceptance/S-04.station-management.test.js`<br>`unit/station-schema.test.js` |
| S-05 | GYM-11 | Chủ trạm thêm trụ và đầu nối vào trạm, mã trụ là duy nhất | Done | `acceptance/S-05.charge-point-code.test.js` |
| S-06 | GYM-32 | Trụ đã đăng ký kết nối được qua WebSocket, trụ lạ bị từ chối | Done | `acceptance/S-06.ocpp-handshake.test.js` |
| S-07 | GYM-33 | Hệ thống đọc và ghi đúng ba loại khung tin nhắn OCPP | Done | `unit/ocpp-frames.test.js` |
| S-08 | GYM-34 | Trụ khởi động được chấp nhận qua `BootNotification` | Done | `integration/ocpp-boot-notification.test.js` |
| S-09 | GYM-35 | Trụ báo nhịp tim và thời điểm liên lạc cuối được cập nhật | Done | `integration/ocpp-heartbeat-timezone.test.js` |
| S-10 | GYM-36 | Trụ báo trạng thái từng đầu nối qua `StatusNotification` | Done | `unit/ocpp-status-notification.test.js` |
| S-11 | GYM-37 | Vận hành viên xem trạng thái mọi trụ trên một màn hình tự cập nhật | Done | `integration/S-11.fleet-status-sse.test.js`<br>`integration/S-11.fleet-status.test.js` |
| S-12 | GYM-38 | Trụ quá hạn nhịp tim bị đánh dấu ngoại tuyến | Done | `integration/S-12.comprehensive-qa.test.js`<br>`unit/charge-point-offline-job.test.js` |
| S-13 | GYM-39 | Cùng mã trụ mở hai kết nối thì kết nối cũ bị đóng | Done | `unit/ocpp-handshake-throttle.test.js` |
| S-14 | GYM-40 | Tin nhắn trùng mã nhận lại đúng câu trả lời cũ, không xử lý hai lần | Done | `acceptance/S-14.duplicate-message.test.js`<br>`integration/ocpp-duplicate-message-server.test.js`<br>`integration/ocpp-duplicate-message.test.js` |
| S-15 | GYM-41 | Trụ xác thực thẻ tài xế qua `Authorize` | Done | `acceptance/S-15.authorize.test.js`<br>`integration/ocpp-authorize-server.test.js`<br>`unit/ocpp-authorize-commands.test.js` |
| S-16 | GYM-42 | Vận hành viên khởi động lại trụ từ xa bằng `Reset` | Done | `acceptance/S-16.reset.test.js`<br>`unit/charge-points-reset.test.js` |
| S-17 | GYM-43 | Phiên sạc bắt đầu khi trụ gửi `StartTransaction` | Done | `integration/S-17.start-transaction-server.test.js`<br>`unit/S-17.start-transaction.test.js` |
| S-18 | GYM-44 | Phiên sạc kết thúc khi trụ gửi `StopTransaction` và chốt số kWh | Done | `integration/ocpp-stop-transaction-server.test.js`<br>`unit/ocpp-stop-transaction.test.js` |
| S-19 | GYM-45 | Số đo điện năng được ghi liên tục qua `MeterValues` | Done | `integration/S-19.meter-values-server.test.js`<br>`unit/ocpp-meter-values.test.js` |
| S-20 | GYM-46 | Số đo lùi hoặc trùng mốc thời gian bị bỏ qua | Done | `unit/meter-rules.test.js` |
| S-21 | GYM-47 | Phiên đang dở được khôi phục đúng khi trụ nối lại | Done | `unit/s21-reconnect-fleet.test.js` |
| S-22 | GYM-48 | Tài xế xem phiên đang sạc của mình cập nhật theo thời gian thực | Done | `integration/S-22.driver-session-sse.test.js`<br>`integration/S-22.driver-session.test.js`<br>`integration/S-22.so-do-thap-phan.test.js`<br>`integration/S-22.sse-pipeline.test.js`<br>`unit/S-22.sessions.test.js` |
| S-23 | GYM-49 | Vận hành viên dừng phiên sạc từ xa bằng `RemoteStopTransaction` | Done | `acceptance/S-23.remote-stop.test.js`<br>`unit/S-23.remote-stop-job.test.js` |
| S-24 | GYM-50 | Tài xế bắt đầu phiên từ ứng dụng bằng `RemoteStartTransaction` | Done | `acceptance/S-24.remote-start.test.js` |
| S-25 | GYM-51 | Phiên không có tin kết thúc quá lâu bị đánh dấu bất thường | Done | `unit/S-25.unexpected-sessions.test.js` |
| S-26 | GYM-52 | Bộ trụ ảo chạy trong `docker-compose` và trong CI | Done | `acceptance/S-26.vcp-compose-ci.test.js` |
| S-27 | GYM-53 | Mọi lệnh điều khiển từ xa được ghi nhật ký kèm người thực hiện | Done | `integration/audit-logs.test.js` |
| S-28 | GYM-54 | Chủ trạm khai báo biểu giá theo kWh và phí chiếm trụ theo phút | Done | `acceptance/S-28.tariff-declaration.test.js` |
| S-29 | GYM-55 | Biểu giá có nhiều khung giờ trong ngày, không chồng lấn và phủ kín 24 giờ | Done | `acceptance/S-29.tariff-periods.test.js` |
| S-30 | GYM-56 | Phiên cắt qua nhiều khung giờ được chia đoạn và tính đúng từng đoạn | Done | `acceptance/S-30.price-session.test.js` |
| S-31 | GYM-57 | Phiên qua nửa đêm tính đúng sang biểu giá ngày hôm sau | Done | `acceptance/S-31.midnight.test.js` |
| S-32 | GYM-58 | Bộ ca kiểm thử tính tiền có đáp án tính tay | Done | `acceptance/S-32.hand-cases.test.js`<br>`unit/billing.hand-cases.test.js` |
| S-33 | GYM-59 | Tài xế xem hoá đơn có diễn giải từng đoạn giá | Done | `acceptance/S-33.invoice-history.test.js` |
| S-34 | GYM-60 | Đổi biểu giá không làm đổi tiền của phiên đã kết thúc | Done | `acceptance/S-34.tariff-versioning.test.js` |
| S-35 | GYM-61 | Tài xế nạp tiền vào ví qua cổng thanh toán sandbox | Done | `acceptance/S-35.wallet-topup.test.js` |
| S-36 | GYM-62 | Quản trị viên nạp tay vào ví khi chưa có cổng thanh toán | Done | `acceptance/S-36.wallet-topups.test.js` |
| S-37 | GYM-63 | Ví bị trừ tự động khi phiên kết thúc, có bản ghi giao dịch | Done | `integration/wallet-invoice-debit.test.js` |
| S-38 | GYM-64 | Ví dưới ngưỡng tối thiểu thì trụ từ chối bắt đầu phiên mới | Done | `integration/wallet-min-balance.test.js` |
| S-39 | GYM-65 | Webhook nạp ví gửi lại nhiều lần chỉ ghi nhận một, sai chữ ký bị từ chối | Done | `acceptance/S-39.webhook-idempotency.test.js` |
| S-40 | GYM-66 | Tài xế xem số dư và lịch sử giao dịch ví | Done | `acceptance/S-40.wallet-read.test.js` |
| S-41 | GYM-67 | Số dư ví luôn khớp sổ cái chỉ ghi thêm | Done | `integration/migrate-036-wallets.test.js`<br>`integration/wallet-audit-job.test.js`<br>`integration/wallet-ledger-concurrency.test.js`<br>`integration/wallet-ledger.service.test.js` |
| S-42 | GYM-68 | Chủ trạm đặt hạn mức công suất cho trạm | Done | `acceptance/S-42.power-limit.test.js` |
| S-43 | GYM-69 | Tổng công suất cấp cho các trụ đang sạc không vượt hạn mức trạm | Done | `acceptance/S-43.alerts.test.js`<br>`acceptance/S-43.power-allocation.test.js` |
| S-44 | GYM-70 | Công suất được chia lại khi có xe vào hoặc rời trạm | Done | `acceptance/S-44.power-rebalance.test.js` |
| S-45 | GYM-71 | Chủ trạm đặt hạn mức công suất theo khung giờ | Review | `acceptance/S-45.power-windows.test.js`<br>`unit/power-schedule-job.test.js`<br>`unit/power-schedule.test.js` |
| S-46 | GYM-72 | Cảnh báo khi trụ ngoại tuyến quá lâu hoặc báo lỗi liên tục | Done | `acceptance/S-46.charge-point-health.test.js` |
| S-47 | GYM-73 | Tài xế tìm trạm gần và thấy đầu nối nào đang rảnh | Done | `acceptance/S-47.station-search.test.js` |
| S-48 | GYM-74 | Tài xế đặt chỗ một trụ trong khoảng thời gian | Done | `acceptance/S-48.reservation.test.js` |
| S-49 | GYM-75 | Hai tài xế đặt cùng trụ cùng lúc thì chỉ một người thành công | Done | `acceptance/S-49.reservation-concurrency.test.js` |
| S-50 | GYM-76 | Giữ chỗ quá giờ không tới thì bị huỷ và tính phí | Review | `acceptance/S-50.reservation-expiry.test.js` |
| S-51 | GYM-77 | Tài xế huỷ chỗ đã đặt và trụ mở lại cho người khác | Review | `acceptance/S-51.reservation-cancel.test.js` |
| S-52 | GYM-78 | Chủ trạm xem doanh thu và sản lượng kWh theo kỳ, theo từng trụ | Done | `acceptance/S-52.revenue-report.test.js` |
| S-53 | GYM-79 | Kế toán đối soát tổng kWh đã cấp với tổng tiền đã thu | Done | `acceptance/S-53.reconciliation.test.js` |
| S-54 | GYM-80 | Chia doanh thu cho đối tác theo tỉ lệ hợp đồng | Done | `acceptance/S-54.revenue-sharing.test.js`<br>`integration/partner-rates.test.js`<br>`unit/settlement-compute.test.js` |
| S-55 | GYM-81 | Kỳ đối soát được chốt và khoá | Done | `acceptance/S-55.periods.test.js` |
| S-56 | GYM-82 | Nhật ký thao tác trên giao dịch ví truy được ai làm gì | Done | `acceptance/S-56.audit-driver-filter.test.js`<br>`acceptance/S-56.wallet-admin-actions.test.js` |
| S-57 | GYM-83 | Tài xế yêu cầu xoá dữ liệu cá nhân và lịch sử di chuyển | Done | `acceptance/S-57.data-erasure.test.js` |
| S-58 | GYM-84 | Xuất báo cáo doanh thu và đối soát ra tệp CSV | Done | `acceptance/S-58.csv-export.test.js` |
| S-59 | GYM-85 | Tài xế nhận thông báo khi phiên kết thúc hoặc bị dừng | Done | `acceptance/S-59.notifications.test.js` |
| S-60 | GYM-86 | Vận hành viên đổi cấu hình trụ từ xa bằng `ChangeConfiguration` | Done | `acceptance/S-60.change-configuration.test.js`<br>`unit/charge-points-configuration.test.js` |
| S-61 | GYM-87 | Quản trị viên quản lý tài khoản và gán vai trò | Done | `acceptance/S-61.account-management.test.js` |
| S-62 | GYM-88 | Sao lưu cơ sở dữ liệu hằng ngày và khôi phục được | Done | `tools/test_backup_scripts.py` |
| S-63 | GYM-89 | Bảng sức khoẻ hệ thống: trụ trực tuyến, phiên đang chạy, lỗi gần đây | Done | `acceptance/S-63.health-overview.test.js` |
| S-64 | GYM-90 | Tài xế xem lịch sử phiên sạc của mình | Done | `acceptance/S-64.session-history.test.js` |
| S-65 | GYM-91 | Gói thuê bao tháng với biểu giá riêng | Review | `acceptance/S-65.subscription.test.js`<br>`integration/subscriptions-api.test.js`<br>`integration/subscriptions-billing.test.js` |
| S-66 | GYM-92 | Chủ trạm đưa trạm vào hoạt động hoặc tạm ngừng | Done | `acceptance/S-66.station-operating.test.js` |

---

## 2. Các Câu Hỏi PO Còn Mở & Mặc Định Đã Áp Dụng
1. **Gói thuê bao tháng áp dụng ở đâu?**
   * *Mặc định đã áp dụng:* Gói thuê bao áp dụng cho MỌI trạm sạc trên toàn hệ thống CSMS.
2. **Chiết khấu gói tháng tính cho đối tác như thế nào?**
   * *Mặc định đã áp dụng:* Phần giảm giá do chủ trạm gánh trong phiên sạc vì bảng kê S-54 chia theo doanh thu thực tế ghi trên hoá đơn.
3. **Trụ sạc ngoại tuyến lúc hết hạn đặt chỗ:**
   * *Mặc định đã áp dụng:* CSDL vẫn đánh dấu `EXPIRED` và trừ phí bình thường; hệ thống thử lại lệnh `CancelReservation` tối đa 5 lần rồi ghi cảnh báo (Trụ sạc sẽ tự giải phóng tại chỗ nhờ `expiryDate` của lệnh ReserveNow).
4. **Hạn mức công suất hạ quá thấp:**
   * *Mặc định đã áp dụng:* Chia theo tỷ lệ công suất danh định hiện có, không tự ý ngắt phiên sạc của tài xế.

---

## 3. Những Việc Chưa Làm (Out of Scope / Next Phase)
* Cổng thanh toán thực tế (hiện dùng Sandbox Payment Gateway tuân thủ tiêu chuẩn tài chính).
* Gửi Email xác nhận qua giao thức SMTP thật (hiện ghi nhật ký thông báo trong CSDL).
* Bản đồ số tích hợp Leaflet/Google Maps với tile bản đồ trực tuyến thương mại.
* Lịch sao lưu tự động cron trên môi trường Production ngoài máy chủ.

---

## 4. Rủi Ro Còn Lại & Khuyến Nghị
* **Đồng hồ hệ thống:** Các kiểm thử múi giờ và khung giờ dựa vào đồng hồ máy chủ. Cần kích hoạt NTP đồng bộ thời gian trên máy chủ Production.
* **Tải phụ tải cực thấp:** Nếu chủ trạm khai hạn mức công suất quá thấp (< 1.4 kW/cổng), xe điện có thể ngừng sạc do tiêu chuẩn sạc một pha yêu cầu dòng tối thiểu 6A.
