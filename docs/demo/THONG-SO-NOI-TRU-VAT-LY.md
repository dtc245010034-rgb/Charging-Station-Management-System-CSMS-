# Thông số nối trụ vật lý (ESP32) vào CSMS

> Dữ liệu do `npm run seed-demo` tạo sẵn (xem [`CHECKLIST-TRUOC-DEMO.md`](CHECKLIST-TRUOC-DEMO.md)). Tài liệu này **chỉ** nêu thông số phía máy chủ; không gồm firmware.

## 1. Bảng thông số

| Thông số | Giá trị |
|---|---|
| URL WebSocket | `ws://<IP máy chủ>:<cổng>/ocpp/ESP32-DEMO-01` (cổng mặc định `3000`; thiết bị khác mạng LAN phải mở cổng này ở tường lửa) |
| Subprotocol | `ocpp1.6` (bắt buộc trong header `Sec-WebSocket-Protocol`; thiếu thì bị từ chối 400) |
| Mã trụ | `ESP32-DEMO-01` (máy chủ tự đổi chữ hoa; khớp `^[A-Z0-9_-]{1,50}$`) |
| Đầu nối đã khai báo | `1` (chỉ một; `connectorId` khác bị từ chối) |
| Thẻ RFID / `idTag` hợp lệ | `TAG-ESP32-01` (ACTIVE, không hết hạn, gắn với tài xế `driver@demo.csms.local`) |
| Trạm chứa trụ | «Trạm Demo ESP32», thuộc chủ trạm `owner@demo.csms.local`, biểu giá 3.850 đ/kWh |
| Chu kỳ Heartbeat máy chủ yêu cầu | 60 giây (trong `BootNotificationResponse.interval`) |

## 2. Trình tự thiết bị cần gửi

1. Mở WebSocket tới URL trên, kèm subprotocol `ocpp1.6`.
2. `BootNotification` (cần `chargePointVendor`, `chargePointModel`) → máy chủ trả `Accepted`, trụ chuyển `ONLINE`.
3. `StatusNotification` cho `connectorId` `1` (và `0` nếu muốn báo cấp trụ).
4. `Authorize` với `TAG-ESP32-01` → `Accepted`.
5. `StartTransaction` với `connectorId: 1`, `idTag: TAG-ESP32-01`, `meterStart` (Wh, số nguyên ≥ 0), `timestamp` ISO 8601 → máy chủ trả `transactionId`.
6. `MeterValues` định kỳ (đo `Energy.Active.Import.Register`, đơn vị Wh) và `StopTransaction` khi dừng.

## 3. Giới hạn và lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Bắt tay trả **429** | Quá `OCPP_HANDSHAKE_LIMIT_PER_10S` (mặc định 5 lần/10 giây theo cặp IP + mã trụ), thường do thiết bị nối lại liên tục | Tăng khoảng chờ nối lại ≥ 3 giây; không cần sửa máy chủ |
| Bắt tay trả **403** | Mã trụ chưa đăng ký trong DB (chưa chạy seed, hoặc gõ sai mã) | Chạy `npm run seed-demo` hoặc sửa mã |
| Bắt tay trả **400** | Thiếu subprotocol `ocpp1.6` hoặc mã trụ sai định dạng | Kiểm tra header và URL |
| `BootNotification` trả `Rejected` | Trạm đang bị quản trị khoá | Mở khoá trạm ở màn «Trạm sạc» |
| `StartTransaction` bị `CALLERROR PropertyConstraintViolation` | `connectorId` chưa khai báo (trụ này chỉ có đầu nối `1`) | Dùng `connectorId: 1` |

## 4. Kiểm tra từ phía máy chủ

- Màn «Trạng thái trụ» (`#/operator/fleet-status`): `ESP32-DEMO-01` chuyển từ `UNKNOWN` sang `ONLINE` ngay sau `BootNotification`.
- Chạy thử khi chưa có thiết bị: `node tools/demo-charge-point.js ESP32-DEMO-01` (trụ ảo tương tác, giữ kết nối và tự gửi Heartbeat).
- Dữ liệu cá nhân: không đưa tọa độ GPS thật của người dùng vào thiết bị thử; trạm demo chỉ dùng tọa độ cơ quan.
