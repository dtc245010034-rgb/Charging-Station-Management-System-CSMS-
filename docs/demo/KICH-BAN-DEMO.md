# Kịch bản tổng duyệt CSMS — 21/10/2026

## Mục tiêu và thời lượng

Tổng duyệt khoảng 35 phút, tập trung vào các luồng cần chứng minh trực tiếp ở chặng cuối:

| Thời gian | Nội dung | Bằng chứng |
|---|---|---|
| 0–5 phút | Khởi động, tài khoản và dữ liệu mẫu | `tools/demo-smoke.js` báo 6/6 |
| 5–12 phút | Hạn mức theo giờ | Lịch theo giờ địa phương và `SetChargingProfile` đổi tại ranh giới |
| 12–22 phút | Huỷ chỗ và khách không tới | Huỷ trước hạn không thu phí; hết hạn thu 20.000 đ một lần và gửi `CancelReservation` |
| 22–30 phút | Gói tháng | Gói VIP, số dư ví, mua/gia hạn và giá VIP trên hoá đơn |
| 30–35 phút | Kết luận | Giới hạn, môi trường sandbox, các kiểm tra chưa làm |

Demo không thay thế kiểm thử tự động, staging hoặc thử với trụ sạc vật lý. Thanh toán chỉ chạy sandbox; không nhập dữ liệu cá nhân hoặc toạ độ thật.

## Checklist trước buổi demo

- [ ] Dùng máy/môi trường demo riêng; không chạy seed trên dữ liệu thật.
- [ ] Khởi động hệ thống theo [`docs/OPERATIONS.md`](../OPERATIONS.md), kiểm tra cổng bằng `python run.py status`.
- [ ] Seed bằng mật khẩu demo tự chọn (tối thiểu 8 ký tự); không ghi mật khẩu vào repo, tài liệu hoặc log.
- [ ] Mở hai phiên trình duyệt: `owner@demo.csms.local` và `driver@demo.csms.local`. Mật khẩu của hai tài khoản là giá trị `DEMO_PASSWORD` đã dùng lúc seed.
- [ ] Đặt `ADMIN_EMAIL` và `ADMIN_PASSWORD` trong môi trường hiện tại theo thông tin đăng nhập Admin cục bộ; không ghi chúng vào repo hoặc tài liệu.
- [ ] Chạy simulator hai trụ và mở log:

  ```powershell
  $env:VCP_COUNT = '2'
  $env:VCP_HEARTBEAT_INTERVAL = '10'
  docker compose up -d --no-deps vcp
  docker compose logs -f vcp
  ```

- [ ] Chạy `node tools/demo-smoke.js`; chỉ tiếp tục khi toàn bộ kiểm khói đạt.
- [ ] Kiểm tra trụ simulator `ONLINE`, đầu nối `Available`, tài xế có thẻ `TAG-DEMO-01` và ví đủ tiền.
- [ ] Nếu muốn rút ngắn thời gian đợi khách không tới, chỉ trên môi trường demo đặt `$env:RESERVATION_HOLD_MIN = '1'` trước khi khởi động backend. Mặc định là 15 phút; với `arriveInMinutes=1`, chỗ mặc định hết hạn sau 16 phút.

Seed demo tạo gói VIP đang hiệu lực cho tài xế, số dư ví ban đầu sau phí gói là 701.000 đ, cùng lịch hạn mức cho Trạm Cầu Giấy. Seed có thể chạy lại; nó không ghi đè trạng thái trụ, lịch đã có hoặc giao dịch đã seed.

## 1. Kiểm khói dữ liệu và API (5 phút)

Trong PowerShell, đặt biến môi trường trong cửa sổ hiện tại (không dùng mật khẩu sản xuất):

```powershell
$env:DEMO_PASSWORD = Read-Host 'Mật khẩu demo đã dùng khi seed'
$env:CSMS_URL = 'http://localhost:3000'
node tools/demo-smoke.js
```

Mong đợi sáu dòng `PASS` và `KẾT QUẢ: 6/6 kiểm khói đạt.`. Script kiểm tra đăng nhập chủ trạm/tài xế, lịch hạn mức, ví và phí gói, gói VIP cùng danh sách đặt chỗ qua API đang chạy.

## 2. Hạn mức theo giờ và phiên đang chạy (7 phút)

1. Đăng nhập chủ trạm, mở Trạm Cầu Giấy. Seed đặt hạn mức nền 44 kW và hai khung 22 kW: `00:00–06:00` và `17:00–21:00`, theo giờ địa phương của trạm.
2. Mở trụ ảo OCPP đang kết nối. Dùng tài xế demo bắt đầu một phiên và xác nhận phiên vẫn hoạt động.
3. Để trình bày thay đổi ngay tại ranh giới, dùng một trạm simulator khác chưa có lịch, đặt một khung ngắn bắt đầu sau vài phút và giới hạn thấp hơn hạn mức nền. Không chọn khung chồng lấn; xoá khung thử sau demo.
4. Chờ tối đa 15 giây sau ranh giới lịch. Kiểm tra log simulator và `charging_profile_log` (`station_id`, `session_id`, `limit_w`, `status`, `trigger`, `requested_at`): trạm đã gửi hồ sơ mới cho phiên đang sạc theo hạn mức hiệu lực. Phiên không bị dừng khi hạn mức giảm.
5. Nêu rõ hạn mức là phân bổ điều khiển xuống simulator; nếu trụ ngoại tuyến hoặc từ chối hồ sơ, hệ thống ghi nhận trạng thái chưa xác nhận và cảnh báo, không thể đảm bảo trụ vật lý đã áp dụng profile.

## 3. Tài xế huỷ chỗ trước hạn (4 phút)

1. Giữ trụ ảo online và đầu nối `Available`; đăng nhập tài xế.
2. Ở **Tìm trạm**, chọn đầu nối đang rảnh và đặt chỗ với thời gian đến ngắn.
3. Mở **Đặt chỗ của tôi**, chọn **Huỷ** khi đặt chỗ còn `ACCEPTED` và `expiresAt` ở tương lai.
4. Xác nhận trạng thái đặt chỗ chuyển sang huỷ, đầu nối được giải phóng sau `CancelReservation`, và sổ ví không có dòng `RESERVATION_FEE` cho đặt chỗ này.

## 4. Quá hạn không tới (10 phút hoặc theo cấu hình) — S-50

1. Đặt một chỗ khác với `arriveInMinutes=1`, sau đó không huỷ và không bắt đầu sạc.
2. Chờ tới `expiresAt`; job dọn đặt chỗ quét mỗi 10 giây. Mặc định `RESERVATION_HOLD_MIN=15`, vì vậy thời gian giữ là 16 phút; giá trị demo `1` rút ngắn tổng thời gian xuống 2 phút.
3. Mở **Đặt chỗ của tôi** và xác nhận trạng thái `EXPIRED`.
4. Mở ví: có một khoản phí `RESERVATION_FEE` đúng 20.000 đ. Job có thể thử lại lệnh OCPP nếu trụ timeout; khoản phí không bị nhân đôi khi quét lại.
5. Kiểm tra log simulator nhận `CancelReservation`. Nếu simulator đang offline, ghi nhận rằng queue còn chờ gửi và không trình bày đó là lệnh đã tới trụ.

## 5. Gói VIP và hoá đơn (8 phút) — S-65

1. Mở **Ví của tôi** bằng tài khoản tài xế. Gói seed sẵn hiển thị `VIP`, 299.000 đ / 30 ngày và 30.000 đ/kWh.
2. Có thể bấm **Mua hoặc gia hạn gói** để chứng minh trừ ví; mua nối tiếp bắt đầu khi gói hiện có hết hạn, không làm mất phần thời hạn còn lại. Mỗi thao tác mua dùng một `Idempotency-Key`.
3. Bắt đầu rồi kết thúc một phiên qua trụ ảo khi VIP đang hiệu lực. Mở hoá đơn phiên: các dòng năng lượng dùng 30.000 đ/kWh và snapshot nêu `VIP`, mã gói cùng giá áp dụng tại `session.started_at`.
4. Nêu giới hạn nghiệp vụ: gói là toàn hệ thống, không theo trạm; doanh thu bán gói chưa được phân bổ vào báo cáo doanh thu trạm.

## 6. Kết thúc

- Dừng simulator và backend theo [`docs/OPERATIONS.md`](../OPERATIONS.md).
- Không xoá database demo nếu cần dùng lại; nếu cần làm sạch, chỉ dùng lệnh reset trên môi trường demo đã xác nhận.
- Ghi riêng kết quả lỗi/timeout thực tế; không đổi thành “đạt” nếu chưa có bằng chứng.
- Các luồng nền tảng khác xem [`docs/DEMO_SPRINT2.md`](../DEMO_SPRINT2.md) và [`docs/DEMO_SPRINT3.md`](../DEMO_SPRINT3.md).
