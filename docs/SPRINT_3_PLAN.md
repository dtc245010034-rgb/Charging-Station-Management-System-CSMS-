# Kế hoạch chi tiết Sprint 3 (S-17 → S-27) — 20 SP

> Lập: **05/10/2026** (Thứ Hai). Sprint chạy **Thứ Tư 7/10 → Thứ Tư 14/10/2026** (quyết định của Scrum Master 4/10). Cam kết **đủ 11 story, 20 SP, không đặt thứ tự cắt trước** (quyết định 4/10: trễ thì xử lý trong sprint, không cắt sẵn).
> **Sprint Goal (nguyên văn file backlog):** *Một phiên sạc chạy trọn vẹn từ lúc cắm tới lúc rút với số kWh đúng, dù trụ có mất kết nối giữa chừng.*
> Nguồn: file backlog của PO (AC, NFR, task T-xx; trang Sprints/Backlog/Tasks/Rủi ro/DoD), Jira 5/10 (Sprint 3 = GYM-43…53, chưa gán người, chưa có ngày), `main` tại `a00100c` (PR #87), `docs/SPRINT_2_PLAN.md`, `docs/SPRINT_STATUS.md`, `docs/spikes/K-01-ocpp-simulator.md`. Mọi khẳng định về mã bên dưới đã đối chiếu với `main` ngày 5/10 và, khi ghi “đã chạy”, đã chạy thật trên server cục bộ.
> Tài liệu này là **đề xuất phân việc và lịch** để nhóm chỉnh và chốt ở buổi Sprint Planning; **tên người để trống đến buổi đó** (quyết định 4/10).

## 0. Điều kiện bắt đầu và thực tế về thời gian — đọc trước

**Điều kiện (phải xong trước khi bấm Start Sprint 3):**
1. **S-16 (GYM-42) còn ở Review.** Mã đã vào `main` qua PR #86; ngày 5/10 mình chạy lại trên `main`: lint sạch, **425/426 test pass** (chỉ T-19 cần Docker đỏ như mọi lần), **16/16 ca Reset trên server thật** (RBAC, ngoại tuyến 409 trong 5 ms, Soft/Hard, từ chối 422, quá hạn 504 mà Heartbeat vẫn được trả lời) và nút Reset trên trình duyệt (Vận hành thấy, Chủ trạm không thấy). Còn **một nợ nhỏ**: Reset mới ghi log ứng dụng, chưa ghi `audit_logs` — backlog (T-35) cho phép ghi tạm và giao việc chuẩn hoá cho T-57 (S-27 ở sprint này), nên **không chặn đóng Sprint 2**; xem D10.
2. Kéo S-16 sang Done → **Complete Sprint 2** (Jira chỉ cho một sprint đang chạy) → nhập ngày + mục tiêu cho Sprint 3 → Start.
3. Lịch dự án: kết thúc **26/10**. Sprint 3 kết thúc 14/10, Sprint 4 ~21/10, Sprint 5 ~28/10 → **Sprint 5 vượt hạn 2 ngày**; vì vậy sprint này không có chỗ để lãng phí.

**Thời gian thật:** 5 ngày làm việc — **T4 7/10, T5 8/10, T6 9/10, T2 12/10, T3 13/10** — cộng **sáng T4 14/10** cho review/retro/demo. Thứ Bảy–Chủ Nhật 10–11/10 nghỉ (nếu nhóm làm bù, xem đó là đệm, không đưa vào kế hoạch).

**Đường găng (giống bài học Sprint 2):** `S-17 → S-18 → S-19 → S-20 → S-21` = **10 SP nối đuôi**, S-25 và S-26 treo thêm sau S-21 (S-21 là cổng của cả hai). Làm tuần tự thuần thì 5 ngày là vừa khít, không có đệm. Cách duy nhất để vừa: **chốt bảng dữ liệu và hợp đồng handler ngay buổi sáng đầu tiên** (mục 4.0), viết các story song song trên hợp đồng đó rồi **ghép/merge theo thứ tự chuỗi** — đúng cách Sprint 2 đã làm.

**Velocity tham chiếu:** Sprint 1 = 12 SP, Sprint 2 = 20 SP (11 story, khoảng một tuần lịch; code đủ AC trên `main`, Jira còn S-16 ở Review). Sprint 3 xin lại 20 SP; 15 SP Must (S-17, S-18, S-19, S-20, S-21, S-22, S-23, S-25) + 5 SP Should (S-24, S-26, S-27) — cùng tỷ lệ 15/5 như Sprint 2.

## 1. Quyết định kỹ thuật (đã đối chiếu với mã) — chốt cùng lúc ở buổi Sprint Planning

Hợp đồng handler thực tế trên `main` **khác** bản trong `SPRINT_2_PLAN.md` (đã bỏ `ocpp-rpc`, dùng `ws` + bộ khung tự viết): handler là `createXxxHandler({ pool, … })` trả về `async (payload, { messageId, connection })`; lỗi giao thức ném `OcppCallError(code, message)`; `connection.chargePoint` = `{ id, code, station_id, station_status }`; dùng `ocppPool` (có `lock_timeout`). Sprint 3 viết theo đúng mẫu này (`handlers/authorize.js` là mẫu gần nhất).

| # | Quyết định | Vì sao (bằng chứng) |
|---|---|---|
| **D1** | **Mô hình trạng thái phiên: tách “vòng đời” khỏi “cờ xem xét”.** `status` ∈ {`CHARGING`, `COMPLETED`, `ABNORMAL`}; thêm `needs_review BOOLEAN` + `review_reason TEXT`. Chỉ mục unique có điều kiện: một đầu nối chỉ có một phiên `CHARGING`. **Khác NFR của T-36** (enum 4 giá trị gộp “cần xem xét”) — cần PO/nhóm xác nhận (Q1). | Backlog dùng “cần xem xét” cho cả phiên **đang sạc** (S-20 AC3: số đo nhỏ hơn nhưng vẫn lưu), phiên **đã kết thúc** (S-18 AC2: số đo cuối < số đo đầu) và phiên **treo** (S-21 AC5). Enum 4 giá trị làm mất trạng thái “đang sạc” hoặc “đã kết thúc” ngay khi bật cờ → StopTransaction đến sau không biết phiên còn mở hay không. |
| **D2** | **Điện năng lưu dạng số nguyên Wh** (`BIGINT`), kWh = `(meter_stop − meter_start)/1000` tính bằng `NUMERIC` ở SQL hoặc hàm thuần (T-39); **không dùng số thực**. Không làm tròn (T-39 NFR). `transactionId` là `INTEGER` tự tăng (đặc tả OCPP 1.6: số nguyên 32 bit). | Sprint 4 tính tiền; sai số thực dồn lại sẽ thành lệch tiền (R-04). |
| **D3** | **Phiên không lưu mã thẻ thô:** `id_tag_id` (FK `id_tags`, null được) + `id_tag_masked` (4 ký tự cuối, dùng khi thẻ lạ). Mọi `payload` đưa vào `orphan_messages` phải **che `idTag`** trước khi lưu. | DoD “không log/lưu định danh”; `maskIdTag` đã có ở `authorize.js`. NĐ 13: lịch sử sạc gắn với tài xế là dữ liệu cá nhân. |
| **D4** | **`StartTransaction` chống trùng hai lớp.** Lớp 1: S-14 (cùng `messageId`). Lớp 2: chỉ mục unique tự nhiên `(charge_point_id, connector_no, id_tag_id/masked, meter_start, started_at)` + `ON CONFLICT … RETURNING` trả lại `transactionId` cũ. | S-14 chỉ nhớ câu trả lời trong **600 giây** (`OCPP_DUPLICATE_REPLAY_WINDOW_SECONDS`; ngoài cửa sổ, hoặc trụ khởi động lại và đếm lại `messageId`, là tin mới). Trụ gửi lại `StartTransaction` sau khi mất mạng lâu hơn 10 phút sẽ sinh **phiên thứ hai** nếu chỉ dựa vào S-14 (K-01 §4 đã chứng minh ca này với `ocpp-rpc`). |
| **D5** | **`MeterValues`: ghi đồng bộ bằng một câu `INSERT` nhiều dòng rồi mới trả lời** (không “trả lời trước, ghi sau” như gợi ý ở T-41). Đo p95 < 200 ms với 20 trụ × 1 tin/10 s; nếu `begin/complete` của S-14 làm chậm thì cân nhắc thêm `MeterValues` vào `dedupeSkipActions` (S-20 đã làm việc ghi **idempotent**: mốc + giá trị trùng thì bỏ qua). | Trả lời `CALLRESULT` trước khi dữ liệu xuống DB nghĩa là nếu ghi lỗi/tiến trình chết thì trụ đã xoá bộ đệm còn hệ thống mất số đo → sai kWh. S-14 hiện thêm 2 truy vấn cho mỗi tin (INSERT + UPDATE). |
| **D6** | **Mốc thời gian trong tin nhắn chỉ được tin trong ±24 giờ** (cùng quy tắc F1 của `StatusNotification`); ngoài khoảng đó dùng giờ nhận và bật `needs_review`. Áp cho `StartTransaction`, `StopTransaction`, `MeterValues`. | S-20 so sánh theo mốc **trong tin nhắn**. Trụ có đồng hồ lệch (S-09 T-19 đã thử lệch 5 giờ) hoặc về năm 1970 sau khi khởi động lại sẽ khiến **mọi số đo thật về sau bị coi là “cũ” và bị bỏ** → mất dữ liệu tính tiền. |
| **D7** | **Giới hạn tốc độ tin nhắn phải cho phép “xả hàng đợi” sau khi nối lại.** Đổi bộ đếm cứng 50 tin/giây (`OCPP_RATE_LIMIT_MAX`, đóng kết nối mã 1008) thành **token bucket**: nạp 50 tin/giây, **burst 500**. Làm trong S-21 (task T-44a, ~0,25 ngày, nằm trong 3 SP). | **Đã đo** ngày 5/10: trụ gửi 400 `Heartbeat` tuần tự (chờ trả lời từng cái) đạt ~576 tin/giây và **bị đóng ở tin thứ 50** (`1008 Policy Violation: Rate limit exceeded`). Trụ thật xả bộ đệm `MeterValues` của 1 giờ ngoại tuyến (≈360 tin ở 10 giây/tin) sẽ bị đá lặp đi lặp lại → S-21 AC3 không thể đạt. Cũng lưu ý giới hạn bắt tay 5 lần/10 giây theo cặp IP+mã (`OCPP_HANDSHAKE_LIMIT_PER_10S`): trụ nối–ngắt dồn dập sẽ nhận 429. |
| **D8** | **`RemoteStartTransaction` kiểm theo `connectors.ocpp_status` ∈ {`Available`, `Preparing`}**, không kiểm cột `status`. | `status-mapping.js` ánh xạ `Preparing → OCCUPIED`; “rảnh” theo `status` sẽ **chặn đúng ca hợp lệ** của S-24 AC1 (đã cắm súng ⇒ `Preparing`). `Reserved`/`Charging`/… → 409 ở máy chủ. |
| **D9** | **Một hàm gửi lệnh dùng chung** (`sendRemoteCommand`) cho Reset, RemoteStop, RemoteStart — gom ánh xạ lỗi đang nằm trong `charge-points.service.js#reset`: `OFFLINE` → 409, trụ từ chối (`Rejected`/`CALLERROR`) → 422, hết giờ → 504. | Ba lệnh cùng ánh xạ lỗi; không sao chép ba lần. `createCommandSender` đã viết chung (S-16 NFR). |
| **D10** | **`audit_logs` đã tồn tại** (migration 001, cột `ip` thêm ở 003, hàm `audit.record`). T-57 **không tạo bảng mới** mà **siết bảng này**: thêm cột `result`, thêm trigger `BEFORE UPDATE OR DELETE … RAISE EXCEPTION` (chỉ-chèn-và-đọc), chuyển Reset (S-16) sang ghi vào đây. Vai trò DB riêng cho ứng dụng (REVOKE) là bước siết sau — chủ sở hữu bảng vẫn UPDATE được nếu chỉ REVOKE. | T-57 viết “Bảng audit_logs … tạo mới”; làm theo chữ sẽ đụng bảng có sẵn (`CREATE TABLE` lỗi hoặc tạo bảng thứ hai). Trigger là cách duy nhất làm AC “UPDATE/DELETE bị DB từ chối” đúng khi ứng dụng dùng chính tài khoản chủ bảng. |
| **D11** | **Thẻ ảo của tài xế (S-24) là chuỗi ngẫu nhiên** (ví dụ `V-` + 12 ký tự base32 từ `crypto.randomBytes`, ≤ 20 ký tự theo CiString20), **không** suy từ mã tài xế. Tạo cùng lúc tạo tài khoản (đăng ký công khai + Quản trị tạo) và **backfill** cho tài xế đã có. | Thẻ đoán được (`V000123`) + trụ không được xác thực (B5) = kẻ biết mã trụ có thể mở phiên mạo danh tài xế khác, đến Sprint 4–5 là gian lận tiền. |
| **D12** | **`StopTransaction`/`MeterValues` chỉ được chấp nhận từ đúng trụ sở hữu phiên** (`session.charge_point_id = connection.chargePoint.id`), khác thì ghi `orphan_messages` + cảnh báo. | B5 (xác thực trụ) vẫn mở: kết nối ẩn danh cùng mã đá trụ thật (S-13). Từ Sprint 3 điều đó không chỉ là mất kết nối mà còn có thể **sửa số kWh**. Kiểm tra này rẻ và test được. |
| **D13** | **Số migration đặt trước** để các PR song song không tranh nhau `017`: `017` charging_sessions · `018` meter_values · `019` orphan_messages · `020` remote_start_requests + thẻ ảo (backfill) · `021` audit_logs (siết). Mỗi file có bản `.down.sql`. | `migrate.js` chạy theo tên file; hai PR cùng `017_…` sẽ xung đột (R-09). |
| **D14** | **Đăng ký handler qua một file** `handlers/index.js` (tạo trong PR nền chung); mỗi story chỉ thêm file handler của mình + một dòng ở đó, không sửa lung tung `server.js`. | `server.js` hiện liệt kê handler thủ công; 3 handler mới (Start/Stop/MeterValues) cùng sửa một khối → xung đột merge. Móc “khôi phục” của S-21 gọi từ `status-notification.js` chỉ **một dòng** (logic nằm ở `modules/sessions/reconcile.js`). |

Cấu trúc thư mục mới:
```
backend/src/modules/sessions/
  sessions.repository.js   truy vấn (đều qua scope theo quyền)
  sessions.service.js      bắt đầu/chốt/đóng tay; tính trạng thái
  energy.js                T-39 hàm thuần: Wh → kWh, ca số đo lùi → null
  meter-rules.js           T-42 hàm thuần: 3 quy tắc S-20
  reconcile.js             S-21: khớp phiên khi trụ nối lại / StatusNotification
  abnormal-job.js          S-25/T-53: job quét (mẫu: charge-points/offline-job.js)
  sessions.routes.js, sessions.events.js (SSE cho tài xế)
backend/src/modules/ocpp/handlers/{start-transaction,stop-transaction,meter-values}.js
backend/src/modules/audit/ (siết) · frontend/pages/driver/{session,station}.js · frontend/pages/shared/sessions.js
```

## 2. Các làn làm việc (9 thành viên; Phúc điều phối; **chưa gán tên**)

| Làn | Số người | Việc | Bắt đầu |
|---|---|---|---|
| **L0 Nền dữ liệu** | 1 (cùng L1) | Migration 017–021 + `handlers/index.js` + test migration tiến/lùi (T-36 + `orphan_messages` + khung chung) | Sáng T4 7/10 |
| **L1 Phiên lõi** | 2 (đôi) | S-17 → S-18 (T-37, T-38, T-39) | Sáng T4 |
| **L2 Số đo** | 1 | S-19 → S-20 (T-40…T-43) — viết sớm trên hợp đồng, ghép sau T-37 | Sáng T4 |
| **L3 Khôi phục & job** | 1–2 | S-21 → S-25 backend (T-44a rate limit, T-44, T-45, T-53) | Chiều T5 |
| **L4 Lệnh từ xa & nhật ký** | 1–2 | S-27 (T-57 trước tiên, vì S-23/S-25 ghi vào đó) → S-23 (T-49) → T-58, T-50 | Sáng T4 |
| **L5 Ứng dụng tài xế + trang vận hành** | 2 | S-22 (T-47, T-48) → S-24 (T-51, T-52); trang “Phiên sạc” cho vận hành (T-50, T-54) | Sáng T4 (API đọc), UI từ T6 |
| **L6 Trụ ảo, CI, E2E** | 1–2 | S-26 (T-55, T-56) + kịch bản T-46 + bằng chứng 20 trụ | Sáng T4 |
| **Điều phối** | Phúc | Planning, gỡ chặn, kiểm mốc, đóng/mở sprint trên Jira, branch protection cho check mới | — |

## 3. Lịch tổng (theo nửa ngày; “cổng” = điều kiện để story sau chạy tích hợp)

| Mốc | L0/L1 | L2/L3 | L4 | L5 | L6 |
|---|---|---|---|---|---|
| **T4 7/10 sáng** | Planning 60′ (chốt D1–D14, Q1–Q7). **Migration 017–021 + `handlers/index.js` merge trước 12:00 (cổng của mọi làn)**; T-39 (hàm thuần) | L2: T-40 (cùng 018), khung `meter-values.js` trên hợp đồng | T-57: siết `audit_logs` + `ghi_nhat_ky` | T-47: API phiên hiện tại (đọc `charging_sessions`) | T-55: dịch vụ trụ ảo trong compose |
| **T4 chiều** | **T-37 `StartTransaction` (S-17)** viết + test 4 AC + gửi-hai-lần | T-41 phân tích khung `meterValue[].sampledValue[]`, T-42 hàm thuần quy tắc | T-57 merge; **chuyển Reset sang ghi `audit_logs`** | T-47 xong; khung màn hình T-48 | T-55 xong (20 trụ lên màn hình < 1 phút) |
| **T5 8/10 sáng** | **S-17 merge** (cổng của S-18, S-24); T-38 `StopTransaction` | L2: ghép T-41 sau S-17 | T-49 viết trên `sendRemoteCommand` (D9) | T-51 viết (chờ S-17) | Kịch bản T-46 khung (VCP chạy phiên 1 trụ) |
| **T5 chiều** | **S-18 merge** (T-38 + T-39) — cổng của S-19 và S-23 | **S-19 tích hợp**; L3: T-44a (D7: token bucket) + khung T-44 | T-49 tích hợp sau S-18 | T-48 UI di động (SSE `sessions.events`) | T-46 chạy với 5 trụ |
| **T6 9/10 sáng** | S-18 sửa lỗi ghép / review | **S-19 merge**; **S-20** (T-42, T-43) | T-49 merge; T-58 | T-48 xong; T-51 tích hợp | T-46: 20 trụ, thêm ngắt–nối |
| **T6 chiều** | Review chéo | **S-20 merge** (cổng của S-21); T-44 | T-50: dựng trang “Phiên sạc” + nút dừng → **S-23 merge** | **S-22 merge**; T-52 | T-56 bước CI (viết) |
| **T2 12/10 sáng** | Hỗ trợ ghép | T-44 merge; **T-45 (StopTransaction tới muộn)** | **S-27 merge** (T-57 + T-58) | **S-24 merge** (T-51 + T-52) | T-46 ba lần xanh với ngắt–nối |
| **T2 12/10 chiều** | Review | **S-21 merge** (cổng của S-25, S-26); T-53 job | Dọn nợ, hỗ trợ ghép | T-54 thẻ “Bất thường” trên trang của L4 | T-56 chạy trên PR thật |
| **T3 13/10 sáng** | Ghép hồ sơ kiểm thử `kiem-thu-S-17…27.md` | **S-25 merge**; T-46 bằng chứng 3 lần | Dọn nợ | Kiểm tay trên trình duyệt (tài xế + vận hành) | **S-26 merge**; đặt check bắt buộc (Phúc) |
| **T3 13/10 chiều** | Đóng sprint: DoD từng story, README, `SPRINT_STATUS.md`, Jira (subtask + liên kết PR) | | | | **Chạy 20 trụ ảo ngắt–nối, ghi bảng đối chiếu** |
| **T4 14/10 sáng** | Review + retro + demo (phiên sạc trọn vẹn khi ngắt mạng) | | | | |

## 4. Chi tiết từng story

Ký hiệu: **Cổng** = điều kiện để story sau ghép được. Tên file kiểm thử theo `S-xx.<chủ đề>.test.js`, mỗi story chạm OCPP **bắt buộc** có test “gửi hai lần = một lần”.

### 4.0 Nền dùng chung (L0, làm trước, không tính SP riêng — thuộc T-36)
- **017 `charging_sessions`:** `id INTEGER GENERATED … AS IDENTITY` (= `transactionId`), `charge_point_id`, `connector_id`, `connector_no`, `id_tag_id` (FK, null), `id_tag_masked`, `driver_id` (copy từ `id_tags.user_id` **tại lúc bắt đầu**), `meter_start BIGINT`, `meter_stop BIGINT NULL`, `started_at`, `stopped_at`, `stop_reason`, `status`, `needs_review`, `review_reason`, `created_at/updated_at`. Chỉ mục unique có điều kiện `(connector_id) WHERE status='CHARGING'` (D1); chỉ mục tự nhiên chống trùng của D4; chỉ mục `(driver_id, status)` cho S-22; `(status, updated_at)` cho job S-25.
- **018 `meter_values`:** `session_id`, `sampled_at`, `measurand`, `value NUMERIC`, `unit`, `raw_unit`; unique `(session_id, measurand, sampled_at)`; chỉ mục ghép `(session_id, sampled_at DESC)`.
- **019 `orphan_messages`:** `charge_point_id`, `action`, `payload JSONB` (đã che `idTag`, D3), `reason`, `received_at`. **Backlog chưa có task nào tạo bảng này** dù T-38 và T-41 ghi vào nó → thêm vào PR nền chung. Dọn theo `OCPP_ORPHAN_RETENTION_DAYS` (Q5).
- **020 `remote_start_requests`:** `connector_id`, `driver_id`, `status` (`PENDING/STARTED/REJECTED/EXPIRED`), `expires_at` (+60 s); chỉ mục unique có điều kiện một `PENDING` mỗi đầu nối (chặn bấm hai lần). Cùng migration: **backfill thẻ ảo** (D11).
- **021 `audit_logs`:** `ADD COLUMN result`, trigger chỉ-chèn (D10), chỉ mục `(created_at)`, `(entity, entity_id)`, `(user_id)`.
- Biến môi trường mới (đều có mặc định, ghi vào README + `env.test.js`): `SESSION_ABNORMAL_AFTER_SECONDS` (21600 = 6 giờ; test đặt 60), `REMOTE_STOP_WAIT_SECONDS` (120), `REMOTE_START_WAIT_SECONDS` (60), `OCPP_RATE_LIMIT_BURST` (500), `OCPP_ORPHAN_RETENTION_DAYS`.
- **Ma trận quyền mới** (`security/permissions.js`, một nguồn): `sessions:read` (ADMIN, OPERATOR, ACCOUNTANT; STATION_OWNER chỉ phiên ở trạm của mình qua `scopeByOwner`), `sessions:read-own` (DRIVER), `sessions:stop` và `sessions:close` (ADMIN, OPERATOR), `sessions:start-own` (DRIVER), `audit-logs:read` (ADMIN — Q3). Route khai bằng `access()`; route không khai thì bị chặn (S-03).

### S-17 · GYM-43 · 2 SP · Phiên sạc bắt đầu khi trụ gửi `StartTransaction` *(Must)*
- **Làn:** L1 · **Bắt đầu:** T4 chiều (sau 017) · **Xong:** T5 sáng · **Cổng:** S-18, S-24.
- **Việc:** **T-36** (xem 4.0). **T-37** `start-transaction.js`: kiểm khung (`connectorId` ≥ 1, `idTag` ≤ 20 ký tự, `meterStart` số nguyên ≥ 0, `timestamp` hợp lệ — D6); tra thẻ bằng **`evaluateIdTag` của S-15** (hàm thuần, đã xuất sẵn) + trạng thái trạm; toàn bộ trong **một giao dịch** trên `ocppPool` (`db/tx.js` hiện chỉ dùng `pool` chính → thêm tham số pool hoặc viết hàm giao dịch cho `ocppPool`); cấp `transactionId`.
- **AC phải qua (4 ca của backlog):** thẻ hợp lệ + đầu nối rảnh → phiên `CHARGING`, lưu số đo đầu và mốc, trả `transactionId` + `Accepted`; thẻ khoá/không tồn tại → vẫn trả `transactionId` nhưng `idTagInfo` là `Blocked`/`Invalid`, phiên `needs_review`; đầu nối còn phiên `CHARGING` → phiên cũ đóng `ABNORMAL` (kWh để trống), phiên mới tạo, cảnh báo; **gửi lại cùng `messageId` → cùng `transactionId`** (S-14) **và** gửi lại sau khi hết cửa sổ 600 s vẫn cùng `transactionId` (D4).
- **Ca ngoài backlog cần chốt (Q2):** `connectorId` chưa khai báo → không tạo phiên, ghi `orphan_messages`, trả `CALLERROR PropertyConstraintViolation`.
- **NFR:** `transactionId` do DB cấp, không dùng thời gian. **DoD:** log chỉ 4 ký tự cuối của thẻ; test gửi hai lần.

### S-18 · GYM-44 · 2 SP · `StopTransaction` chốt số kWh *(Must)*
- **Làn:** L1 · **Bắt đầu:** T5 sáng · **Xong:** T5 chiều · **Cổng:** S-19, S-23.
- **Việc:** **T-38** `stop-transaction.js`: tra phiên theo `transactionId` (kèm D12), cập nhật số đo cuối/mốc/lý do (`Local`, `Remote`, `EVDisconnected`, `PowerLoss`…), trạng thái `COMPLETED`; `transactionId` lạ → `CALLRESULT` đúng đặc tả + `orphan_messages` + cảnh báo; `transactionData` → lưu như `MeterValues` (dùng chung hàm ghi của T-41). **T-39** `energy.js` (hàm thuần, ba ca tính tay: thường / số đo cuối < số đo đầu → `null` / bằng nhau → 0).
- **AC:** kWh = (cuối − đầu)/1000, **không cộng dồn từng lần báo**; số đo lùi → `needs_review`, kWh trống, không ghi số âm; `StopTransaction` cho phiên đã kết thúc **không đổi gì** (gửi hai lần = một lần).
- **Rủi ro:** `StopTransaction.idTag` có thể khác thẻ lúc bắt đầu (trụ cho phép tài xế khác dừng): ghi nhận, không dùng để đổi chủ phiên.

### S-19 · GYM-45 · 2 SP · `MeterValues` ghi liên tục *(Must)*
- **Làn:** L2 · **Bắt đầu:** T4 sáng (bảng + khung), **tích hợp** T5 chiều sau S-18 · **Xong:** T6 sáng · **Cổng:** S-20, S-22.
- **Việc:** **T-40** (migration 018). **T-41** `meter-values.js`: bóc `meterValue[].sampledValue[]` (hai tầng; mẫu ở `docs/spikes/k01-session-log.json`), chỉ lưu `Energy.Active.Import.Register`, `Power.Active.Import`, `Current.Import` (từ GYM-48 có thêm `SoC`, 0–100 %); giữ **đơn vị nguyên văn** và chuẩn hoá ra Wh khi tính; một câu `INSERT` nhiều dòng (D5); tin cho đầu nối không có phiên → `orphan_messages`, không tạo phiên. `MeterValues.transactionId` là **tuỳ chọn** theo đặc tả → khớp phiên bằng `transactionId` nếu có, nếu không thì bằng phiên `CHARGING` của đầu nối.
- **AC:** giá trị + mốc lưu gắn phiên; đại lượng lạ bỏ qua không lỗi; 20 trụ × 1 tin/10 giây → trả lời **p95 < 200 ms** (đo bằng `tools/simulate-fleet.js` hoặc T-46; ghi số vào hồ sơ kiểm thử).
- **NFR:** D5, D6, D12.

### S-20 · GYM-46 · 1 SP · Số đo lùi hoặc trùng mốc bị bỏ qua *(Must)*
- **Làn:** L2 · **Xong:** T6 chiều · **Cổng:** S-21.
- **Việc:** **T-42** `meter-rules.js` — ba quy tắc thành hàm thuần, đọc số đo mới nhất **trong cùng giao dịch** (khoá hàng phiên) để hai tin đến đồng thời không cùng lọt. **T-43** test mới → cũ → trùng: bảng chỉ giữ số đo mới; **đúng một cảnh báo** cho số đo lùi, không cảnh báo cho số đo trùng.
- **AC:** mốc cũ hơn → bỏ qua + cảnh báo; mốc trùng + giá trị trùng → bỏ qua im lặng; Energy.Active.Import.Register mới hơn nhưng nhỏ hơn → **lưu** + `needs_review`. PO xác nhận Power/Current giảm là diễn biến vận hành bình thường, không bật `needs_review`.
- **Giới hạn và mẫu đến lệch thứ tự:** từ chối số âm, trị tuyệt đối trên `1e12` (Energy tính theo Wh; kWh quy đổi), hoặc số khác 0 nhỏ hơn `1e-12`; sắp xếp các mẫu trong cùng payload theo `sampledAt`. Mẫu cũ đến trong một tin riêng sau đó vẫn bị bỏ qua; hiện không có kho lưu mẫu trễ để xử lý/xả bộ đệm S-21.
- **Ca backlog bỏ ngỏ (Q7):** cùng mốc nhưng **khác giá trị** → đề xuất: giữ số đã có, cảnh báo, không ghi đè.

### S-21 · GYM-47 · 3 SP · Phiên đang dở được khôi phục đúng khi trụ nối lại *(Must — trái tim của Sprint Goal)*
- **Làn:** L3 · **Bắt đầu:** T5 chiều (T-44a rate limit trước, T-44 sau S-20) · **Xong:** T2 12/10 chiều · **Cổng:** S-25, S-26.
- **Hiện trạng cần biết:** khi trụ rớt, `markChargePointOffline` đặt đầu nối `UNKNOWN` nhưng **giữ `ocpp_status`**; mọi tin về sau (`markChargePointSeen`) khôi phục đầu nối theo `ocpp_status` đã lưu. **Không có đoạn nào đóng phiên** → đúng yêu cầu “không đóng tự động chỉ vì trụ ngoại tuyến” (T-44 NFR); Sprint 3 phải **giữ nguyên** đặc tính này và thêm test khoá nó.
- **Việc:** **T-44a** token bucket (D7) + test “400 tin tuần tự không bị đóng; xả 2000 tin/giây vẫn bị đóng”. **T-44** `reconcile.js` gọi từ `status-notification.js` bằng **một dòng**: `Charging` + phiên đang mở → giữ; `Available` + phiên đang mở → `needs_review` (**không** tự đóng, không đoán kWh); không có phiên mà trụ báo `Charging` → cảnh báo. **T-45** `StopTransaction` tới muộn (trụ đã ngoại tuyến): vẫn nhận theo `transactionId`, giờ kết thúc lấy từ **tin nhắn** (D6), `transactionData` dồn lưu qua T-41. **T-46** kịch bản 20 trụ ngắt–nối ngẫu nhiên (xem S-26).
- **AC:** 5 ca của backlog; **20/20 phiên khớp kWh, ba lần liên tiếp**; khớp theo `transactionId`, không theo thời gian.
- **T-46 / T-56 kiểm thử đội trụ:** `tools/test-s21-reconnect-fleet.js` tạo/kiểm tra trụ test qua API staging, chạy 20 phiên song song, ngắt–nối ngẫu nhiên 1–3 lần, rồi đối chiếu `meter_start`/`meter_stop`, số mẫu T-41 và kWh trong DB; in bảng từng phiên. Mặc định lặp 3 lần; `--count`, `--disconnects N|MIN-MAX`, `--runs` cho profile CI nhanh. CI chạy profile 2 trụ/1 lần ngắt/1 lượt trên CSMS + PostgreSQL ephemeral; staging profile đầy đủ cần admin staging và `STAGING_DATABASE_URL` chỉ đọc.
- **Rủi ro:** nối–ngắt dồn dập bị `429` bởi giới hạn bắt tay (5/10 giây theo IP+mã): kịch bản T-46 phải **giãn thời gian nối lại** (backoff `tools/lib/fleet-stats.js` đã có `backoffDelay`) hoặc nâng `OCPP_HANDSHAKE_LIMIT_PER_10S` trong môi trường test — không hạ giới hạn ở sản phẩm.

### S-22 · GYM-48 · 2 SP · Tài xế xem phiên đang sạc theo thời gian thực *(Must)*
- **Làn:** L5 · **Bắt đầu:** T4 sáng (API), UI từ T5 chiều · **Xong:** T6 chiều.
- **Việc:** **T-47** `GET /api/me/sessions/current` (204 nếu không có phiên) + `GET /api/sessions/:id` (**403 nếu không phải của mình**; một truy vấn kèm số đo mới nhất). Tra theo **tài xế đăng nhập** (`req.user`), không nhận mã phiên từ trình duyệt làm nguồn sự thật. **T-48** màn hình di động (`frontend/pages/driver/session.js`, ≥ 360 px) + SSE theo mẫu fleet-status (`sessions.events.js`; lọc theo tài xế **từng kết nối**, giữ comment 20 giây, đóng khi hết hạn JWT như `fleet-status-sse-token-expiry.test.js`). Số kWh đổi ≤ 2 giây.
- **AC:** 4 ca; không phiên → thông báo + lối tắt “Tìm trạm” (trang chưa có → nút dẫn tới trang tìm trạm khi có, tạm vô hiệu — ghi chú cho PO).
- **NFR / NĐ 13:** tài xế chỉ đọc phiên của chính mình; mọi lần truy cập trái quyền ghi `audit_logs` (cơ chế S-03 có sẵn).

### S-23 · GYM-49 · 2 SP · Vận hành viên dừng phiên từ xa *(Must)*
- **Làn:** L4 · **Bắt đầu:** T5 sáng (viết), **ghép** sau S-18 · **Xong:** T6 chiều (T-49 merge T6 sáng, T-50 T6 chiều).
- **Việc:** **T-49** `POST /api/sessions/:id/stop` → `sendRemoteCommand(RemoteStopTransaction {transactionId})` (D9). **Không** đóng phiên khi nhận `Accepted`; phiên chỉ đóng khi `StopTransaction` thật đến (lý do `Remote`). Mốc chờ `REMOTE_STOP_WAIT_SECONDS` = 120 giây: quá mốc mà chưa có `StopTransaction` → `needs_review` (do job T-53). Chặn bấm hai lần: đang có lệnh chờ cho phiên → 409. **T-50** nút dừng trên trang “Phiên sạc” của vận hành: đồng hồ chờ, **ba thông báo khác nhau** (từ chối / ngoại tuyến / hết giờ).
- **AC:** 4 ca của backlog. **Lưu ý:** T-50 viết “dùng lại màn hình T-48” nhưng T-48 là màn hình **tài xế** (di động); vận hành chưa có trang phiên → **L4 dựng trang `frontend/pages/shared/sessions.js`** (danh sách phiên đang sạc + nút dừng) ở T-50; **L5 thêm thẻ “Bất thường” + nút đóng tay** vào cùng trang ở T-54 (T2 12/10 chiều). Hai người thống nhất tên route/cấu trúc ngay khi T-50 bắt đầu để không đụng nhau.
- **NFR:** lệnh dừng ghi `audit_logs` qua hàm của T-57; phiên dừng bằng lệnh chốt kWh như phiên bình thường.

### S-24 · GYM-50 · 2 SP · Tài xế bắt đầu phiên từ ứng dụng bằng `RemoteStartTransaction` *(Should)*
- **Làn:** L5 · **Bắt đầu:** T5 sáng (sau S-17 + T-34 đã có) · **Xong:** T2 12/10 sáng.
- **Việc:** **T-51** `POST /api/connectors/:id/start`: kiểm D8 (`ocpp_status` ∈ {Available, Preparing}) và trạm `ACTIVE`, tạo `remote_start_requests` PENDING (60 giây, chỉ một mỗi đầu nối), gửi `RemoteStartTransaction {connectorId, idTag = thẻ ảo}`; khi `StartTransaction` tới với đúng thẻ + đầu nối → chuyển `STARTED`. Bận/đặt chỗ → 409, **không gửi lệnh**. **T-52** nút + trạng thái chờ ≤ 60 giây, ba thông báo, vô hiệu nút khi đang chờ.
- **AC:** 4 ca; không `StartTransaction` trong 60 giây → “chưa bắt đầu được”, thử lại được.
- **Phụ thuộc cần để mắt:** “đặt chỗ bởi người khác” là tính năng Sprint 7; hiện chỉ nhận ra qua trạng thái `Reserved` của trụ.

### S-25 · GYM-51 · 1 SP · Phiên không có tin kết thúc quá lâu bị đánh dấu bất thường *(Must)*
- **Làn:** L3 (job) + L5 (trang) · **Bắt đầu:** T2 12/10 chiều (sau S-21) · **Xong:** T3 13/10 sáng.
- **Việc:** **T-53** `abnormal-job.js` mỗi phút (mẫu `offline-job.js`, **so giờ ở DB**, chạy hai lần không tác dụng phụ, **không đóng phiên**, chỉ đổi `status='ABNORMAL'`): điều kiện = trụ có `last_seen_at` cũ hơn `SESSION_ABNORMAL_AFTER_SECONDS` **hoặc** phiên chờ `StopTransaction` sau lệnh dừng quá 120 giây. **T-54** trang danh sách bất thường + nút đóng tay (`POST /api/sessions/:id/close` với `reason` bắt buộc; kWh lấy theo **số đo Energy cuối cùng đã có**; ghi `audit_logs`).
- **AC:** 3 ca; phiên bất thường nhận `StopTransaction` muộn → đóng bình thường, rời danh sách. **Quyền:** xem = OPERATOR, ACCOUNTANT, ADMIN; **đóng tay = OPERATOR, ADMIN** (T-54 ghi “vận hành viên và kế toán vào được trang”, AC ghi “vận hành viên đóng tay” → kế toán chỉ xem).

### S-26 · GYM-52 · 2 SP · Bộ trụ ảo chạy trong `docker-compose` và trong CI *(Should)*
- **Làn:** L6 · **Bắt đầu:** T4 sáng (T-55 độc lập) · **Xong:** T3 13/10 sáng (T-56 chờ T-46). Jira đã có sẵn subtask T-55 (GYM-93), T-56 (GYM-94).
- **Hiện trạng:** đã có `docs/spikes/k01-simulator.js` (chạy được phiên sạc trọn vẹn) và `tools/simulate-fleet.js` (đội trụ ảo, chỉ chạy trên DB tên `_test`/`_chk`, **chưa chạy phiên sạc**). `docker-compose.yml` chưa có dịch vụ trụ ảo; CI (`.github/workflows/ci.yml`) có `lint-and-test` + `test-windows`.
- **Việc:** **T-55** dịch vụ `vcp` trong compose (biến `VCP_COUNT`, `CSMS_URL`; mã trụ tiền tố `VCP-`, seed idempotent qua API bằng tài khoản admin; không đi qua ngrok — nhớ hạn mức HTTP của gói miễn phí). **T-46** kịch bản 20 trụ ngắt–nối ngẫu nhiên (tham số `--count`, `--drops`, `--seed` để lặp lại được), in bảng đối chiếu (mã phiên, kWh mong đợi, kWh thực). **T-56** job CI `session-scenario` (`needs: lint-and-test`, DB service, 5 trụ cho nhanh), dưới 5 phút, **log nêu phiên nào sai**; Phúc đặt nó thành **required check** trong branch protection (việc cấu hình GitHub, không nằm trong mã).
- **AC:** 3 ca; cố ý phá phần khôi phục phiên thì PR bị chặn.
- **Rủi ro:** T-56 phụ thuộc S-21 → có thể trượt sang sáng T4 14/10; khi đó merge T-55 trước, T-56 ngay sau, không để S-26 chặn S-21.

### S-27 · GYM-53 · 1 SP · Mọi lệnh điều khiển từ xa ghi nhật ký kèm người thực hiện *(Should)*
- **Làn:** L4 · **Bắt đầu:** T4 sáng (T-57 làm trước vì S-23/S-25 ghi vào đây) · **Xong:** T2 12/10 sáng.
- **Việc:** **T-57** theo D10 (siết bảng sẵn có, hàm `ghi_nhat_ky(người, hành động, đối tượng, mã, dữ liệu, kết quả, ip)`; **không** ghi mã thẻ/định danh vào JSON — test quét khoá). Nối `Reset` (S-16), `RemoteStopTransaction` (T-49), đóng tay (T-54), `RemoteStart` (T-51). **T-58** `GET /api/audit-logs` (lọc trụ/người/khoảng thời gian, 50 dòng/trang, chỉ mục theo thời gian) + trang quản trị. `PUT/PATCH/DELETE /api/audit-logs/:id` → **405** kèm `Allow` (Express không tự trả 405: phải khai route tường minh; người chưa đăng nhập/không đủ quyền vẫn nhận 401/403 trước).
- **AC:** 3 ca; `UPDATE`/`DELETE` bằng SQL bởi tài khoản ứng dụng bị DB từ chối (trigger).
- **Quyền (Q3):** AC nói “quản trị viên”, T-58 nói “quản trị và vận hành viên”; đề xuất **chỉ ADMIN** ở sprint này (nguyên tắc ít quyền nhất), thêm OPERATOR nếu PO muốn.

## 5. Mốc kiểm tra (báo sớm — **không** có thứ tự cắt, theo quyết định 4/10)

| Mốc | Điều kiện đạt | Nếu chưa đạt |
|---|---|---|
| **T4 7/10 12:00** | Migration 017–021 + `handlers/index.js` đã merge; planning xong, Jira có người làm | Báo Phúc ngay: mọi làn bị chặn bởi bảng dữ liệu |
| **T5 8/10 12:00** | **S-17 merge** | Chuỗi trễ nửa ngày → báo PO sớm, xem lại ghép song song |
| **T5 8/10 hết ngày** | **S-18 merge**; T-44a (token bucket) đã vào `main` | Không có T-44a thì S-21 AC3 không kiểm được — ưu tiên ngang S-18 |
| **T6 9/10 hết ngày** | **S-20 merge** (cổng của S-21) | S-21/S-25/S-26 dồn sang T2–T3: báo PO |
| **T2 12/10 12:00** | S-23, S-24, S-27 merge; T-46 chạy 20 trụ có ngắt–nối | — |
| **T2 12/10 hết ngày** | **S-21 merge** + T-46 3 lần xanh | S-25/S-26 sang T3 13/10 chiều; **hạn cuối T4 14/10 sáng** |
| **T3 13/10 17:00** | Mọi story có DoD đủ; bằng chứng 20 trụ; hồ sơ kiểm thử | Chỉ demo các story đủ DoD |

## 6. Câu hỏi cần trả lời ở Sprint Planning (chặn việc nếu thiếu đáp án)

- **Q1 — Mô hình trạng thái phiên (D1).** Tách `status` {CHARGING, COMPLETED, ABNORMAL} và `needs_review` thay vì enum 4 giá trị của T-36? *Đề xuất: tách.* Cần chốt trước 12:00 T4 vì nằm trong migration 017 (sửa sau là migration mới + dữ liệu cũ).
- **Q2 — `StartTransaction` cho đầu nối chưa khai báo.** *Đề xuất:* không tạo phiên, ghi `orphan_messages`, `CALLERROR PropertyConstraintViolation` (giống tinh thần T-22 của S-10). Backlog bỏ ngỏ.
- **Q3 — Ai đọc nhật ký (`audit-logs:read`).** AC: quản trị viên; T-58: quản trị + vận hành viên. *Đề xuất:* chỉ ADMIN.
- **Q4 — Giới hạn tốc độ tin nhắn (D7).** *Đề xuất:* token bucket, nạp 50/giây, burst 500, làm trong S-21. Cần đồng ý vì chạm hành vi bảo vệ của B3.
- **Q5 — Lưu giữ dữ liệu (NĐ 13).** Bao lâu giữ `charging_sessions` gắn tài xế, `meter_values`, `orphan_messages`? Backlog chỉ có S-57 (Sprint 8, xác nhận phạm vi lịch sử sạc). *Đề xuất tạm:* `orphan_messages` 30 ngày (có job dọn), phiên và số đo giữ đến khi PO chốt chính sách; không thêm cột vị trí vào phiên.
- **Q6 — Staging cho DoD “AC pass trên staging với trụ ảo chạy thật”.** Cả Sprint 2 lẫn Sprint 3 chưa có URL staging (`SPRINT_STATUS.md` §7: “Chưa đạt”). *Đề xuất:* chấp nhận **bằng chứng chạy `docker compose` + trụ ảo (S-26) trên máy dự án** thay cho staging cho tới khi có URL, **ghi rõ trong hồ sơ** và để PO xác nhận; Phúc quyết định có bật staging trong sprint này không.
- **Q7 — S-20: cùng mốc, khác giá trị.** *Đề xuất:* giữ số cũ + cảnh báo. Backlog chưa nói.
- **B5 (xác thực trụ) vẫn do PO quyết định.** Sprint 3 chỉ giảm nhẹ bằng D12; **phải chốt trước Sprint 4** vì từ đó dữ liệu số đo quyết định tiền.

## 7. Rủi ro và cách phòng

| Rủi ro | Hậu quả | Phòng |
|---|---|---|
| Phiên nhân đôi do trụ gửi lại `StartTransaction` sau cửa sổ chống trùng 600 s | Hai phiên cho một lần sạc → tiền gấp đôi | D4: chỉ mục tự nhiên + `ON CONFLICT`; test gửi lại sau khi giả lập hết cửa sổ |
| Trụ xả hàng đợi bị đóng kết nối 1008 lặp lại | Mất số đo, phiên treo, kWh sai | D7 (đã đo: 49/400 tin qua trước khi bị đóng) |
| Đồng hồ trụ lệch làm số đo thật bị coi là “cũ” | Mất dữ liệu tính tiền | D6 (±24 giờ) + `needs_review` |
| Trả lời trụ trước khi ghi `MeterValues` | Trụ xoá bộ đệm, hệ thống không có số đo | D5 (ghi đồng bộ, một câu INSERT) |
| Kết nối ẩn danh cùng mã (B5) gửi `StopTransaction`/`MeterValues` giả | Sửa kWh | D12 + chờ quyết định B5 |
| Thẻ ảo đoán được | Mạo danh tài xế | D11 |
| Hai PR cùng sửa `server.js`, `status-notification.js`, cùng số migration | Xung đột merge, chờ review nuốt capacity (R-09) | D13, D14, một dòng móc cho S-21 |
| Chuỗi S-17→S-21 trượt nửa ngày | S-25/S-26 sang T4 14/10 | Mốc mục 5; viết song song trên hợp đồng; T-55 và T-57 độc lập chuỗi |
| Sai số thực khi tính kWh | Lệch tiền ở Sprint 4 | D2 (Wh nguyên, không làm tròn ở bước này) |
| Phiên là dữ liệu cá nhân (NĐ 13) | Rủi ro pháp lý | D3, `sessions:read-own`, lọc theo chủ trạm, ghi `audit_logs` khi truy cập trái quyền; **Q5 cần đáp án của PO** |

## 8. Kiểm tra Definition of Done cuối sprint (mỗi story)

- [ ] Code review bởi người khác · [ ] unit + acceptance theo AC · [ ] test **gửi hai lần = một lần** (S-17, S-18, S-19, S-20, S-21, S-23, S-24)
- [ ] CI xanh (lint, test, quét phụ thuộc) **và kịch bản trụ ảo** (từ Sprint 3 theo DoD của PO — bước này chính là S-26/T-56)
- [ ] **AC pass với trụ ảo chạy thật** (staging hoặc docker compose, theo Q6) · [ ] story có job nền: chạy job hai lần không tác dụng phụ (S-25)
- [ ] Không log/lưu mã thẻ đầy đủ hay định danh (kể cả trong `orphan_messages` và JSON của `audit_logs`) · [ ] README cập nhật (biến môi trường mới, giới hạn một tiến trình của SSE)
- [ ] Migration có bản lùi, kiểm tiến → lùi → tiến trên DB rỗng và DB seed-demo · [ ] hồ sơ `docs/testing/stories/S/kiem-thu-S-xx.md`
- [ ] Jira: tạo subtask T-xx cho các story chưa có (mới S-26 có), đóng subtask, story sang Done kèm liên kết PR · [ ] tên nhánh/commit theo `CONTRIBUTING.md` (`<tên>/GYM-43-…`; commit `feat(ocpp): … [GYM-43]`)
