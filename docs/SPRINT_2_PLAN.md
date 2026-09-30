# Kế hoạch chi tiết Sprint 2 (S-06 → S-16) — 20 SP

> Lập: **29/9/2026** (Thứ Ba). Quyết định đã chốt: **trưởng nhóm kỹ thuật dùng `ocpp-rpc`**; **PO chọn phương án A (cam kết đủ 20 SP)**.
> Nguồn: file backlog của PO (AC, NFR, task T-xx), Jira 28/9 (Sprint 2 = GYM-32…42, tất cả To Do, chưa gán người), `docs/spikes/K-01-ocpp-simulator.md` và mã `docs/spikes/k01/`.
> Tài liệu này là **đề xuất phân việc và lịch** để nhóm chỉnh và chốt ở buổi họp; tên người chưa gán vì tôi chưa biết thế mạnh từng thành viên.

## 0. Thực tế về thời gian — đọc trước

- Sprint chạy **28/9 → 2/10** (Jira ghi kết thúc 5/10 = ngày sprint sau bắt đầu). **Thứ Hai 28/9 đã qua mà chưa làm gì**, nên còn **4 ngày làm việc: Thứ Ba 29/9, Thứ Tư 30/9, Thứ Năm 1/10, Thứ Sáu 2/10**, cộng buổi sáng Thứ Hai 5/10 để họp review/retro và làm bù.
- **Thứ Tư 30/9 có demo Sprint 1** → Scrum Master (Phúc) gần như không code được ngày này; các bạn còn lại vẫn làm bình thường.
- Chuỗi bắt buộc tuần tự **S-06 → S-07 → S-08 → S-09 → S-10 → S-11 = 12 SP** (S-12 rẽ từ S-09, S-13 từ S-06, S-14/S-15 từ S-08, S-16 từ S-11). Làm tuần tự thuần thì 12 SP trong 4 ngày đã sát; cam kết 20 SP **chỉ khả thi nếu song song hoá nhiều làn** (mục 2) và chốt “giao diện của mỗi handler” ngay sáng nay.
- Phương án A không còn đệm. Vì vậy mục 5 có **các mốc kiểm tra và thứ tự cắt** (S-16 → S-15 → S-14) để PO biết trước.

## 1. Quy ước kỹ thuật chốt cùng lúc (họp 30 phút sáng 29/9)

1. **Một module OCPP mới** thay hoàn toàn `backend/src/server.js` (không vá):
   ```
   backend/src/modules/ocpp/
     ocpp.server.js        RPCServer(ocpp-rpc, strictMode, protocols ['ocpp1.6']) + auth (S-06) + đăng ký handler
     connection-registry.js  mã trụ → kết nối đang mở (giữ socket; thay thế nguyên tử) (S-13)
     handlers/<Action>.js  mỗi handler MỘT FILE: export async function handle({ chargePoint, params, ctx }) (mẫu T-16)
     messages.repository.js  bảng ocpp_messages (S-14)
     call.js               gửi CALL từ máy chủ xuống trụ, chờ CALLRESULT có timeout (S-16, dùng lại S-23/S-24)
   ```
   `server.js` chỉ còn `http.createServer(app)` + `ocppServer.handleUpgrade`. Mỗi người sửa file của mình → giảm xung đột merge (R-09).
2. **Hợp đồng handler** (chốt sáng nay, cả nhóm cùng viết theo): `handle({ chargePoint, params, ctx })` trả về **đối tượng CALLRESULT** hoặc ném `createRPCError(...)`. `chargePoint` = `{ id, code, stationId, stationStatus, heartbeatInterval }` (nạp một lần lúc bắt tay). `ctx` = `{ db, now, log, config }`. Handler **phải idempotent** (upsert, không cộng dồn) — DoD: “xử lý hai lần = một lần”.
3. **Trạng thái kết nối theo kết nối, không toàn cục:** `booted` (đã được `Accepted`) lưu trên đối tượng kết nối; tin đầu tiên khác `BootNotification` khi chưa `booted` → `SecurityError` (S-08 AC4). Đặt ở lớp trung gian (`client.handle(({method}) => …)` hoặc hook trước handler), không lặp trong từng handler.
4. **Cập nhật `last_seen_at` ở tầng khung** (sự kiện `message` của kết nối), không riêng `Heartbeat` (S-09 AC2). Chỉ một câu `UPDATE` một cột, giờ = `now()` của DB.
5. **Mỗi PR ≤ 1 story** (mẫu tên nhánh theo `CONTRIBUTING.md`, ví dụ `<tên>/GYM-32-ws-tra-ma-tru`); test acceptance theo AC (`backend/tests/acceptance/S-06.*.test.js`…) và **một test “gửi hai lần”** cho mỗi handler chạm OCPP.
6. **Trụ ảo test:** dùng `docs/spikes/k01/virtual-charge-point.js` làm nền (đưa vào `backend/tests/helpers/` cho test và vào `docker-compose` cho S-26 sau này). Mã trụ ảo dùng tiền tố `DEMO-`/`VCP-`, tách khỏi dữ liệu thật.

## 2. Các làn làm việc (cần khoảng 7–8 người; Phúc là điều phối + demo)

| Làn | Người | Việc | Bắt đầu |
|---|---|---|---|
| **L1 Lõi WebSocket** | 2 (đôi) | S-06 → S-13 → S-07 (dựng `ocpp.server.js`, registry, tích hợp `ocpp-rpc`) | Sáng T3 |
| **L2 Dữ liệu** | 1 | Toàn bộ migration của sprint (mục 4.0), seed thẻ demo, chỉ mục | Sáng T3 |
| **L3 Handler khởi động** | 1–2 | S-08 → S-09 → S-12 | Chiều T3 (viết trên hợp đồng handler, ghép khi S-07 xong) |
| **L4 Thẻ & chống trùng** | 1 | S-15 (T-32 ngay từ T3) → S-14 | Sáng T3 |
| **L5 Trạng thái đầu nối** | 1 | S-10 (bắt đầu viết ánh xạ trạng thái + bảng lỗi sớm, chạy tích hợp sau S-09) | Chiều T4 |
| **L6 Giao diện & thời gian thực** | 1–2 | S-11: T-23 (truy vấn cây), T-25 (SSE + client), nút Reset (T-35) | Sáng T3 |
| **L7 Trụ ảo, staging, E2E** | 1–2 | Bật staging (Q4: homelab hoặc Render) + seed demo, trụ ảo trong test/compose, kịch bản E2E (T-19, T-27), S-16 phần T-34 | Sáng T3 |
| **Điều phối** | Phúc | Họp sáng, gỡ chặn, review sprint, demo Sprint 1 (T4) | — |

Một người có thể đảm nhiều làn nếu nhóm ít hơn; đổi lại thứ tự cắt ở mục 5 đến sớm hơn.

## 3. Lịch tổng (theo nửa ngày)

| Mốc | L1 | L3/L4 | L5/L6 | L7 |
|---|---|---|---|---|
| **T3 29/9 sáng** | S-06 T-12: endpoint `/ocpp/<mã>`, tra bảng, kiểm subprotocol | L4: S-15 T-32 bảng thẻ; L3: viết handler `Boot` trên hợp đồng | L6: T-23 truy vấn cây; chốt hợp đồng SSE | L7: bật Render, seed demo; đưa trụ ảo vào test; L2: migration |
| **T3 29/9 chiều** | S-06 T-13 (từ chối mã lạ, log) → **S-06 xong** → bắt đầu S-13 T-28 | L3: hoàn thiện `Boot` (T-16/T-17) | L6: T-25 phần máy chủ (bộ phát sự kiện + endpoint SSE) | L7: kịch bản trụ ảo E2E khung |
| **T4 30/9 sáng** | S-13 T-29 → **S-13 xong**; S-07: nối `ocpp-rpc` + kiểm khung (T-14/T-15) | L4: T-33 `Authorize`; L3 chờ S-07 | L5: ánh xạ trạng thái (T-20) + bảng lỗi (T-21) viết sẵn | L7: T-34 gửi `CALL` xuống trụ (chỉ phụ thuộc T-28) |
| **T4 30/9 chiều** | **S-07 xong** (mốc 12:00–14:00) | **S-08 chạy tích hợp và xong** (mốc cuối ngày) | L6: T-25 phía trình duyệt (`realtime.js` → SSE, tự nối lại) | L7: staging chạy trụ ảo thật |
| **T5 1/10 sáng** | Hỗ trợ review, sửa lỗi ghép | **S-09 xong** (0,5 ngày); **S-14** T-30 (bảng + bọc handler); S-15 T-33 xong | **S-10 tích hợp** (T-22 đầu nối lạ) — bắt đầu ngay sau S-09 | S-12 T-26 job nền |
| **T5 1/10 chiều** | Review, chuẩn hoá lỗi/log | **S-12 xong**; S-14 T-31 (job dọn 7 ngày) | **S-10 xong**; S-11 nối SSE với sự kiện từ S-10 | E2E ngoại tuyến/online hai chiều (T-27) |
| **T6 2/10 sáng** | Review, sửa | S-14, S-15 **xong** | **S-11 xong** (đo ≤ 1 giây, 20 trụ < 2 giây); **S-16** T-35 nút Reset | E2E toàn bộ AC trên staging |
| **T6 2/10 chiều** | Đóng sprint: kiểm DoD từng story, cập nhật README/tài liệu, chuẩn bị review | | | **Chạy 20 trụ ảo, ghi bằng chứng** |
| **T2 5/10 sáng** | Sprint review + retro; xử lý phần trễ | | | |

## 4. Chi tiết từng story

Ký hiệu: **Bắt đầu / Xong** = mốc mục tiêu (nửa ngày). “Cổng” = điều kiện để story kế tiếp chạy được.

### 4.0 Nền dùng chung (L2, làm trước, không tính SP riêng)
Migration mới (tên `006…`, tiến/lùi được, không sửa migration cũ):
- `charge_points`: `last_seen_at TIMESTAMPTZ`, `firmware_version`, `serial_number`, `heartbeat_interval INT`, `online BOOLEAN` (hoặc suy từ `last_seen_at`), `booted_at`.
- `connectors`: `raw_status TEXT` (giữ nguyên giá trị OCPP), `status_updated_at`.
- `connector_errors` (chỉ ghi thêm): `connector_id, error_code, vendor_error_code, occurred_at`, chỉ mục `(connector_id, occurred_at)`.
- `ocpp_messages` (S-14): khoá `(charge_point_code, message_id)`, `action`, `response JSONB`, `created_at`.
- `stations`: `locked_at TIMESTAMPTZ NULL`, `locked_by` (khoá ngoại tới `users`) — **Q1 đã chốt**, xem dưới.
- `id_tags` (S-15): `tag` (**tối đa 20 ký tự**, unique + chỉ mục), `user_id`, `status`, `expires_at`.

**Đã chốt (Q1): “trạm bị khoá bởi quản trị viên” là chiều riêng, không phải trạng thái mới.** Thêm `stations.locked_at` (NULL = không khoá); `stations.status` giữ nguyên `ACTIVE/INACTIVE/MAINTENANCE` vì chủ trạm tự đổi được `status`, còn khoá chỉ Quản trị đặt/gỡ được. Bảng quyết định:

| Tình trạng trạm | Kết nối WebSocket | `BootNotification` | `Authorize` (S-15 AC5) |
|---|---|---|---|
| `ACTIVE`, không khoá | Nhận | `Accepted` | Theo thẻ |
| `INACTIVE` / `MAINTENANCE` | Nhận | `Accepted` (S-06 AC4) | `Blocked` |
| Bị khoá (`locked_at` khác NULL) | Nhận, **giữ socket** (trụ còn thử Boot lại khi mở khoá) | `Rejected` (S-08 AC2); không tính trực tuyến | `Blocked` |

Tin nhắn khác `BootNotification` từ trụ bị khoá → `CALLERROR SecurityError` (giống trụ chưa Boot).

### S-06 · GYM-32 · 2 SP · Trụ đã đăng ký kết nối được, trụ lạ bị từ chối
- **Làn:** L1 · **Bắt đầu:** T3 sáng · **Xong:** T3 chiều · **Cổng:** mở khoá S-07 và S-13.
- **Việc:**
  - **T-12** `RPCServer` (`ocpp-rpc`, `strictMode`, `protocols: ['ocpp1.6']`); trong `auth`: đọc mã từ đường dẫn, chuẩn hoá chữ hoa, tra `charge_points` (chỉ tin đường dẫn, không tin nội dung tin nhắn); nạp `chargePoint` (kể cả trạng thái trạm).
  - **T-13** mã lạ → `reject(404)`, log **một dòng** cảnh báo (mã + IP, không log header).
  - Tự kiểm `handshake.protocols.has('ocpp1.6')`, thiếu/sai → `reject(400)` (K-01: thư viện mặc định **không** chặn).
- **AC phải qua:** (1) mã đã đăng ký → mở và giữ; (2) mã lạ → đóng ngay + log mã & IP; (3) subprotocol khác `ocpp1.6` → từ chối; (4) trạm tạm ngừng → vẫn cho kết nối (chỉ không được bắt đầu phiên — Sprint 3).
- **NFR / DoD:** giữ ≥ 50 kết nối đồng thời trên staging, ≥ 10 phút không tự đứt; test acceptance theo AC; đã thử bằng trụ ảo trên staging.
- **Rủi ro:** mã trong DB đã chuẩn hoá chữ hoa — tra bằng `UPPER`. Thay `server.js` cũ phải giữ test hiện có xanh (`connection-registry.test.js` sẽ được viết lại cùng S-13).

### S-13 · GYM-39 · 1 SP · Cùng mã trụ mở hai kết nối thì kết nối cũ bị đóng
- **Làn:** L1 · **Bắt đầu:** T3 chiều (sau S-06) · **Xong:** T4 sáng.
- **Việc:** **T-28** registry giữ **socket** (không chỉ đếm), thay thế nguyên tử: kết nối mới → đóng kết nối cũ trước rồi ghi mới. **T-29** test hai trụ ảo cùng mã.
- **AC:** kết nối cũ bị đóng, dùng kết nối mới; kết nối cũ đã chết ngầm nhưng máy chủ chưa biết thì kết nối mới vẫn nhận **ngay**; câu trả lời của tin đang xử lý dở trên kết nối cũ **không** gửi sang kết nối mới.
- **NFR:** registry trong bộ nhớ chấp nhận được vì chạy một tiến trình — **ghi giới hạn này vào README** (một dòng).
- **Ghi chú:** dùng lại logic “không đổi mã trụ khi đang kết nối” của S-05 (`isConnected`), cập nhật test đơn vị tương ứng. T-28 cũng là điều kiện của T-34 (S-16).

### S-07 · GYM-33 · 2 SP · Đọc/ghi đúng ba loại khung
- **Làn:** L1 · **Bắt đầu:** T4 sáng · **Xong:** T4 giữa ngày (12:00–14:00) · **Cổng:** mở khoá S-08 (rồi S-09 → S-10 → S-11).
- **Việc (nhờ `ocpp-rpc`, T-14/T-15 nhẹ hơn nhiều):** cấu hình `strictMode` + handler mặc định (`NotImplemented` + log); **hàm ghi/đọc khung** bọc mỏng nếu cần cho test thuần; **T-15** năm ca khung sai (không phải mảng, thiếu phần tử, loại khung lạ, tải không phải đối tượng, hành động chưa hỗ trợ) → `CALLERROR` đúng mã, **kết nối vẫn mở**. Dùng `docs/spikes/k01/session-log.json` làm dữ liệu mẫu.
- **AC:** `CALL` hợp lệ → tách được mã/hành động/tải rồi chuyển đúng handler; khung sai → `CALLERROR` đúng chuẩn thay vì đóng; hành động chưa hỗ trợ → `NotImplemented` + log; `CALL` từ máy chủ xuống trụ khớp `CALLRESULT` theo mã (nền cho S-16).
- **NFR:** mã tin nhắn của lời gọi từ máy chủ duy nhất và lưu để khớp.
- **Rủi ro:** không viết lại khung bằng tay; **đừng để `ocpp-rpc` tự trả lời lặp** — S-14 phải bọc quanh handler (K-01: thư viện chạy lại handler khi trùng `messageId`).

### S-08 · GYM-34 · 2 SP · Trụ khởi động được chấp nhận qua `BootNotification`
- **Làn:** L3 · **Bắt đầu:** viết từ T3 chiều (trên hợp đồng handler); **ghép & xong:** T4 chiều · **Cổng:** mở khoá S-09, **S-14, S-15** (và cả chuỗi).
- **Việc:** **T-16** handler lưu vendor/model/serial/firmware (trường thiếu → lưu rỗng, **không từ chối**); đánh dấu trực tuyến, `booted`. **T-17** trả `Accepted` + `currentTime` (UTC) + `interval` từ **cấu hình** (đổi cấu hình rồi khởi động lại là dùng giá trị mới); lớp trung gian `SecurityError` cho tin trước Boot.
- **AC:** trụ đã đăng ký → lưu thông tin + `Accepted` + giờ máy chủ + nhịp tim + trực tuyến; trạm bị khoá (`locked_at`) → `Rejected`, không coi là trực tuyến; Boot lần hai cùng kết nối → cập nhật, **không tạo bản ghi mới**; tin khác trước Boot → `CALLERROR SecurityError`.
- **Bổ sung theo Q1:** **T-16b** `PATCH /api/admin/stations/:id/lock` (chỉ `ADMIN`, bật/tắt, ghi `locked_by`/`locked_at`, dùng `secureRouter()`) + test Boot bị `Rejected` khi khoá và `Accepted` sau khi mở khoá; khoảng 2 giờ, nằm trong 2 SP của S-08.
- **NFR:** khoảng nhịp tim là tham số cấu hình (`OCPP_HEARTBEAT_INTERVAL`, **mặc định 60 giây**, test đặt 5 — Q2 đã chốt), không ghi cứng; lưu vào `charge_points.heartbeat_interval` cho từng trụ. **DoD:** test gửi hai lần cho kết quả giống một lần.

### S-09 · GYM-35 · 1 SP · Nhịp tim và thời điểm liên lạc cuối
- **Làn:** L3 · **Bắt đầu / Xong:** T5 sáng (nửa ngày) · **Cổng:** mở khoá S-10 và S-12.
- **Việc:** **T-18** handler `Heartbeat` trả giờ máy chủ + hook ở tầng khung cập nhật `last_seen_at` cho **mọi** tin nhắn (`UPDATE` một cột, không đọc-sửa-ghi, không khoá lâu). **T-19** test trụ ảo đặt lệch giờ 5 tiếng → `last_seen_at` chênh `now()` DB < 2 giây; chạy được trong CI.
- **AC:** Heartbeat đổi cột + trả giờ; tin khác cũng cập nhật; đồng hồ trụ lệch vẫn ghi theo giờ máy chủ.
- **NFR:** 50 trụ đồng thời không làm nghẽn — một câu lệnh ngắn.

### S-10 · GYM-36 · 2 SP · `StatusNotification` từng đầu nối
- **Làn:** L5 (viết sớm), ghép sau S-09 · **Bắt đầu:** T4 sáng (mapping, bảng lỗi); **tích hợp:** T5 sáng · **Xong:** T5 chiều · **Cổng:** mở khoá S-11 (dữ liệu) và S-16.
- **Việc:** **T-20** ánh xạ 9 trạng thái OCPP → cột `connectors` (giữ **nguyên văn** trong `raw_status`; trạng thái lạ không làm sập luồng; cập nhật hiện trong 1 giây). **T-21** `connector_errors` chỉ ghi thêm khi `errorCode ≠ NoError` (kèm `vendorErrorCode`); báo `Available` sau đó **không xoá** dòng cũ. **T-22** `connectorId` lớn hơn số đầu nối đã khai → cảnh báo (gom theo trụ, không lặp mỗi giây) + trả `CALLRESULT` rỗng, **không tạo đầu nối mới**. `connectorId = 0` = trạng thái cả trụ.
- **AC:** đổi trạng thái đầu nối; lưu mã lỗi + thời điểm; `connectorId 0` hiểu là cả trụ; đầu nối lạ → cảnh báo + bỏ qua.
- **Ghi chú:** dùng lại `app/status.js` (frontend đã gom nhóm hiển thị, **không** đổi giá trị OCPP gốc); `timestamp` có thể vắng → dùng giờ nhận.
- **Phát sự kiện** “đầu nối X đổi” cho SSE (S-11/T-25) ngay trong handler này.

### S-11 · GYM-37 · 3 SP · Màn hình trạng thái mọi trụ tự cập nhật
- **Làn:** L6 · **Bắt đầu:** T3 sáng (không cần chờ S-10) · **Xong:** T6 sáng · **Cổng:** mở khoá S-16.
- **Hiện trạng:** **T-24 (lưới UI) cơ bản có** từ PR #41 (dashboard, bảng, bản đồ, drawer). Còn:
  - **T-23** `GET /api/…` trả **cây trạm–trụ–đầu nối một truy vấn**, lọc quyền bằng `scopeByOwner`, kèm trạng thái đầu nối, `last_seen_at` và cờ ngoại tuyến (suy từ `last_seen_at`, xem S-12); < 200 ms với 50 trụ; **không** lặp truy vấn con.
  - **T-24 phần còn thiếu:** ô theo **đầu nối** và hiện “liên lạc cuối” của trụ ngoại tuyến.
  - **T-25** SSE: endpoint đẩy sự kiện; lọc theo quyền **từng kết nối** (chủ trạm chỉ nhận trạm của mình); **Q3 đã chốt: dùng SSE** (`EventSource` cùng origin, dùng cookie sẵn có, không thêm thư viện): gửi dòng comment giữ kết nối mỗi ~20 giây (proxy cắt kết nối im lặng), header `Cache-Control: no-cache` + `X-Accel-Buffering: no`, **kiểm tra middleware nén không gom bộ đệm** (nguyên nhân hay gặp làm trễ > 1 giây); giữ polling làm phương án dự phòng khi `EventSource` lỗi liên tục; phía trình duyệt: thay polling trong `frontend/services/realtime.js` (giữ cùng hàm `subscribe`), tự nối lại và **tải lại snapshot đầy đủ** sau khi nối lại.
- **AC:** 20 trụ hiện đủ < 2 giây; đổi trạng thái → màn hình đổi **≤ 1 giây** không tải lại; trụ ngoại tuyến hiện rõ + liên lạc cuối; chủ trạm chỉ thấy trụ của mình; đứt kết nối đẩy → tự nối lại.
- **Rủi ro:** SSE với `EventSource` dùng cookie cùng origin OK; nhớ tắt buffering nếu có proxy. Bộ phát sự kiện trong bộ nhớ chấp nhận được (một tiến trình).

### S-12 · GYM-38 · 2 SP · Quá hạn nhịp tim → ngoại tuyến
- **Làn:** L3/L7 · **Bắt đầu:** T5 sáng (sau S-09) · **Xong:** T5 chiều.
- **Việc:** **T-26** job mỗi phút: `last_seen_at` quá **2 × `heartbeat_interval` của chính trụ đó** → ngoại tuyến, đầu nối về “không rõ”; chạy lặp không thêm tác dụng phụ; so sánh giờ **ở DB**. **T-27** kịch bản: dừng trụ ảo → ngoại tuyến → bật lại → trực tuyến, đầu nối chờ `StatusNotification` kế; chạy xanh **3 lần liên tiếp trên staging** (khoảng nhịp tim test đặt 5 giây).
- **AC + NFR then chốt:** trạng thái ngoại tuyến **suy từ `last_seen_at` tại lúc truy vấn** (T-23), job chỉ để ghi sự kiện và đồng bộ — khởi động lại tiến trình vẫn đúng.

### S-14 · GYM-40 · 2 SP · Tin trùng mã nhận lại đúng câu trả lời cũ
- **Làn:** L4 · **Bắt đầu:** T5 sáng (sau S-08; bảng có sẵn từ T3) · **Xong:** T6 sáng.
- **Việc:** **T-30** bọc **mọi** handler: trong **một giao dịch** — tra `(mã trụ, messageId)`; đã có → trả câu cũ, **không** chạy handler; chưa → chạy handler, lưu câu trả lời. **T-31** job dọn > 7 ngày (số ngày cấu hình) + test gửi lại 5 lần + test **khởi động lại giữa hai lần gửi**.
- **AC:** trùng → câu cũ; khởi động lại vẫn nhận ra (lưu DB); cùng mã khác nội dung → trả câu đầu + cảnh báo; > 7 ngày bị dọn.
- **Bằng chứng nền (K-01 §4):** gửi lại cùng `messageId` làm thư viện cấp hai `transactionId`. Test này lấy đúng ca đó làm mẫu.
- **Rủi ro:** khoá đồng thời — hai tin trùng tới cùng lúc phải chỉ một cái chạy handler (advisory lock hoặc unique + xử lý xung đột).

### S-15 · GYM-41 · 2 SP · Xác thực thẻ qua `Authorize` *(Must)*
- **Làn:** L4 · **Bắt đầu:** T3 sáng (T-32 bảng), viết T-33 ở T4 sáng · **Xong (merge):** T5 sáng, ngay sau khi S-08 merge.
- **Việc:** **T-32** `id_tags` (tag ≤ 20 ký tự, unique + chỉ mục, trạng thái khoá, hạn dùng; seed mỗi tài xế thử một thẻ — nhớ tài khoản `driver@` của bộ demo). **T-33** handler trả `Accepted` / `Blocked` / `Expired` / `Invalid` (+ nhật ký lần thử khi Invalid); trạm tạm ngừng + thẻ hợp lệ → `Blocked`.
- **AC:** năm ca (hợp lệ, khoá, quá hạn, không có, trạm tạm ngừng). **NFR:** **log chỉ bốn ký tự cuối** của thẻ; không lộ lý do ngoài bốn trạng thái chuẩn.
- **Ghi chú:** Sprint 3 (S-17) dùng lại hàm kiểm thẻ này → viết dạng hàm thuần, xuất ra được.

### S-16 · GYM-42 · 1 SP · Khởi động lại trụ từ xa bằng `Reset` *(Should — ứng viên cắt đầu tiên)*
- **Làn:** L7 (T-34) + L6 (T-35) · **T-34 bắt đầu:** T4 sáng (chỉ cần registry T-28) · **T-35 xong:** T6 sáng, sau S-11.
- **Việc:** **T-34** `call.js`: sinh mã tin nhắn, gửi `CALL` qua kết nối trong registry, chờ `CALLRESULT`, timeout cấu hình (mặc định 30 giây), **không chặn** xử lý tin khác trên cùng kết nối; trụ ngoại tuyến → lỗi **ngay** (không treo). **T-35** nút trên màn hình trụ (chọn mềm/cứng), chỉ **Vận hành viên và Quản trị** thấy; API kiểm quyền ở backend.
- **AC:** trực tuyến + mềm → `Accepted` trong 5 giây; ngoại tuyến → báo ngay; không trả lời 30 giây → lỗi hết thời gian, huỷ lời gọi.
- **NFR:** đây là lệnh đầu tiên máy chủ → trụ: cơ chế chờ viết **chung** cho S-23/S-24. Ghi vết ai bấm (nền cho S-27 ở Sprint 3).

## 5. Mốc kiểm tra và thứ tự cắt (PO đã chọn 20 SP; đây là cơ chế cảnh báo sớm)

| Mốc | Điều kiện đạt | Nếu chưa đạt |
|---|---|---|
| **T3 17:00** | S-06 đã merge; staging chạy (Q4); migration lên `main` | Báo Scrum Master ngay; Phúc gỡ chặn quyền staging/CI |
| **T4 14:00** | S-07 merge (khung + lỗi) | Chuỗi trễ → **bỏ S-16** khỏi cam kết |
| **T4 hết ngày** | **S-08 merge** (cổng của 6 story) | Nếu trễ sang T5 sáng: S-09/S-14/S-15/S-10 dồn về T5–T6 → **dời S-15** sang đầu Sprint 3 (xin PO) |
| **T5 12:00** | S-09 merge, S-10 đã tích hợp, S-12 đang chạy | Nếu S-10 chưa xong: giảm phạm vi S-11 xuống polling nhanh (2 giây) + báo PO; **S-14 dời cuối cùng** |
| **T6 10:00** | S-11 đo ≤ 1 giây; E2E 20 trụ ảo trên staging chạy được | Chỉ demo các story đủ DoD |
| **T2 5/10 sáng** | Review, retro, kiểm DoD từng story | — |

Thứ tự cắt (đã thống nhất ở phương án A): **S-16 → S-15 → S-14**. **Goal 15 SP (S-06…S-13) không được cắt.**

## 6. Câu hỏi cần trả lời ngay (chặn việc nếu không có đáp án)

**Đã chốt (Scrum Master, 30/9; PO/trưởng nhóm kỹ thuật xác nhận lại ở buổi họp nếu có ý kiến khác):**

- **Q1 — “khoá bởi quản trị viên”:** cột `stations.locked_at` (+ `locked_by`), không thêm trạng thái vào `status`; bảng quyết định ở mục 4.0. Kèm endpoint admin `PATCH /api/admin/stations/:id/lock` (T-16b). Nếu PO từ chối thêm việc thì **bỏ S-08 AC2 khỏi Sprint 2** và ghi sang Sprint 3; không giữ AC mà không có cách đặt trạng thái “khoá”. Migration `locked_at` nằm trong bộ `006…` đầu tiên, phải có trước T-16.
- **Q2 — nhịp tim:** `OCPP_HEARTBEAT_INTERVAL` mặc định **60 giây** (không phải 300 như đề xuất ban đầu), test đặt 5. Lý do: ngoại tuyến suy ra khi `last_seen_at` quá 2 × interval (S-12); 300 giây thì trụ rớt 10 phút mới hiện ngoại tuyến, quá chậm cho demo; 60 giây là 2 phút, tải 20 trụ chỉ ~20 tin/phút. Lưu theo từng trụ; mọi tin nhắn đều cập nhật `last_seen_at` (S-09 AC2) để trụ thật phớt lờ `interval` không bị báo ngoại tuyến nhầm (thử lại ở S-21 với thiết bị không do nhóm viết). Chỉ là biến môi trường nên đổi được không cần sửa code.
- **Q3 — S-11:** dùng **SSE** (AC ≤ 1 giây, polling hiện 15 giây tại `frontend/services/realtime.js`). Chi tiết kỹ thuật ở T-25. Bộ phát sự kiện trong bộ nhớ đúng khi chạy **một tiến trình**: ghi vào README, giữ một instance.

**Q4 — nơi đặt staging và ai giữ biến môi trường (đã chọn hướng: laptop homelab + ngrok; Render giữ dự phòng):**

| | Render (gói miễn phí) | Homelab + ngrok (gói miễn phí) |
|---|---|---|
| Ngủ khi rảnh | Có, sau 15 phút không có yêu cầu; WebSocket của trụ bị ngắt | Không |
| Database | Postgres miễn phí **hết hạn sau 30 ngày** | Volume Docker, không hết hạn; cần tự sao lưu |
| Địa chỉ cố định | Có | Có: mỗi tài khoản ngrok được **một tên miền cố định miễn phí** (`tên.ngrok-free.app`), có HTTPS/WSS |
| Giới hạn | — | **~20.000 yêu cầu HTTP/tháng và 1 GB băng thông/tháng**, tối đa 3 endpoint; trang cảnh báo ngrok hiện cho lưu lượng HTML từ trình duyệt (bấm “Visit” một lần, nhớ 7 ngày) |
| Rủi ro | Mất DB sau 30 ngày; demo OCPP không ổn định | Mất điện/mạng nhà; phụ thuộc một người; hết hạn mức thì tunnel bị hạn chế |

Nguồn số liệu ngrok: trang *Free Plan Limits* và blog *Static dev domains* của ngrok (tra ngày 30/9/2026). Ngrok không nêu rõ chuyện gì xảy ra khi vượt hạn mức; theo dõi ở bảng điều khiển của ngrok.

**Cách dùng để không chạm trần hạn mức:**
- **Trụ ảo và toàn bộ kiểm thử tự động (S-06 ≥ 50 kết nối/10 phút, S-11 đo ≤ 1 giây, S-12 ba lần xanh) chạy ngay trên laptop, gọi `localhost`**, không đi qua ngrok. Tin OCPP rất nhỏ nên băng thông không đáng kể; vấn đề là yêu cầu HTTP.
- Ngrok chỉ dành cho PO/mentor và người ở xa xem giao diện. Người cùng mạng dùng địa chỉ LAN.
- Frontend đang polling 15 giây (~5.760 yêu cầu/ngày cho một tab mở suốt): **đừng để tab dashboard mở cả ngày qua ngrok cho đến khi S-11 (SSE) xong.**
- Báo trước cho PO/mentor về trang cảnh báo của ngrok ở lần vào đầu tiên.

**Chạy staging công khai bằng `run.py` (đã có chế độ riêng, xem `docs/OPERATIONS.md`):**
`python run.py --public-url https://<tên>.ngrok-free.app`, rồi chạy ngrok trên cùng máy trỏ vào cổng 3000. Chế độ này giữ `APP_ORIGIN` đúng địa chỉ công khai, luôn dùng mật khẩu ngẫu nhiên (không bao giờ `admin`/`admin`), đặt `NODE_ENV=production` (cookie `Secure`), `TRUST_PROXY=1` (giới hạn đăng nhập theo IP thật, không dồn về IP của tunnel), khoá `BIND_HOST=127.0.0.1` (Postgres không lộ ra mạng) và **từ chối chạy nếu DB còn tài khoản mật khẩu mặc định** từ các lần chạy local trước.

**Việc còn lại trước khi mở Internet:**
1. **Bí mật:** token ngrok, `ADMIN_PASSWORD`, `DEMO_PASSWORD`, `JWT_SECRET` chỉ nằm trên máy chủ (không vào Git, chat nhóm, ảnh chụp màn hình).
2. **Vận hành máy chủ:** SSH bằng khoá (tắt mật khẩu), bật cập nhật bảo mật tự động, `pg_dump` định kỳ ra ổ khác, container `restart: unless-stopped` để tự dậy sau mất điện; ghi ai giữ máy khi Phúc vắng.
3. **Triển khai:** thủ công (`git pull` rồi `python run.py`) và **chỉ từ `main` sau khi CI xanh**; Render tự chờ CI xanh còn homelab thì không, nên đây là quy ước của nhóm.
4. Thử một lần: WebSocket của trụ ảo ở máy khác đi qua tunnel ngrok (chưa kiểm chứng).

Người giữ tài khoản ngrok/Render và biến môi trường: **Phúc**, trưởng nhóm kỹ thuật làm dự phòng. Hạn chót chốt: **17:00 30/9**; không có staging thì S-06…S-12 không thể “AC pass trên staging”.

- **Q5:** Ai phụ trách từng làn? (điền vào bảng mục 2 sau họp). **Lịch chi tiết do Scrum Master điều phối**: các mốc ngày trong tài liệu là đề xuất, không phải hạn cứng của tài liệu này.

## 7. Kiểm tra Definition of Done cuối sprint (mỗi story)

- [ ] Code review bởi người khác · [ ] unit + acceptance theo AC · [ ] test **gửi hai lần = một lần** (mọi story chạm OCPP)
- [ ] CI xanh (lint, test, quét phụ thuộc) · [ ] **AC pass trên staging với trụ ảo chạy thật**
- [ ] Không log mã thẻ đầy đủ/định danh cá nhân · [ ] README cập nhật (registry trong bộ nhớ = giới hạn một tiến trình; biến `OCPP_HEARTBEAT_INTERVAL` mặc định 60, ghi rõ ngoại tuyến hiện sau 2 × giá trị này…)
- [ ] Jira: subtask (T-xx) đóng, story chuyển Done kèm liên kết PR
