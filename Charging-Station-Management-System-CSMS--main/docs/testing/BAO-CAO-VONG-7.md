# Báo cáo kiểm chứng vòng 7 (04/10/2026)

Môi trường: laptop dev, Node 22 (container), PostgreSQL 16 (container, cổng 5433), DB thử `csms_test` và `csms_chk`. Không chạm staging/production. Không có migration mới.

## Kết quả tổng

| Kiểm tra | Kết quả |
|---|---|
| `npm run lint` | Sạch |
| `npm test` 3 lần liên tiếp | 402 test: 387 pass, 0 fail, 14 todo (S-15/S-16), 1 bỏ qua (S-09 T-19 cần Docker) cả 3 lần |
| `python3 test.py` | ĐẠT: 387 pass, 0 fail, 181 giây |
| `python3 -m unittest discover -s tools` | 20 test OK |
| `tools/simulate-fleet.js`, 50 trụ ảo, DB `_chk` | 11 PASS, 0 FAIL: [`simulate-fleet-20261003-181308.md`](simulate-fleet-20261003-181308.md) |

Ghi chú: tên tệp mô phỏng mang ngày UTC 03/10 (lúc chạy là đêm 03/10 giờ UTC).

## Hạng mục

| Mã | Nội dung | Bằng chứng |
|---|---|---|
| F8/F11 | Chỉ phát lại khi cùng `messageId`, hành động, nội dung, trong cửa sổ 600 giây; Heartbeat không lưu chống trùng | `ocpp-duplicate-message-replay-window.test.js`, `ocpp-f8-restart-server.test.js`; kịch bản `restart` của simulate-fleet: 5/5 trụ ghi `Faulted` |
| F9 | Heartbeat đưa trụ về `ONLINE` và khôi phục đầu nối | `ocpp-heartbeat-recovery*.test.js`; kịch bản `netcut` của simulate-fleet |
| F10 | `lock_timeout` 5 giây cho handler OCPP | `ocpp-lock-timeout*.test.js` (test server thật FAIL trên code cũ: treo khi khoá hàng) |
| F12 | Nhãn "Trực tuyến – tạm ngừng" ở hai trang | `frontend.test.js` (nhóm F12) |

## Lỗi hồi quy phát hiện và sửa trong vòng này

Lượt chạy đầy đủ đầu tiên có 4 test fail (đều đặn 3/3 lần), do chính các thay đổi của nhánh:
1. Job S-12: tôi đã tham số hoá SQL nên test `charge-point-offline-job` (không sửa test) không khớp literal; khôi phục literal bằng hằng số nội suy.
2. Tắt máy: `db.query is not a function` do truyền pool bọc thiếu `query`; đã thêm `query`.
3. SSE T-25: `markChargePointSeen` phát thêm sự kiện lúc Boot; thêm tuỳ chọn `notify` để tin trước Boot không phát trùng.
4. Bản sửa số 3 đầu tiên (tắt khôi phục khi chưa Boot) làm hỏng F9 khi nối lại: simulate-fleet báo 1 FAIL; đã đổi sang chỉ tắt phát sự kiện, khôi phục vẫn chạy. Sau đó 11/11 PASS và 3 lượt `npm test` 0 fail.

## Chưa kiểm chứng

- Chạy 50 trụ ảo qua ngrok/máy chủ nhóm: chưa làm (không có hạ tầng ở máy này).
- Chụp màn hình giao diện (1280 px và 390 px) bằng trình duyệt: chưa làm.
- CI (GitHub Actions) và mở PR: chưa làm, xem báo cáo cuối.
