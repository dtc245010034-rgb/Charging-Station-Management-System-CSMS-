# Kế hoạch S-15 (Authorize) và S-16 (Reset từ xa)

Trạng thái: **chưa làm tính năng**; đã chuẩn bị nền (không đổi hành vi). Nguồn AC: `docs/SPRINT_2_PLAN.md` mục S-15, S-16. Cần trưởng dev review vì có migration và phân quyền.

## 1. Đã sẵn sàng trong repo

| Phần | Vị trí | Ghi chú |
|---|---|---|
| Handler `Authorize` tách riêng | `backend/src/modules/ocpp/handlers/authorize.js` | Hành vi cũ giữ nguyên: có `idTag` thì `Accepted`, không thì `Invalid` (chấp nhận mọi thẻ, đây là giới hạn đã biết). Test ghim: `tests/unit/ocpp-authorize-commands.test.js`. |
| Gửi lệnh server → trụ | `backend/src/modules/ocpp/commands.js` (`createCommandSender`) | Trụ không có kết nối thì lỗi `OFFLINE` ngay; có kết nối thì dùng `ocppMessages.sendCall` (khớp CALLRESULT theo mã, timeout mặc định 30 s, không chặn tin khác). **Chưa nối vào `server.js`.** |
| `sendCall` có timeout | `message-handler.js` | Sẵn từ S-07. |
| Sổ kết nối | `charge-points/connection-registry.js` (`getConnection`, `isConnected`) | Sẵn từ S-08. |
| Test chờ | `tests/acceptance/S-15.authorize.test.js`, `S-16.reset.test.js` | `test.todo` theo từng AC; chuyển thành test thật khi làm. |

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

1. `reset` service: kiểm quyền, `commands.send(code, 'Reset', { type })` với `type` ∈ `Soft | Hard`, ghi `audit_logs` (ai bấm, trụ nào, loại) trước khi gửi.
2. Route `POST /api/charge-points/:id/reset` body `{ type }`. Quyền mới `charge-points:reset` = `ADMIN`, `OPERATOR` (không cho `STATION_OWNER`, theo AC "chỉ Vận hành viên và Quản trị"). Lọc phạm vi theo `db/scope.js`.
3. Lỗi: `OFFLINE` → HTTP 409 "Trụ không có kết nối"; hết thời gian → HTTP 504; `Rejected` từ trụ → HTTP 422 kèm trạng thái.
4. Giao diện: nút ở `frontend/pages/shared/charge-points.js` drawer, ẩn với vai trò không có quyền (backend vẫn kiểm).
5. Khi trụ reset nó đóng socket và Boot lại: F9 (`markChargePointSeen`) và Boot lo phần khôi phục trạng thái, không cần code thêm.

## 4. Danh sách test (đối chiếu AC)

S-15: hợp lệ → `Accepted`; thẻ khoá → `Blocked`; quá hạn → `Expired`; không có → `Invalid`; trạm tạm ngừng + thẻ hợp lệ → `Blocked`; log chỉ 4 ký tự cuối; thẻ dài hơn 20 ký tự bị từ chối; hàm `evaluateIdTag` xuất ra được. S-16: trực tuyến + mềm → `Accepted` ≤ 5 s; ngoại tuyến báo ngay; không trả lời 30 s → hết thời gian và huỷ lời gọi; chỉ OPERATOR/ADMIN gọi được; có dòng audit ai bấm; không chặn tin khác trên cùng kết nối.

## 5. Mâu thuẫn tài liệu cần PO/QA xác nhận trước khi làm

- `SPRINT_2_PLAN.md` bảng trạm bị khoá nói "giữ socket, Boot `Rejected`", nhưng code hiện tại **đóng socket mã 1008** khi khoá (có test). Chọn một; kế hoạch này theo code hiện tại.
- S-14 AC cũ ghi "cùng mã khác nội dung → trả câu đầu + cảnh báo", đã đổi có chủ ý ở F8 (xử lý như tin mới).
