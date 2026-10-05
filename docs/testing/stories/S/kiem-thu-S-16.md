# Kiểm thử S-16 – Khởi động lại trụ từ xa bằng Reset (T-34, T-35)

## Thông tin lần chạy
- **Ngày kiểm thử:** 05/10/2026, khoảng 13:45 (UTC+7).
- **Môi trường:** Windows 11, Docker Compose v2, Node 22 trong container, PostgreSQL 16 Alpine (`db_test`), nhánh `main` cục bộ tại commit `6e74180` (S-16, **chưa push lên GitHub** lúc kiểm thử).
- **Lệnh:** `python test.py` (lint + toàn bộ unit, integration, acceptance), chạy **một lần**.
- **Kết quả chung:** `KẾT QUẢ: ĐẠT (425 test pass, 0 fail) — 205 giây`. Trước S-16 (sau S-15, 04/10) là 415 pass; tăng 10 ca, đúng bằng số ca S-16 thêm vào (bảng dưới).
- **Phạm vi:**
  - Story **S-16** "Khởi động lại trụ từ xa bằng `Reset`" (GYM-42, 1 SP, Should).
  - **T-34**: gửi `CALL` từ máy chủ xuống trụ (`createCommandSender` + `sendCall`), mã tin nhắn UUID, chờ `CALLRESULT`, thời gian chờ cấu hình `OCPP_COMMAND_TIMEOUT_SECONDS` (mặc định 30 giây), không chặn tin khác trên cùng kết nối, trụ ngoại tuyến báo lỗi ngay.
  - **T-35**: `POST /api/charge-points/:id/reset` (`{ type: 'Soft' | 'Hard' }`), quyền `charge-points:reset` = `ADMIN`, `OPERATOR`; nút "Khởi động lại" trên thẻ trụ ở màn hình trạng thái trụ (`frontend/pages/shared/fleet-status.js`), hộp thoại chọn Soft/Hard, ẩn với vai trò không có quyền.
- **Mã nguồn liên quan:** `backend/src/modules/ocpp/commands.js`, `backend/src/server.js`, `backend/src/app.js`, `backend/src/modules/charge-points/charge-points.{routes,service,schema}.js`, `backend/src/lib/errors.js`, `backend/src/config/env.js`, `backend/src/security/permissions.js`, `frontend/app/permissions.js`, `frontend/services/csms.js`, `frontend/pages/shared/fleet-status.js`.

---

## Tổng kết kết quả kiểm thử

| Nhóm | File | Số ca thêm cho S-16 | PASS | FAIL |
|---|---|:---:|:---:|:---:|
| Unit – cấu hình | `tests/unit/env.test.js` | 1 (và 1 assert mặc định 30 giây trong ca có sẵn) | 1 | 0 |
| Unit – bộ gửi lệnh | `tests/unit/ocpp-authorize-commands.test.js` | 1 (socket đã đóng → `OFFLINE`, không gửi CALL) | 1 | 0 |
| Integration – khung OCPP | `tests/integration/ocpp-message-handler.test.js` | 2 (ghép `CALLRESULT` của Reset; Heartbeat vẫn được trả lời khi Reset đang chờ) | 2 | 0 |
| Acceptance – server thật | `tests/acceptance/S-16.reset.test.js` | 6 | 6 | 0 |
| **Cộng** | | **10** | **10** | **0** |

---

## Đối chiếu tiêu chí chấp nhận (`docs/SPRINT_2_PLAN.md` mục S-16)

| Tiêu chí | Kết quả | Bằng chứng / ghi chú |
|---|---|---|
| Trực tuyến + Soft → `Accepted` trong 5 giây | **Đạt** | TC-02: HTTP 200 `{ status: 'Accepted' }`, khung gửi xuống trụ là `[2, <uuid>, 'Reset', { type: 'Soft' }]`. Test không đo riêng mốc 5 giây; cả suite S-16 chạy hết khoảng 3 giây, trong đó TC-05 chiếm khoảng 1 giây. |
| Ngoại tuyến → báo ngay | **Đạt** | TC-06: HTTP 409 `CONFLICT` dưới 300 ms, không có `CALL` nào được gửi. |
| Không trả lời → hết thời gian, huỷ lời gọi | **Đạt** | TC-05 (đặt thời gian chờ 1 giây): HTTP 504 `OCPP_CALL_TIMEOUT` sau khoảng 1 giây. |
| Không chặn tin khác trên cùng kết nối | **Đạt** | TC-05 và test integration: trong lúc Reset đang chờ, `Heartbeat` vẫn nhận `CALLRESULT` ngay. |
| Chỉ Vận hành viên và Quản trị gọi được; backend kiểm quyền | **Đạt** | TC-01: `STATION_OWNER`, `DRIVER` nhận 403 `FORBIDDEN`, không có `CALL` nào được gửi. Ma trận quyền frontend/backend khớp nhau (`frontend-permissions.test.js`). |
| NFR: ghi vết ai bấm (nền cho S-27) | **Đạt một phần** | Chỉ ghi **log ứng dụng**: `[OCPP] Remote Reset requested \| actorId \| chargePoint \| type` (TC-02 kiểm dòng log). **Chưa ghi vào bảng `audit_logs`**, dù bảng và `modules/audit/audit.repository.js` đã có từ S-01/S-03 và kế hoạch `docs/design/S15-S16-ke-hoach.md` ghi là ghi `audit_logs`. Log mất khi xoay vòng, không truy vấn được để làm S-27. |
| NFR: cơ chế chờ viết chung cho S-23/S-24 | **Đạt** | `createCommandSender(...).send(code, action, payload)` không gắn riêng với Reset. |
| Nút trên màn hình trụ, chọn mềm/cứng, chỉ OPERATOR/ADMIN thấy | **Đạt theo code, chưa kiểm trên trình duyệt** | Nút nằm ở màn hình "Trạng thái trụ" (`fleet-status.js`), không phải drawer `charge-points.js` như kế hoạch. Không có test giao diện tự động cho nút này. |

---

## Chi tiết ca acceptance (`S-16.reset.test.js`)

| Ca | Kịch bản | Kết quả |
|---|---|---|
| TC-01 | `STATION_OWNER`, `DRIVER` gọi Reset → 403, không gửi `CALL` | PASS |
| TC-02 | `OPERATOR`, `ADMIN` gửi Soft → 200 `Accepted`, mã tin nhắn dạng UUID, có dòng log ai bấm | PASS |
| TC-03 | Trụ ảo trả `Accepted` rồi đóng socket → trụ về `UNKNOWN` → Boot lại → `ONLINE` | PASS |
| TC-04 | Trụ trả `{ status: 'Rejected' }` → HTTP 422 `CHARGE_POINT_REJECTED` | PASS (4,8 ms) |
| TC-05 | Trụ không trả lời → 504 sau khoảng 1 giây; Heartbeat trong lúc chờ vẫn được trả lời | PASS (1005,3 ms) |
| TC-06 | Trụ đã ngắt kết nối → 409 ngay, không gửi `CALL` | PASS (10,8 ms) |

Thời gian chỉ ghi cho các ca đọc được trong log lần chạy này; TC-01 → TC-03 không lưu lại thời gian.

---

## Điểm chưa đạt / cần xử lý trước khi coi là Done

1. **Ghi vết vào `audit_logs`** (NFR, nền cho S-27): thêm `audit.record(actor.id, 'charge_point.reset', 'charge_point', point.id, { type, result })` trong `charge-points.service.js` và một assert truy vấn bảng trong TC-02. Không cần migration mới.
2. **Quy ước commit:** commit `6e74180` ("Add remote charge point reset controls") không theo mẫu `<type>(<scope>): <mô tả> [GYM-42]` của `CONTRIBUTING.md` và nằm thẳng trên `main` cục bộ, chưa qua PR/review (DoD: "review bởi người khác").
3. **Nhận diện hết thời gian bằng chuỗi:** `charge-points.service.js` so `error.message` với `/^OCPP call timed out:/`. Đổi câu báo lỗi trong `message-handler.js` sẽ làm 504 thành 500 mà không báo. Nên dùng lớp lỗi hoặc mã lỗi riêng (nợ kỹ thuật nhỏ, chưa phải lỗi).
4. **Chưa kiểm:** nút Reset trên trình duyệt; Hard reset qua API (chỉ có ở test integration); staging với trụ ảo (DoD chung của dự án).

## Kết luận
Các AC chức năng của S-16 đạt trên máy cục bộ (10/10 ca mới, toàn bộ 425/425 test pass). **Chưa nên đánh Done** khi chưa ghi vết vào `audit_logs` (mục 1) và chưa đưa commit lên qua PR có review (mục 2).
