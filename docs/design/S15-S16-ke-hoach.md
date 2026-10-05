# Kế hoạch S-15 (Authorize) và S-16 (Reset từ xa)

Trạng thái: **S-16 backend Reset từ xa đã triển khai**; giao diện Reset và S-15 còn lại chưa làm. Nguồn AC: `docs/SPRINT_2_PLAN.md` mục S-15, S-16.

## 1. Đã sẵn sàng trong repo

| Phần | Vị trí | Ghi chú |
|---|---|---|
| Handler `Authorize` tách riêng | `backend/src/modules/ocpp/handlers/authorize.js` | Hành vi cũ giữ nguyên: có `idTag` thì `Accepted`, không thì `Invalid` (chấp nhận mọi thẻ, đây là giới hạn đã biết). Test ghim: `tests/unit/ocpp-authorize-commands.test.js`. |
| Gửi lệnh server → trụ | `backend/src/modules/ocpp/commands.js` (`createCommandSender`) | Đã nối vào `server.js` và endpoint Reset. Trụ offline báo lỗi ngay; CALLRESULT/CALLERROR ghép theo messageId; timeout cấu hình bằng `OCPP_COMMAND_TIMEOUT_SECONDS` (mặc định 30 giây); không chặn tin khác. |
| `sendCall` có timeout | `message-handler.js` | Sẵn từ S-07. |
| Sổ kết nối | `charge-points/connection-registry.js` (`getConnection`, `isConnected`) | Sẵn từ S-08. |
| Kiểm thử tính năng | `tests/acceptance/S-15.authorize.test.js`, `S-16.reset.test.js` | Các ca acceptance của Reset backend đã được viết; cần chạy với PostgreSQL test và Docker/server. |

## 2. S-15: xác thực thẻ

**Migration 016** `016_id_tags.sql` (+ `.down.sql`, không sửa migration cũ):
```sql
CREATE TABLE id_tags (
  id BIGSERIAL PRIMARY KEY,
  tag VARCHAR(20) NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX id_tags_tag_key ON id_tags (tag);
```
OCPP 1.6 giới hạn `idTag` 20 ký tự (CiString20Type): handler từ chối (`FormationViolation`) nếu dài hơn.

**Hàm thuần xuất ra được** (S-17 dùng lại): `evaluateIdTag({ tag, station, now })` → `Accepted | Blocked | Expired | Invalid`. Quy tắc theo bảng quyết định trong `SPRINT_2_PLAN.md` mục 3:
- không có thẻ → `Invalid` (ghi nhật ký lần thử, log chỉ 4 ký tự cuối);
- thẻ `BLOCKED` → `Blocked`; quá `expires_at` → `Expired`;
- trạm `INACTIVE`/`MAINTENANCE`/bị khoá: mọi thẻ → `Blocked` (kể cả thẻ hợp lệ);
- còn lại → `Accepted`.

**Nối dây:** `createAuthorizeHandler({ pool })` tra `id_tags` bằng `pool` (dùng `ocppPool`, đã có `lock_timeout`), lấy trạm qua `connection.chargePoint.station_id`. Thay dòng `Authorize: createAuthorizeHandler()` trong `server.js`.

**Phân quyền:** chưa có API quản lý thẻ; nếu thêm (Sprint 3) thì khoá quyền mới `id-tags:write` trong `security/permissions.js` (ADMIN, STATION_OWNER của chính trạm) và có test ma trận RBAC. Seed demo: mỗi tài xế một thẻ (`backend/scripts/seed-demo.js`).

**Chú ý chống trùng:** `Authorize` đang qua `messages.repository` (lưu 600 s mặc định, F8). Thẻ bị khoá giữa chừng: tin gửi lại y hệt trong cửa sổ nhận câu cũ. Chấp nhận được; nêu rõ trong mô tả PR.

## 3. S-16: Reset từ xa

1. **Đã làm:** reset service kiểm quyền/phạm vi, ghi nhật ký thao tác vào log ứng dụng (chờ chuẩn hoá ở T-57), rồi gọi `commands.send(code, 'Reset', { type })` (`type` ∈ `Soft | Hard`).
2. **Đã làm:** `POST /api/charge-points/:id/reset`, quyền `charge-points:reset` = `ADMIN`, `OPERATOR`; lọc phạm vi trụ theo actor.
3. **Đã làm:** `OFFLINE` → HTTP 409 ngay, không gửi CALL; hết thời gian → HTTP 504; `CALLERROR` hoặc trạng thái `Rejected` từ trụ → HTTP 422.
4. **Còn lại:** giao diện nút Reset ở `frontend/pages/shared/charge-points.js` drawer, ẩn với vai trò không có quyền (backend vẫn kiểm).
5. Khi trụ reset nó đóng socket và Boot lại: F9 (`markChargePointSeen`) và Boot lo phần khôi phục trạng thái, không cần code thêm.

## 4. Danh sách test (đối chiếu AC)

S-15: hợp lệ → `Accepted`; thẻ khoá → `Blocked`; quá hạn → `Expired`; không có → `Invalid`; trạm tạm ngừng + thẻ hợp lệ → `Blocked`; log chỉ 4 ký tự cuối; thẻ dài hơn 20 ký tự bị từ chối; hàm `evaluateIdTag` xuất ra được. S-16: trực tuyến + mềm → `Accepted` ≤ 5 s; ngoại tuyến báo ngay; không trả lời 30 s → hết thời gian và huỷ lời gọi; chỉ OPERATOR/ADMIN gọi được; có dòng audit ai bấm; không chặn tin khác trên cùng kết nối.

## 5. Mâu thuẫn tài liệu cần PO/QA xác nhận trước khi làm

- `SPRINT_2_PLAN.md` bảng trạm bị khoá nói "giữ socket, Boot `Rejected`", nhưng code hiện tại **đóng socket mã 1008** khi khoá (có test). Chọn một; kế hoạch này theo code hiện tại.
- S-14 AC cũ ghi "cùng mã khác nội dung → trả câu đầu + cảnh báo", đã đổi có chủ ý ở F8 (xử lý như tin mới).
