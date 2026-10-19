# Tổng Kết Dự Án CSMS (Chặng 1 — Chặng 9)

> Đồ án Thực tập cơ sở ICTU × CodeGym · nhóm **TTCS_T926_K8S4_N3**  
> Dự án: Nền tảng Vận hành Trạm Sạc Xe Điện (CSMS - Charging Station Management System) theo chuẩn OCPP 1.6J.

---

## 1. Bảng Tổng Hợp 39 Thẻ Tính Năng (Jira ↔ Chặng ↔ Kiểm Thử ↔ Trạng Thái)

| Thẻ | Mã Jira | Chặng | Tên Tính Năng & Phạm Vi | Tệp Kiểm Thử Chính | Trạng Thái | Giới Hạn Đã Biết |
|---|---|---|---|---|---|---|
| S-01 | GYM-01 | 1 | Đăng nhập JWT cookie HttpOnly | `auth.test.js` | DONE | Cookie an toàn |
| S-02 | GYM-02 | 1 | Phân quyền 5 vai trò (RBAC) | `S-03.rbac-matrix.test.js` | DONE | Mặc định từ chối (deny-by-default) |
| S-03 | GYM-03 | 1 | Route Guard & Ma trận phân quyền | `S-03.route-guard.test.js` | DONE | Đồng bộ backend/frontend 100% |
| S-04 | GYM-04 | 1 | Quản lý trạm sạc & đầu nối | `S-04.station-management.test.js` | DONE | Kiểm tra quyền sở hữu |
| S-05 | GYM-05 | 1 | Biểu giá nhiều khung giờ & làm tròn | `S-05.tariffs.test.js` | DONE | Làm tròn HALF_UP |
| S-06 | GYM-11 | 2 | Kết nối WebSocket OCPP 1.6J | `ocpp-connection.test.js` | DONE | Từ chối trụ lạ |
| S-07 | GYM-12 | 2 | Khung giao thức Call/CallResult/CallError | `ocpp-frame.test.js` | DONE | Bắt đúng JSON schema OCPP |
| S-08 | GYM-13 | 2 | BootNotification & khoá trạm | `ocpp-boot.test.js` | DONE | Khóa trạm chặn Boot |
| S-09 | GYM-14 | 2 | Heartbeat & cập nhật last_seen_at | `ocpp-heartbeat.test.js` | DONE | Heartbeat 30s |
| S-10 | GYM-15 | 2 | StatusNotification & trạng thái đầu nối | `ocpp-status.test.js` | DONE | Đầy đủ lỗi Faulted/Unavailable |
| S-11 | GYM-16 | 2 | Giám sát trụ sạc thời gian thực (SSE) | `fleet-status.test.js` | DONE | SSE lọc theo vai trò |
| S-12 | GYM-17 | 2 | Job quá hạn nhịp tim (Offline) | `heartbeat-expiry.test.js` | DONE | Đánh OFFLINE khi mất tin |
| S-13 | GYM-18 | 2 | Trùng mã trụ đóng kết nối cũ | `ocpp-duplicate-connection.test.js` | DONE | Đảm bảo 1 kết nối duy nhất |
| S-14 | GYM-19 | 2 | Chống xử lý tin trùng (Idempotent OCPP) | `ocpp-duplicate-message.test.js` | DONE | Bảng `ocpp_messages` |
| S-15 | GYM-20 | 2 | Xác thực thẻ RFID qua Authorize | `S-15.authorize.test.js` | DONE | Che giấu mã thẻ khi ghi log |
| S-16 | GYM-21 | 2 | Lệnh Reset từ xa (Soft/Hard) | `S-16.reset.test.js` | DONE | Timeout 30s, ghi audit log |
| S-17 | GYM-31 | 3 | StartTransaction & phân quyền sạc | `S-17.start-transaction.test.js` | DONE | Kiểm tra số dư ví tối thiểu |
| S-18 | GYM-32 | 3 | MeterValues & cập nhật điện năng Wh | `S-18.meter-values.test.js` | DONE | Wh nguyên, chống số âm |
| S-19 | GYM-33 | 3 | StopTransaction & chốt số đo | `S-19.stop-transaction.test.js` | DONE | Chốt kWh chính xác |
| S-20 | GYM-34 | 3 | Lập hoá đơn phiên sạc tự động | `S-20.invoicing.test.js` | DONE | Bảng bất biến append-only |
| S-21 | GYM-35 | 3 | Trừ tiền ví tự động & sổ cái | `S-21.wallet-debit.test.js` | DONE | Cho phép nợ khi sạc dở dang |
| S-22 | GYM-36 | 3 | RemoteStopTransaction khi ví cạn | `S-22.remote-stop.test.js` | DONE | Tự động ngắt sạc an toàn |
| S-23 | GYM-37 | 3 | Nạp tiền ví qua sandbox cổng thanh toán | `S-23.wallet-topup.test.js` | DONE | Cổng sandbox giả lập |
| S-24 | GYM-38 | 3 | Webhook thanh toán an toàn (HMAC) | `S-24.payment-webhook.test.js` | DONE | Kiểm tra chữ ký HMAC-SHA256 |
| S-25 | GYM-39 | 3 | Quản lý ví tài xế & khoá ví | `S-25.wallet-management.test.js` | DONE | Khoá ví chặn nạp/sạc |
| S-26 | GYM-40 | 3 | Phiên sạc bất thường & đóng thủ công | `S-26.abnormal-sessions.test.js` | DONE | Hỗ trợ ô tích 0 kWh |
| S-27 | GYM-41 | 3 | Bất biến dữ liệu tài chính (Triggers) | `S-27.immutability.test.js` | DONE | Chặn UPDATE, DELETE & TRUNCATE |
| S-42 | GYM-61 | 6 | Phân bổ công suất động (Smart Charging) | `S-42.smart-charging.test.js` | DONE | Chia đều theo hạn mức trạm |
| S-43 | GYM-62 | 6 | Gửi SetChargingProfile xuống trụ sạc | `S-43.set-charging-profile.test.js` | DONE | Chỉ gửi khi giới hạn thay đổi |
| S-44 | GYM-63 | 6 | Tự động cân bằng phụ tải khi xe vào/ra | `S-44.dynamic-rebalance.test.js` | DONE | Rebalance tức thời |
| S-48 | GYM-72 | 7 | Đặt chỗ trước qua ứng dụng di động | `S-48.reservation.test.js` | DONE | Gửi ReserveNow xuống trụ |
| S-49 | GYM-73 | 7 | Khoá chống đặt trùng & giải phóng chỗ | `S-49.reservation-concurrency.test.js` | DONE | Khoá hàng FOR UPDATE chống đua |
| S-52 | GYM-81 | 5 | Báo cáo doanh thu theo trạm & thời gian | `S-52.revenue-report.test.js` | DONE | Múi giờ địa phương trạm |
| S-53 | GYM-82 | 5 | Đối soát tự động giữa số đo & hoá đơn | `S-53.reconciliation.test.js` | DONE | Bắt 4 loại lỗi đối soát |
| S-54 | GYM-83 | 8 | Bảng kê chia sẻ doanh thu đối tác | `S-54.revenue-sharing.test.js` | DONE | Chia theo đoạn tỷ lệ ngày |
| S-45 | GYM-71 | 9 | Hạn mức công suất theo khung giờ | `S-45.power-windows.test.js` | DONE | PostgreSQL btree_gist EXCLUDE |
| S-50 | GYM-76 | 9 | Phí không đến và quá hạn đặt chỗ | `S-50.reservation-expiry.test.js` | DONE | Job quá hạn trừ ví sổ cái |
| S-51 | GYM-77 | 9 | Huỷ chỗ đặt và giải phóng đầu nối | `S-51.reservation-cancel.test.js` | DONE | Atomic UPDATE loại trừ job quá hạn |
| S-65 | GYM-91 | 9 | Gói thuê bao tháng với biểu giá riêng | `S-65.subscription.test.js` | DONE | Snapshot biểu giá gói, đối soát 0 lỗi |

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
