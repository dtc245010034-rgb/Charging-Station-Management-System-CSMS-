# Báo cáo vá lỗi và kiểm chứng vòng 6 — 03/10/2026

Người thực hiện: Phúc (cùng trợ lý AI). Môi trường: Node 22.23.3, PostgreSQL 16 (container cổng 5433), Docker 29.1.3, Chrome 150 headless.
Mọi con số dưới đây lấy từ lần chạy thật; mục nào chưa chạy được thì ghi "chưa kiểm chứng" kèm lý do.

## 1. Nhánh và PR

Tất cả bản vá đã gộp vào **một nhánh duy nhất `phuc/GYM-36-vong6-tong-hop`**, các nhánh `phuc/GYM-3x-*` cũ đã xoá. PR #68 (S-10), #69 (N2) và #70 (S-11) đã merge vào `main` (`884e654`). Nhánh tổng hợp đã ghép với `main` hiện tại: commit `65e3cc5` giải quyết xung đột với S-11 trong `status-notification.js` (giữ khử trùng F1 và vẫn phát sự kiện `fleet-status` khi trạng thái đầu nối đổi). Sau đó thêm `c1f0f18` (script kiểm chứng khớp hành vi ONLINE mới) và `2c30a45` (sửa regex IPv6).

Chưa mở được PR: phiên làm việc này không có `GH_TOKEN`/`gh` đã đăng nhập (đã cài `gh` 2.102.0, chưa đăng nhập). Cần mở **một PR** `phuc/GYM-36-vong6-tong-hop` → `main`, review thêm bởi Nguyễn Văn Hữu (có migration 012, đụng `ws-connection.js`/`server.js`), và nhờ Nguyễn Hà Nam xem lại đoạn ghép `status-notification.js` cùng hai dòng test sửa ở mục 7.

Nhánh `feat/s-11-fleet-status-copy` (Lâm) đã kiểm: cây thư mục giống hệt commit `e7f0fdd` đã merge qua #70, không thêm gì và không xử lý F5.

## 2. Từng bug: test viết trước, FAIL rồi PASS

| Mã | Mức | Test | Trước khi vá | Sau khi vá |
|---|---|---|---|---|
| F2/N5 | TB | `tests/unit/frontend.test.js` (3 test mới: `groupOf`/`statusLabel`, `pointGroup`/`worstGroup`/`countByGroup`) | 5 FAIL / 17 | 17/17 pass |
| F1 | TB–Thấp | `tests/unit/ocpp-status-notification.test.js`, `tests/integration/ocpp-status-notification-db.test.js` (30 tin đồng thời và tuần tự, Faulted→Available→Faulted, vendorErrorCode, cửa sổ 0 giây) | 20 FAIL | 32/32 pass |
| F4 | Thấp | `frontend.test.js` (F4), `ocpp-status-notification-db.test.js` (Unavailable) | F4 frontend: FAIL cùng lần chạy F2; nhãn "Tạm ngừng" sửa sau bằng test đỏ riêng (nhãn cũ "Không khả dụng" → FAIL) | pass; nhãn đầu nối là "Tạm ngừng" |
| F5 | Thấp | `ocpp-status-notification.test.js` (connectorId 0 trả `{}`, log gom, không ghi DB) | nằm trong 20 FAIL của nhóm unit status-notification ở dòng F1 | pass; hoãn lưu mức trụ (xem mục 6) |
| F6 | Thấp | `tests/unit/close-with-grace.test.js`, `tests/integration/station-lock-hung-client.test.js` | 4/4 FAIL trên `main` (DB vẫn `ONLINE` sau khoá) | pass; trụ treo về `UNKNOWN` sau 1521 ms trên server thật |
| N4 | TB | `tests/integration/ocpp-presence-lifecycle.test.js` (SIGTERM, SIGINT, dọn trụ mồ côi) | 4 FAIL / 6 (bản đầu) | 7/7 pass |
| F3 | TB–Thấp | cùng file trên (ngắt kết nối, S-13 không kéo kết nối mới về `UNKNOWN`) | gộp trong 4 FAIL trên | pass |
| N8 | Thấp | cùng file trên (hai Boot liên tiếp, giá trị mặc định rỗng) | `serial_number` `''` thay vì `SN-KEEP`, `firmware_version` `''` thay vì `1.0.0` | pass |
| Log DB sập (4.3d) | Thấp | `tests/unit/log-hygiene.test.js` (6 test: che host:port, IPv6 không che nhầm giờ `10:20:30`, AppError 5xx một dòng không stack, log lỗi khi tắt máy) | IPv6: `10:20:30` bị che nhầm → FAIL; tắt máy: `lộ host:port: [CSMS] Lỗi khi tắt máy: connect ECONNREFUSED 127.0.0.1:5441` → FAIL | 6/6 pass |
| Tools hard-code `admin/admin` | Thấp | `tests/unit/tools-no-hardcoded-credentials.test.js` | FAIL trên 4 script `tools/test-*-live.js` | pass; đọc `ADMIN_EMAIL`/`ADMIN_PASSWORD` từ môi trường |
| Heartbeat/khoá hàng | TB | `tests/integration/ocpp-heartbeat-row-lock.test.js` | FAIL: "Heartbeat bị treo 4002 ms" | pass; trả lời 3 ms |

Ghi chú:
- Đầu ra FAIL chi tiết của F2, S-10 và N4 nằm trong lịch sử chạy của phiên làm việc; số đếm ở bảng lấy từ các lần chạy đó. Đầu ra FAIL của F6 được tái hiện lại ngày 03/10 bằng cách chạy hai test F6 trên mã `main`.
- Không xoá hay làm yếu test nào. Hai dòng trong `ocpp-status-notification.test.js` được sửa vì hành vi cố ý đổi (xem mục 7 để QA xác nhận).

## 3. Số liệu test trước/sau

| Mốc | Tổng | Pass | Fail |
|---|---|---|---|
| Trước (hợp nhất `main` + #69 + #68, có Docker nên T-19 chạy) | 217 | 217 | 0 |
| + F6 | 221 | 221 | 0 |
| + S-10 | 245 | 245 | 0 |
| Nhánh N4 | 228 | 228 | 0 |
| Hợp nhất cuối `verify/round6-local` (lần 1 sau F1/F2/F4/F5 + N4 + F6) | 256 | 256 | 0 |
| Hợp nhất cuối + GYM-35 | 257 | 257 | 0 |
| Nhánh tổng hợp sau ghép S-11 (#70) và các vá log/tools | 280 | 280 | 0 |

Ba lần chạy liên tiếp trên nhánh tổng hợp `phuc/GYM-36-vong6-tong-hop`, lint sạch:

| Lần | Tổng | Pass | Fail | Skipped | Thời gian |
|---|---|---|---|---|---|
| 1 | 280 | 280 | 0 | 0 | 104,4 s |
| 2 | 280 | 280 | 0 | 0 | 114,4 s |
| 3 | 280 | 280 | 0 | 0 | 115,0 s |

- S-09 T-19 (cần Docker) chạy thật, không bỏ qua. Không có test chập chờn.
- Trước khi ghép S-11, bản 257 test cũng chạy 3 lần liên tiếp: 257/257 mỗi lần (81,1 s; 84,0 s; 85,9 s).
- `python3 -m unittest discover -s tools`: 20 test pass.
- Các script `tools/test-*-live.js` đã bỏ `admin/admin`, đọc thông tin đăng nhập từ biến môi trường (có test tĩnh chặn hard-code).

### Migration
Lên → xuống tới 009 → lên lại (đã chạy lần lượt): đạt trên DB rỗng và DB đã `seed-demo` (24 đầu nối còn nguyên sau chu trình). So sánh danh sách cột và chỉ mục trước/sau chu trình: giống hệt. Rollback 010 bỏ cột `ocpp_status` nên mất giá trị `ocpp_status` hiện có trong lúc đang ở 009; đây là hành vi đúng của migration 010.

## 4. Kịch bản server thật (`tools/verify-round6-live.js`)

Kết quả: 93 dòng, 93 ok, 0 FAIL, khoảng 36,5 s, chạy hai lần liên tiếp cùng kết quả. DB `csms_r6live_chk` tạo mới rồi xoá sau mỗi lần. Bảng đầy đủ: [`round6/live-server-result.md`](round6/live-server-result.md).

| Nhóm | Số dòng |
|---|---|
| Đăng nhập, RBAC | 10 |
| Tạo trạm/trụ (idempotency, mã sai/trùng, `connector_count` 0 và 5 → 400; 1 và 4 → 201) | 20 |
| Boot/Heartbeat/StatusNotification (9 trạng thái, trạng thái lạ, 16 payload sai hoặc vượt giới hạn, F1, F4, F5) | 25 |
| N8 | 3 |
| F3, B8, S-13 | 9 |
| N2 (khoá/mở khoá, trụ treo, 6 vòng đua khoá khi đang gửi tin) | 7 |
| B2, B3 | 4 |
| N4 (SIGTERM rồi SIGINT thoát mã 0, client nhận close 1001, khởi động dọn 2 trụ mồ côi) | 9 |
| B9 | 4 |
| Rò rỉ (log và CALLERROR không lộ mật khẩu, JWT, cookie, chi tiết Postgres) | 3 |

Quan sát: lần SIGTERM thứ hai giết tiến trình theo hành vi mặc định (dùng `process.once`) nên tính idempotent được kiểm bằng SIGTERM rồi SIGINT. SIGKILL để lại trụ `ONLINE` mồ côi, lần khởi động kế tiếp dọn được.

## 5. Bốn mục lưu ý

**4.1 Staging với 50 trụ ảo: chưa kiểm chứng staging.** Không có `STAGING_URL` và thông tin đăng nhập trong môi trường. Chưa có số p50/p95/p99, độ lệch `last_seen_at` và hành vi WebSocket qua proxy Render. Mục này vẫn là DoD chưa đạt của S-09.

**4.2 Bản đồ và giao diện: đã chạy** (`tools/verify-ui-round6.js`, kết quả và 22 ảnh ở [`ui-round6/`](ui-round6/README.md)). Tile OSM thay bằng PNG 256×256 trong suốt.
- Bản sau F2: 121/121 kiểm tra DOM; bản trước F2 (`main`): 66/121, cả 55 chỗ sai đều do F2 (mọi trụ ONLINE hiện "Ngoại tuyến / chưa rõ"; KPI 0/0/0/10). Ảnh "sau" đã chụp lại trên nhánh tổng hợp.
- 7 marker khớp 7 trạm có toạ độ, màu đúng cả 7 (trạm 3 trụ lấy màu xấu nhất); chú giải, bộ lọc, panel danh sách, popup, ngăn chi tiết trạm và trụ đều đúng; KPI 10 trụ: 4 sẵn sàng, 1 đang sạc, 2 lỗi, 3 ngoại tuyến (trụ ONLINE có tất cả đầu nối `UNAVAILABLE`, ví dụ Nha Trang, nay tính là ngoại tuyến; trụ ONLINE có đầu nối `UNKNOWN` vẫn "Sẵn sàng" theo quyết định của PO).
- Sau đăng nhập: 0 lỗi JS, 0 request hỏng, không tràn ngang ở 390 px.
- Chưa kiểm chứng: tile OSM thật (máy chạy kiểm thử không tới được `tile.openstreetmap.org`) trên mạng có Internet; chỉ chạy Chrome headless.

**4.3 Lỗi DB (B7, N1): đã chạy** (`tools/verify-db-fault-round6.js`; log trước/sau vá ở `round6/`).
- (a) Giết kết nối DB của ứng dụng, 5 vòng: 0 CALLERROR, phản hồi 13–17 ms, WebSocket không đóng.
- (b) Đổi tên bảng `charge_points` và cột `connectors.ocpp_status`: Boot/StatusNotification trả `InternalError "Internal error"` trong 10–18 ms, không bao giờ `Accepted`; phản hồi và log không lộ tên bảng, mã Postgres hay đường dẫn; `messageId` chứa xuống dòng không tạo được dòng log giả; sau khôi phục Boot `Accepted`.
- (c) Khoá hàng `FOR UPDATE`: `updateLastSeen` làm Heartbeat chờ đúng bằng thời gian khoá (6007 ms; 12 trụ cùng Heartbeat chậm nhất 6009 ms, pool chỉ 10 kết nối nên có nguy cơ cạn pool). Đã vá bằng `FOR UPDATE OF cp SKIP LOCKED` (nhánh GYM-35): Heartbeat trả lời 3 ms, 12 trụ chậm nhất 33 ms. Script: bản chưa vá 52 ok / 3 FAIL, bản vá 55 ok / 0 FAIL.
- (d) DB sập hẳn (`tools/verify-db-down-round6.js`, container Postgres riêng cổng 5441, log: [`round6/db-down.txt`](round6/db-down.txt)): **42 dòng, 42 ok, 0 FAIL** (lần chạy đầu: 40 ok / 2 FAIL, đã vá).
  - Đạt: Boot/StatusNotification trả `InternalError` (p50 3 ms, tối đa 6 ms vì pool nhận `ECONNREFUSED` ngay), không `Accepted`, WebSocket không đóng, server không crash, không có `unhandledRejection`/`uncaughtException`; `/api/health` trả 503 `DB_UNAVAILABLE`. Khi DB chạy lại: Boot `Accepted` sau 482 ms (lần thử thứ hai), Heartbeat ghi lại `last_seen_at`, không cần khởi động lại. SIGTERM lúc DB sập: thoát mã 1, client nhận close 1001; trụ tạm kẹt `ONLINE` đến lần khởi động sau (N4 dọn).
  - Hai rò rỉ log phía máy chủ đã vá: (1) `sanitizeErrorMessage` che `host:port`, IPv4/IPv6, mật khẩu trong URL Postgres, `password=`, host `ENOTFOUND`, xuống dòng; handler lỗi chung chỉ ghi một dòng `[HTTP] <status> <code>` cho `AppError` 5xx, không stack; (2) dòng `[CSMS] Lỗi khi tắt máy` trước đây in nguyên `connect ECONNREFUSED 127.0.0.1:5441`, nay đi qua `sanitizeErrorMessage` (phát hiện ở lần chạy lại, có test đỏ trước). Kiểm tra log của script chỉ bắt `host:port`, đường dẫn, mật khẩu; từ mã lỗi `ECONNREFUSED` không còn bị coi là rò rỉ vì không nhạy cảm (kiểm tra phản hồi CALLERROR gửi cho trụ vẫn chặn cả từ này).

**4.4 PR, CI, Jira: chưa xác minh bằng API.** Không có `gh` và token. Không biết trạng thái PR #68/#69, CI xanh hay chưa, trạng thái thẻ GYM-32…42.

## 6. Việc còn mở và đề xuất

| Mục | Tình trạng | Đề xuất |
|---|---|---|
| B5 xác thực trụ (Cao) | PO (qua Phúc) chọn **chỉ ghi nhận rủi ro**, không viết code. Đã ghi vào README "Giới hạn đã biết": chấp nhận cho demo/staging 03/10/2026, **không** chấp nhận cho production. Thiết kế phương án A giữ ở `docs/B5-xac-thuc-tru-de-xuat-thiet-ke.md` | PO Lê Đình Tuấn chốt trước khi lên production |
| K-01 Boot trùng `messageId` | Giữ nguyên, thuộc S-14 | Làm S-14 sớm |
| F5 trạng thái mức trụ (`connectorId=0`) | Trả `{}`, ghi log gom, chưa lưu DB. Đã kiểm S-11 (#70) và `feat/s-11-fleet-status-copy`: không bao phủ F5 | Phúc/PO chốt thiết kế cột hoặc bảng (`connector_errors.connector_id` đang `NOT NULL`) |
| Trụ ONLINE có đầu nối `UNKNOWN` | PO chọn **giữ xanh "Sẵn sàng"**; trụ ONLINE mà mọi đầu nối `UNAVAILABLE` nay hiện ngoại tuyến. Ghi trong README | QA (Nam) xác nhận |
| Tắt máy sạch (N4) chỉ đúng với một tiến trình server | Đã ghi trong OPERATIONS | Khi chạy nhiều bản sao, thay dọn khi khởi động bằng cơ chế theo phiên |
| 4.1 staging 50 trụ ảo | Chưa chạy: thiếu `STAGING_URL`, tài khoản trong môi trường; script `tools/verify-staging-50.js` chưa viết | Phúc cung cấp biến môi trường, rồi viết và chạy |
| 4.4 PR/CI/Jira bằng API | Chưa xác minh: phiên này chưa có `gh` đăng nhập/`GH_TOKEN` | Mở phiên Claude Code từ terminal đã có `GH_TOKEN`, hoặc `gh auth login` |
| Tile OSM thật | Chưa kiểm trên mạng có Internet | Chạy `tools/verify-ui-round6.js` trên máy có mạng |

Đã xong từ danh sách cũ: script `tools/*.js` bỏ `admin/admin`; regex IPv6 không che nhầm giờ; nhãn trụ `UNKNOWN` thống nhất "Ngoại tuyến / chưa rõ".

## 7. Chỗ sửa test hiện có để QA (Nguyễn Hà Nam) xác nhận

Chỉ trong `backend/tests/unit/ocpp-status-notification.test.js` (hành vi cố ý đổi ở F1/F5). Danh sách từng dòng sẽ nằm trong mô tả PR của nhánh `phuc/GYM-36-vong6-tong-hop`. Ngoài ra QA nên xem lại đoạn ghép `status-notification.js` với S-11 (commit `65e3cc5`). Test frontend chỉ được thêm, không sửa.

## 8. Tiến độ Sprint 2 (20 SP) theo thẻ Jira

Không đọc được Jira (không có token). Cột "Đang chờ merge" nghĩa là nằm trong nhánh tổng hợp, chưa có PR. Cột "Jira" chỉ điền khi CLAUDE.md nêu kỳ vọng (S-06, S-07, S-08, S-13 Done; S-09 review; S-10 In Progress), các thẻ còn lại ghi "chưa biết"; không có ô nào được xác minh bằng API.

| Thẻ | Story | SP | Jira (kỳ vọng, chưa xác minh) | Code đạt AC trên `main` | Đang chờ merge |
|---|---|---|---|---|---|
| GYM-32 | S-06 | 2 | Done | Có | — |
| GYM-33 | S-07 | 2 | Done | Có | — |
| GYM-34 | S-08 | 2 | Done | Có (#69 đã merge) | F6, N4/F3/N8 trong nhánh tổng hợp |
| GYM-35 | S-09 | 1 | Review | Có (T-19 pass) | Heartbeat khoá hàng, vá log trong nhánh tổng hợp |
| GYM-36 | S-10 | 2 | In Progress | Có (#68 đã merge) | F1/F2/F4/F5 trong nhánh tổng hợp |
| GYM-37 | S-11 | 3 | chưa biết | Có phần đã merge qua #70 (trạng thái đội trụ, SSE); F5 mức trụ chưa có | — |
| GYM-38 | S-12 | 2 | chưa biết | Chưa kiểm | — |
| GYM-39 | S-13 | 1 | Done | Có | — |
| GYM-40 | S-14 | 2 | chưa biết | Chưa | — |
| GYM-41 | S-15 | 2 | chưa biết | Chưa (Authorize còn là stub) | — |
| GYM-42 | S-16 | 1 | chưa biết | Chưa | — |

Điều chắc chắn từ lần chạy này (không tính trạng thái Jira): các phần S-08/S-09/S-10/S-13 đã kiểm trên server thật đạt (mục 4), kèm các bản vá đang chờ merge ở bảng mục 1. Cột "Code đạt AC trên main" cho S-12, S-14, S-15, S-16 chưa được đối chiếu lần này.
