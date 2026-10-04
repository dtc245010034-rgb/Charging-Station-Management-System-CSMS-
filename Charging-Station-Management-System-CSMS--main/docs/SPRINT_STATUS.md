# Tình trạng dự án và sprint — CSMS

> Cập nhật: **03/10/2026**, khớp `main` sau PR #74 (`8008b45`). Nguồn: lịch sử PR trên GitHub, mã nguồn và kết quả chạy thật (`npm run lint`, `npm test`). **Trạng thái thẻ Jira chưa đối chiếu bằng API** (không có token): cột “Jira” của Sprint 2 dưới đây là “code đạt trên `main`”, không phải trạng thái Done chính thức.
> Định nghĩa Done chính thức theo Jira và Definition of Done trong backlog; tài liệu này ghi thêm **bằng chứng** và **chỗ chưa đạt**.

## 1. Tóm tắt một trang

| Mục | Giá trị |
|---|---|
| Dự án | Nền tảng vận hành trạm sạc xe điện (CSMS) — Đồ án TTCS ICTU × CodeGym, nhóm TTCS_T926_K8S4_N3, 9 thành viên |
| Product Goal | Nắm mọi phiên sạc thời gian thực qua OCPP 1.6J, tính đúng tiền theo biểu giá nhiều khung giờ, không để trạm vượt công suất, đối soát doanh thu khớp kWh |
| Thời gian | 21/9 – 26/10/2026, sprint 1 tuần (5 ngày làm việc), đơn vị ước lượng story point |
| Sprint 1 (21–28/9) | **12/12 SP hoàn thành** trên Jira (trừ việc chuẩn bị demo GYM-14 đang làm). Demo Thứ Tư 30/9 |
| Sprint 2 (28/9–5/10) | Kế hoạch 20 SP, 11 story (GYM-32…42). **Đã có trên `main`:** S-06…S-11, S-13 và cờ ngoại tuyến (S-12). S-14 (chống tin trùng `messageId`) đã có trên `main`. **Chưa làm:** S-15, S-16 (3 SP; kế hoạch: `docs/design/S15-S16-ke-hoach.md`). Nhánh `phuc/GYM-XX-fix-cap-nhat` (chưa merge) vá thêm F8–F12. Xem mục 4 |
| Chất lượng hiện tại | Lint sạch · **280/280 test pass, 3 lần liên tiếp** (104,4 s; 114,4 s; 115,0 s; gồm S-09 T-19 cần Docker) · CI xanh trên `main` (job Ubuntu + job Windows) |
| Cảnh báo lịch | Backlog có 8 sprint nhưng dự án kết thúc 26/10 (còn khoảng 3 tuần): thực tế tới Sprint 5. Phạm vi cuối do PO chốt |

## 2. Sprint 1 — “Chủ trạm khai báo được trạm, trụ và đầu nối; cả nhóm chạy được dự án”

| Jira | Story | SP | Jira | Bằng chứng | Còn thiếu / lưu ý |
|---|---|---|---|---|---|
| GYM-13 | SM-01 Quy ước làm việc (nhánh, commit, PR, người review) | — | Done | `CONTRIBUTING.md`, mẫu PR | — |
| GYM-7 | S-01 Khung ứng dụng chạy được | 3 | Done | Docker Compose, migration tiến/lùi, `tests/acceptance/S-01.*`, CI (lint + test + quét phụ thuộc) | **AC “tự triển khai staging khi merge” chỉ đạt khi bật Render** (`render.yaml` đã sẵn sàng, cần người có quyền đăng ký một lần) |
| GYM-8 | S-02 Đăng nhập email + mật khẩu, khoá tạm khi sai nhiều lần | 2 | Done | `S-02.login*.test.js`; khoá 15 phút sau 5 lần sai theo email và theo IP; không lộ email tồn tại | Chưa có “quên mật khẩu” (ngoài phạm vi) |
| GYM-9 | S-03 Mỗi vai trò chỉ thấy phần việc của mình | 2 | Done | `S-03.rbac*.test.js`, ma trận quyền một nguồn, route chưa khai quyền bị chặn, chủ trạm chỉ thấy trạm của mình, nhật ký truy cập trái phép | Vai trò lấy từ JWT 8 giờ: đổi vai trò không có hiệu lực tới khi đăng nhập lại |
| GYM-10 | S-04 Chủ trạm tạo và sửa trạm | 2 | Done | `S-04.station-management.test.js`; `Idempotency-Key`; kiểm toạ độ; giao diện đã kiểm trên trình duyệt | — |
| GYM-11 | S-05 Thêm trụ và đầu nối, mã trụ duy nhất | 1 | Done | `S-05.charge-point-code.test.js`; mã luôn chữ hoa; 1–4 đầu nối | AC “không đổi mã sau khi có phiên sạc” **chưa thể thực thi** vì chưa có bảng phiên sạc (xem `docs/spikes/S-05-AC3-ghi-nhan-cho-PO.md`) |
| GYM-12 | K-01 Spike: trụ ảo nối máy chủ WebSocket | 2 | Done (làm lại 28/9) | `docs/spikes/K-01-ocpp-simulator.md`, `docs/spikes/k01/` — phiên sạc trọn vẹn, R-08, trụ lạ, tin nhắn trùng | Bản 27/9 chưa đạt AC; bản mới đạt nhưng **chưa thử trụ thật** (mục 6 của tài liệu K-01) |
| GYM-14 | SM-02 Chuẩn bị demo Sprint 1 | — | In Progress | Dữ liệu demo (`npm run seed-demo`), 30 ảnh chụp giao diện `docs/design/screenshots/` | Cần bật staging Render và seed trước Thứ Tư; mở trang 5 phút trước demo (gói free ngủ) |

**Velocity Sprint 1: 12 SP** (đúng kế hoạch). Chưa đủ dữ liệu để dự báo; theo R-05, đo 3 sprint đầu rồi mới tính lại kế hoạch.

### Việc làm thêm ngoài backlog Sprint 1 (28/9)
- **Thiết kế lại toàn bộ giao diện** theo UX Redesign Level 3 (`docs/design/`): bảng điều khiển Vận hành viên, workspace cho 5 vai trò, sáng/tối, đa vai trò, tìm kiếm Ctrl+K, bản đồ.
- **Sửa lỗi test đỏ** trên máy dev có `backend/.env`.
- **Dữ liệu demo**, cấu hình staging, quét phụ thuộc trong CI, tài liệu vận hành.

## 3. Hệ thống hiện có gì (03/10/2026)

| Lớp | Có | Chưa có |
|---|---|---|
| Nền tảng | Express 5 + PostgreSQL 16, Docker Compose, migration 001–015 (tiến/lùi), CI (Ubuntu + Windows), Dockerfile chạy user thường + healthcheck, blueprint Render, tắt máy sạch (N4) | Staging chạy thật được kiểm với 50 trụ ảo, sao lưu tự động (S-62), thống kê sức khoẻ (S-63) |
| Tài khoản & quyền | Đăng ký công khai (luôn Tài xế), Quản trị tạo mọi vai trò, đăng nhập, khoá tạm, RBAC 5 vai trò, cô lập dữ liệu theo chủ trạm, audit truy cập trái phép | Danh sách/khoá tài khoản (S-61), đổi/quên mật khẩu |
| Trạm – trụ – đầu nối | API tạo/sửa/xem (lọc theo chủ sở hữu), mã trụ duy nhất, toạ độ, chống bấm hai lần, **khoá/mở khoá trạm** (đóng kết nối trụ bằng mã 1008) | Chặn đổi mã khi có phiên sạc |
| OCPP | `ws://…/ocpp/<mã>`: xác thực mã trụ + subprotocol, khung CALL/CALLRESULT/CALLERROR, `BootNotification`, `Heartbeat` (`last_seen_at` theo giờ DB), `StatusNotification` (lưu trạng thái, lỗi có khử trùng, giới hạn độ dài), thay thế kết nối trùng (S-13), rate limit, ping giữ kết nối | `Authorize` (còn là stub, S-15), Reset từ xa (S-16), xác thực trụ (B5), phiên sạc (Sprint 3) |
| Trạng thái trụ thời gian thực | `GET /api/fleet-status` (cây trạm–trụ–đầu nối, cờ `offline`), SSE `/api/fleet-status/events` (chủ trạm chỉ nhận sự kiện của mình), giao diện tự nối lại và đồng bộ lại snapshot | Quy tắc để lỗi mức trụ ảnh hưởng trạng thái tổng của trụ/trạm (chờ PO) |
| Giao diện | Đăng nhập/đăng ký; workspace Vận hành (bảng điều khiển trạng thái tức thời), Chủ trạm, Quản trị, Kế toán (khung), Tài xế (khung, mobile) | Cảnh báo, phiên sạc, điều khiển từ xa, ví, hoá đơn, đặt chỗ, đối soát |
| Tiền, ví, biểu giá, công suất, đặt chỗ, đối soát | — | Sprint 4–8 |

Chi tiết từng màn hình và ai thao tác được: xem README mục 2 và ảnh chụp trong `docs/design/screenshots/`.

## 4. Sprint 2 — “Trụ ảo nối vào hệ thống được xác thực; vận hành viên thấy đúng trạng thái mọi trụ” (28/9 – 5/10, 20 SP)

Phụ thuộc và mức ưu tiên **theo file backlog của PO**. Cột “Trên `main`” là bằng chứng từ PR đã merge (03/10/2026); trạng thái Jira chưa kiểm bằng API.

| Jira | Story | SP | Ưu tiên | Phụ thuộc | Trên `main` (03/10) | Ghi chú từ K-01 / hiện trạng |
|---|---|---|---|---|---|---|
| GYM-32 | S-06 Trụ đã đăng ký kết nối, trụ lạ bị từ chối | 2 | Must | S-05, K-01 | **Có** (#55) | Tự kiểm subprotocol `ocpp1.6` (thư viện mặc định không chặn); tra mã chữ hoa; mã lạ → HTTP 404 lúc bắt tay |
| GYM-33 | S-07 Đọc/ghi đúng ba loại khung | 2 | Must | S-06 | **Có** (#58, #59) | Khung sai schema → `CALLERROR`, không đóng kết nối. Triển khai bằng `ws` + bộ khung tự viết, không dùng `ocpp-rpc` |
| GYM-34 | S-08 `BootNotification` | 2 | Must | S-07 | **Có** (#60, #63, #65) | Lưu vendor/model/serial/firmware; `interval` chỉ là gợi ý |
| GYM-35 | S-09 Nhịp tim, liên lạc cuối | 1 | Must | S-08 | **Có** (#66) | Giờ máy chủ DB |
| GYM-36 | S-10 `StatusNotification` | 2 | Must | S-09 | **Có** (#68, #74) | `timestamp` vắng → giờ nhận; `connectorId = 0` (cả trụ) đã lưu ở `charge_points` (F5, PR này) |
| GYM-37 | S-11 Màn hình trạng thái mọi trụ | 3 | Must | S-10 | **Có** (#70, #72) | Xem “S-11 đã làm gì” bên dưới |
| GYM-38 | S-12 Quá hạn nhịp tim → ngoại tuyến | 2 | Must | S-09 | **Có** (cờ `offline` trong fleet-status) | Suy từ `last_seen_at`, không phụ thuộc job |
| GYM-39 | S-13 Trùng mã trụ → đóng kết nối cũ | 1 | Must | S-06 | **Có** (#56) | Registry giữ socket, đóng kết nối cũ |
| GYM-40 | S-14 Tin trùng mã nhận lại câu trả lời cũ | 2 | Must | S-08 | **Có** (bảng `ocpp_messages`; F8 trên nhánh `phuc/GYM-XX-fix-cap-nhat`) | **Bằng chứng K-01 §4**: gửi lại cùng `messageId` làm handler chạy lại và cấp 2 `transactionId` |
| GYM-41 | S-15 Xác thực thẻ qua `Authorize` | 2 | **Must** | S-08 | **Chưa** (`Authorize` là stub) | `idTag` ≤ 20 ký tự; log chỉ 4 ký tự cuối; Sprint 3 (S-17) dùng lại |
| GYM-42 | S-16 Reset từ xa | 1 | **Should** | S-11 | **Chưa** | Chỉ Should duy nhất; cần hàm gửi lệnh từ máy chủ xuống trụ |

> **Quyết định (29/9):** PO chọn **phương án A, cam kết đủ 20 SP**. Trưởng nhóm kỹ thuật ban đầu chốt `ocpp-rpc`, nhưng bản triển khai trên `main` dùng **`ws` thuần + bộ khung tự viết** (`backend/src/modules/ocpp/`); `SPRINT_2_PLAN.md` ghi kế hoạch gốc nên còn nhắc `ocpp-rpc`. Kế hoạch chi tiết: [`SPRINT_2_PLAN.md`](./SPRINT_2_PLAN.md).

### Phân tích

- **Chuỗi tuần tự 12 SP:** `S-06 → S-07 → S-08 → S-09 → S-10 → S-11` (2+2+2+1+2+3). Nhánh rẽ: S-12 từ S-09; S-13 từ S-06; S-14 và S-15 từ S-08; S-16 từ S-11 (nên S-16 nằm cuối chuỗi, 13 SP tuần tự).
- **Sprint goal cần 15 SP** (S-06…S-13). **S-14 + S-15 + S-16 = 5 SP** nằm ngoài goal. S-15 là **Must**, không phải Should; chỉ S-16 là Should.
- **Thời gian thật còn ít:** sprint chạy 28/9 → 2/10 (5 ngày làm việc), Thứ Tư 30/9 có demo Sprint 1. Đến 29/9 chỉ còn khoảng 3,5 ngày cho một chuỗi 12 SP nối đuôi. Đây là rủi ro lớn hơn con số 20 SP.
- **DoD chi phối:** (1) “AC pass trên staging với trụ ảo chạy thật” → staging Render phải bật trong sprint; (2) “xử lý hai lần = một lần” áp cho **mọi** story chạm OCPP (S-08, S-09, S-10, S-15…) nên mỗi handler cần test gửi trùng; S-14 là cơ chế chung, nên làm ngay sau S-08, không để cuối sprint.
- **Sprint 1 goal:** xlsx ghi “staging”, Jira đã sửa thành “máy cá nhân” → staging vẫn là khoản nợ, và Sprint 2 là lúc trả.

### S-11 đã làm gì (3 SP)

| Task | Tình trạng |
|---|---|
| T-24 lưới giao diện | **Xong** (#41, #70, #72): dashboard, bảng, bản đồ, drawer, trạng thái theo đầu nối, “liên lạc cuối” |
| T-23 truy vấn cây trạm–trụ–đầu nối lọc theo quyền | **Xong**: `GET /api/fleet-status`, một truy vấn, lọc theo chủ sở hữu |
| T-25 kênh đẩy (SSE) | **Xong**: `GET /api/fleet-status/events`; sự kiện của chủ trạm này không đến chủ trạm khác; `frontend/services/realtime.js` dùng SSE, tự nối lại, đồng bộ lại snapshot và chỉ polling 15 giây khi SSE không dùng được |

### Ba phương án cam kết (đã chọn A ngày 29/9; giữ để tham chiếu)

| Phương án | SP | Nội dung | Đánh đổi |
|---|---|---|---|
| A. Cam kết đủ | 20 | Tất cả | Vượt velocity đã biết (12) 67%; không còn đệm |
| B. Bỏ Should | 19 | Trừ S-16 | Vẫn cao; S-15 là Must nên giữ |
| C. Chỉ phần phục vụ goal + S-14 | 17 | S-06…S-14; S-15, S-16 sang đầu Sprint 3 | Cần PO chấp nhận dời một Must (S-15); Sprint 3 thêm 3 SP → đổi bằng các story Should của Sprint 3 (S-24, S-27) |
| D. Chỉ goal | 15 | S-06…S-13 | S-14, S-15, S-16 sang Sprint 3 (+5 SP); an toàn nhất cho Sprint 2, Sprint 3 phải cắt Should |

Thứ tự cắt nếu trễ (chốt sớm với PO, ví dụ tối Thứ Tư 30/9): **S-16 → S-15 → S-14**. Goal 15 SP luôn được giữ.

### Cách rút ngắn chuỗi (không đổi phạm vi)
1. **Quyết định `ocpp-rpc` ngay hôm nay** (trưởng nhóm kỹ thuật): nó thu S-07 còn khoảng nửa ngày (khung, mã lỗi, kiểm schema có sẵn).
2. **Làm trước, song song:** toàn bộ migration (`last_seen_at`, thông tin trụ, `connector_errors`, `ocpp_messages`), khung giao diện handler (mỗi handler một file theo mẫu T-16), trụ ảo kịch bản (dựa `docs/spikes/k01/`), và bật staging.
3. **Ràng buộc phụ thuộc là ở mức chạy tích hợp, không phải mức viết mã:** sau S-07, các handler S-08/S-09/S-10 viết được song song rồi ghép; T-23 (truy vấn cây) chỉ cần bảng, không cần đợi S-10 chạy.
4. Sau S-08, ba việc chạy song song: S-09, S-14, S-15. Sau S-09: S-10 và S-12.

## 5. Lộ trình các sprint sau (theo backlog)

| Sprint | Mục tiêu | SP | Ghi chú |
|---|---|---|---|
| 3 | Một phiên sạc trọn vẹn với kWh đúng dù trụ mất kết nối | 20 | S-17…S-25, cần S-14; `MeterValues.transactionId` tuỳ chọn → bảng `orphan_messages` là bắt buộc |
| 4 | Tính đúng tiền theo biểu giá nhiều khung giờ | 20 | S-28…S-34; ca kiểm thử có đáp án tính tay (R-04) |
| 5 | Nạp ví sandbox, tự trừ tiền | 20 | **R-02: chưa có hồ sơ sandbox thanh toán** → S-36 (nạp tay) là đường chính |
| 6 | Phân bổ công suất | 19 | R-08 giảm rủi ro (trụ ảo của nhóm xử lý được profile) |
| 7 | Tìm trạm, đặt chỗ | 19 | Chưa có story con cho E-07; menu chưa hiện |
| 8 | Đối soát, chia doanh thu | 20 | — |

⚠️ Dự án kết thúc 26/10: thực tế tới cuối Sprint 5. Sprint 6–8 nằm ngoài lịch trừ khi PO đổi phạm vi.

## 6. Rủi ro — trạng thái hiện tại

| ID | Rủi ro | Trạng thái |
|---|---|---|
| R-01 | Đặc tả OCPP dài | **Giảm**: K-01 đã có bản ghi phiên thật và bảng trường theo schema chính thức |
| R-02 | Chưa có sandbox thanh toán | **Mở** — chưa nộp hồ sơ; dựa vào S-36 |
| R-03 | Chống trùng bằng biến bộ nhớ | **Mở**, đã có bằng chứng K-01; NFR bắt buộc lưu DB |
| R-04 | Tính tiền sai ở ca biên | Mở (Sprint 4) |
| R-05 | Velocity chưa biết | **Mở**: 1 sprint dữ liệu (12 SP) |
| R-06 | Không có DevOps, staging hỏng | **Giảm một phần**: có blueprint Render và tài liệu; **chưa** bật thật |
| R-07 | Dữ liệu vị trí tài xế | Mở (S-57, Sprint 8) |
| R-08 | Simulator không tôn trọng `SetChargingProfile` | **Giảm**: trụ ảo nhóm tự viết xử lý được; không suy ra cho trụ thật |
| R-09 | 5 người sửa chung module OCPP | Mở — mỗi handler một file theo mẫu T-16 |

## 7. Definition of Done — đã đạt / chưa

| Mục DoD | Trạng thái |
|---|---|
| Review bởi người khác | Mỗi PR đã merge có ít nhất một người khác tác giả review (theo quy ước `CONTRIBUTING.md`) |
| Unit test cho nhánh logic mới | Đạt: **280 test**, 3 lần liên tiếp không chập chờn |
| CI xanh (build, lint, test) | Đạt trên `main`: job `lint-and-test` (Ubuntu) và `test-windows`. **Chưa có `typecheck`** (dự án JS thuần). Hai test N4 (tín hiệu `SIGTERM`/`SIGINT`) bỏ qua trên Windows, chạy ở job Ubuntu |
| Quét phụ thuộc sạch | Đạt: `npm audit --omit=dev --audit-level=high` trong CI |
| AC pass trên staging với trụ ảo chạy thật | **Chưa đạt**: chưa kiểm staging với 50 trụ ảo (thiếu URL staging); đã kiểm bằng server thật trên DB thử cục bộ (93 ok, 0 FAIL) |
| Không log dữ liệu định danh / mã thẻ | Đạt với mã hiện có; đã vá rò `host:port` trong log tắt máy (vòng 6) |
| README cập nhật | Đạt (03/10) |

## 8. Các PR đã merge vào `main` từ 29/9

| Nhóm | PR |
|---|---|
| Hạ tầng, tài liệu, giao diện | #44, #45, #46 (`run.py`/`test.py`), #47, #48, #49, #50, #51 (`--public-url`), #52 (đăng nhập/đăng ký), #53, #54 (bản đồ), #64 |
| Sprint 2, lõi OCPP | #55 (S-06), #56 (S-13), #57, #58 (S-07), #59, #60/#63/#65 (S-08, khoá trạm, serial), #66 (S-09) |
| Sprint 2, trạng thái trụ | #68 (S-10), #69 (khoá trạm đóng kết nối, N2), #70/#72 (S-11 fleet-status + SSE) |
| Vòng 6 | #74: F1 giới hạn và khử trùng `StatusNotification`, F2/F4 nhãn `ONLINE`/`UNAVAILABLE`, F3 đầu nối về `UNKNOWN` khi mất kết nối, F6 `terminate` sau khoá, N4 tắt máy sạch, N8 giữ serial/firmware, vá Heartbeat bị treo khi hàng bị khoá, công cụ kiểm chứng không dùng `admin/admin` |

## 9. Vòng sửa lỗi 6 (03/10/2026) — đã merge (#74)

Chi tiết và bằng chứng: [`testing/BAO-CAO-VONG-6.md`](testing/BAO-CAO-VONG-6.md).

| Hạng mục | Kết quả đã chạy thật |
|---|---|
| Lint và test | Lint sạch; **280/280 pass, 0 fail**, 3 lần liên tiếp (104,4 s; 114,4 s; 115,0 s), gồm S-09 T-19 chạy thật. Không test chập chờn |
| Migration 009 ⇄ 012 | Lên → xuống tới 009 → lên đạt trên DB rỗng và DB seed-demo, schema giống hệt trước |
| Kịch bản server thật (`tools/verify-round6-live.js`) | 93 ok, 0 FAIL, hai lần chạy |
| Giao diện/bản đồ (Playwright, tile giả) | Sau F2: 121/121; trước F2: 66/121. Tile OSM thật **chưa kiểm** |
| Lỗi DB (B7/N1) | Phát hiện và vá Heartbeat bị treo 6007 ms khi hàng bị khoá (nay 3 ms); DB sập trả `InternalError`, không lộ nội dung lỗi Postgres |
| Staging 50 trụ ảo | **Chưa kiểm chứng** (không có URL staging) |
| Trạng thái Jira bằng API | **Chưa xác minh** (không có token) |

## 10. Việc còn mở

| Mã | Việc | Người/nơi quyết |
|---|---|---|
| S-14 / K-01 | Chống xử lý trùng `messageId` | Dev, Sprint 2 phần còn lại |
| S-15 | `Authorize` kiểm thẻ thật | Dev |
| S-16 | Reset từ xa | Dev (Should) |
| B5 | Xác thực trụ. Rủi ro ghi nhận và chấp nhận tạm cho demo/staging; đề xuất thiết kế ở [`B5-xac-thuc-tru-de-xuat-thiet-ke.md`](B5-xac-thuc-tru-de-xuat-thiet-ke.md) | PO Lê Đình Tuấn |
| F5 | Đã lưu trạng thái mức trụ (migration 013); còn quy tắc ảnh hưởng trạng thái tổng của trụ/trạm | PO |
| Hiển thị | Trụ `ONLINE` có đầu nối `UNKNOWN` hiện “Sẵn sàng” (xanh) | PO / QA (Nguyễn Hà Nam) |
| Staging | Chạy 50 trụ ảo, WebSocket qua proxy Render, `TRUST_PROXY=2` | Phúc (cần URL staging) |
| Bản đồ | Kiểm tile OpenStreetMap thật trên mạng có Internet | QA |
| Jira | Đối chiếu trạng thái GYM-32…42 bằng API | Cần token |
