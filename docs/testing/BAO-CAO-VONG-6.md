# Báo cáo vá lỗi và kiểm chứng vòng 6 — 03/10/2026

Người thực hiện: Phúc (cùng trợ lý AI). Môi trường: Node 22.23.3, PostgreSQL 16 (container cổng 5433), Docker 29.1.3, Chrome 150 headless.
Mọi con số dưới đây lấy từ lần chạy thật; mục nào chưa chạy được thì ghi "chưa kiểm chứng" kèm lý do.

## 1. Nhánh và PR

Chưa mở được PR: môi trường này không có `gh` và không có token GitHub/Jira. Các nhánh đã đẩy, cần người mở PR theo thứ tự:

| Nhánh | Nội dung | Dựa trên | Review thêm |
|---|---|---|---|
| `phuc/GYM-34-n2-terminate-tru-treo` | F6 | `main` | 1 người khác tác giả |
| `phuc/GYM-34-n4-f3-n8-tat-may-sach` | N4, F3, N8 | nhánh F6 (xếp chồng, merge sau F6) | thêm Nguyễn Văn Hữu (đụng `ws-connection.js`, `server.js`) |
| `phuc/GYM-36-status-notification-f1-f2-f4-f5` | F1, F2, F4, F5, migration 012 | `main` | thêm Nguyễn Văn Hữu (có migration) |
| `phuc/GYM-35-lastseen-khong-chan-heartbeat` | Heartbeat không chờ khoá hàng (phát hiện ở 4.3) | `main` | 1 người khác tác giả |
| `phuc/GYM-37-b5-thiet-ke-xac-thuc-tru` | Đề xuất thiết kế B5, không có code | `main` | PO Lê Đình Tuấn chọn phương án |
| `phuc/GYM-36-bao-cao-kiem-chung-vong6` | Báo cáo này, script `tools/`, ảnh chụp, cập nhật README và SPRINT_STATUS | `main` | 1 người khác tác giả |

PR #68 và #69 chưa kiểm tra được trạng thái merge (không có `gh`), nên các bản vá nằm ở nhánh riêng thay vì thêm commit vào nhánh của #68/#69. Nếu hai PR đó còn mở, có thể cherry-pick commit tương ứng vào đó.

Hợp nhất cục bộ `verify/round6-local` (không đẩy) gồm F6 + N4 + S-10 + F1/F2/F4/F5 + GYM-35, dùng để chạy bộ kiểm tra tổng.

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

Ba lần chạy liên tiếp trên hợp nhất cuối, sau khi lint sạch:

| Lần | Tổng | Pass | Fail | Skipped | Thời gian |
|---|---|---|---|---|---|
| 1 | 257 | 257 | 0 | 0 | 81,1 s |
| 2 | 257 | 257 | 0 | 0 | 84,0 s |
| 3 | 257 | 257 | 0 | 0 | 85,9 s |

- S-09 T-19 (cần Docker) chạy thật, không bỏ qua. Không có test chập chờn.
- Trước đó, bản 256 test cũng chạy 3 lần liên tiếp: 256/256 mỗi lần (72,0 s; 74,4 s; 79,1 s).
- `python3 -m unittest discover -s tools`: 20 test pass.
- Các script cũ `tools/*.js` còn hard-code `admin/admin`; chưa sửa trong lần này, cần một thẻ riêng.

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
- Bản sau F2: 121/121 kiểm tra DOM; bản trước F2 (`main`): 66/121, cả 55 chỗ sai đều do F2 (mọi trụ ONLINE hiện "Ngoại tuyến / chưa rõ"; KPI 0/0/0/10).
- 7 marker khớp 7 trạm có toạ độ, màu đúng cả 7 (trạm 3 trụ lấy màu xấu nhất); chú giải, bộ lọc, panel danh sách, popup, ngăn chi tiết trạm và trụ đều đúng; KPI 10 trụ: 5 sẵn sàng, 1 đang sạc, 2 lỗi, 2 ngoại tuyến.
- Sau đăng nhập: 0 lỗi JS, 0 request hỏng, không tràn ngang ở 390 px.
- Chưa kiểm chứng: tile OSM thật trên mạng có Internet; chỉ chạy Chrome headless.

**4.3 Lỗi DB (B7, N1): đã chạy** (`tools/verify-db-fault-round6.js`; log trước/sau vá ở `round6/`).
- (a) Giết kết nối DB của ứng dụng, 5 vòng: 0 CALLERROR, phản hồi 13–17 ms, WebSocket không đóng.
- (b) Đổi tên bảng `charge_points` và cột `connectors.ocpp_status`: Boot/StatusNotification trả `InternalError "Internal error"` trong 10–18 ms, không bao giờ `Accepted`; phản hồi và log không lộ tên bảng, mã Postgres hay đường dẫn; `messageId` chứa xuống dòng không tạo được dòng log giả; sau khôi phục Boot `Accepted`.
- (c) Khoá hàng `FOR UPDATE`: `updateLastSeen` làm Heartbeat chờ đúng bằng thời gian khoá (6007 ms; 12 trụ cùng Heartbeat chậm nhất 6009 ms, pool chỉ 10 kết nối nên có nguy cơ cạn pool). Đã vá bằng `FOR UPDATE OF cp SKIP LOCKED` (nhánh GYM-35): Heartbeat trả lời 3 ms, 12 trụ chậm nhất 33 ms. Script: bản chưa vá 52 ok / 3 FAIL, bản vá 55 ok / 0 FAIL.
- Chưa đo: DB sập hẳn (không dừng được Postgres 5433 dùng chung); chặn tối đa theo `connectionTimeoutMillis` 2 giây.

**4.4 PR, CI, Jira: chưa xác minh bằng API.** Không có `gh` và token. Không biết trạng thái PR #68/#69, CI xanh hay chưa, trạng thái thẻ GYM-32…42.

## 6. Việc còn mở và đề xuất

| Mục | Tình trạng | Đề xuất |
|---|---|---|
| B5 xác thực trụ (Cao) | Chưa có code. Thiết kế ở `docs/B5-xac-thuc-tru-de-xuat-thiet-ke.md` (nhánh GYM-37): Basic Auth Security Profile 1, hash argon2id, cờ `OCPP_AUTH_MODE` | PO Lê Đình Tuấn chọn phương án A hay B (chấp nhận rủi ro cho demo) |
| K-01 Boot trùng `messageId` | Giữ nguyên, thuộc S-14 | Làm S-14 sớm |
| F5 trạng thái mức trụ (`connectorId=0`) | Trả `{}`, ghi log gom, chưa lưu DB | Phúc/PO chốt thiết kế cột hoặc bảng cho S-11 |
| Trụ ONLINE nhưng mọi đầu nối `UNAVAILABLE`/`UNKNOWN` vẫn hiện "Sẵn sàng" (xanh) | Phát hiện ở 4.2, chưa vá | PO/QA quyết định: hiện "Sẵn sàng (đầu nối không khả dụng)" hay nhóm xấu hơn |
| Trụ `UNKNOWN` hiện nhãn "Chưa rõ", chú giải ghi "Ngoại tuyến / chưa rõ" | Có từ trước F2 | Thống nhất một nhãn |
| Tắt máy sạch (N4) chỉ đúng với một tiến trình server | Đã ghi trong OPERATIONS | Khi chạy nhiều bản sao, thay dọn khi khởi động bằng cơ chế theo phiên |
| Script cũ `tools/*.js` hard-code `admin/admin` | Chưa sửa | Tạo thẻ riêng, đọc thông tin từ biến môi trường |

## 7. Chỗ sửa test hiện có để QA (Nguyễn Hà Nam) xác nhận

Chỉ trong `backend/tests/unit/ocpp-status-notification.test.js` (hành vi cố ý đổi ở F1/F5). Danh sách từng dòng nằm trong mô tả PR của nhánh `phuc/GYM-36-status-notification-f1-f2-f4-f5`. Test frontend chỉ được thêm, không sửa.

## 8. Tiến độ Sprint 2 (20 SP) theo thẻ Jira

Không đọc được Jira (không có token). Cột "Jira" chỉ điền khi CLAUDE.md nêu kỳ vọng (S-06, S-07, S-08, S-13 Done; S-09 review; S-10 In Progress), các thẻ còn lại ghi "chưa biết"; không có ô nào được xác minh bằng API.

| Thẻ | Story | SP | Jira (kỳ vọng, chưa xác minh) | Code đạt AC trên `main` | Đang chờ merge |
|---|---|---|---|---|---|
| GYM-32 | S-06 | 2 | Done | Có | — |
| GYM-33 | S-07 | 2 | Done | Có | — |
| GYM-34 | S-08 | 2 | Done | Có | F6, N4/F3/N8 |
| GYM-35 | S-09 | 1 | Review | Có (T-19 pass) | GYM-35 khoá hàng |
| GYM-36 | S-10 | 2 | In Progress | Một phần (#68) | F1/F2/F4/F5 |
| GYM-37 | S-11 | 3 | chưa biết | Một phần (khung giao diện, polling 15 s) | — (SSE và truy vấn cây chưa làm) |
| GYM-38 | S-12 | 2 | chưa biết | Chưa kiểm | — |
| GYM-39 | S-13 | 1 | Done | Có | — |
| GYM-40 | S-14 | 2 | chưa biết | Chưa | — |
| GYM-41 | S-15 | 2 | chưa biết | Chưa (Authorize còn là stub) | — |
| GYM-42 | S-16 | 1 | chưa biết | Chưa | — |

Điều chắc chắn từ lần chạy này (không tính trạng thái Jira): các phần S-08/S-09/S-10/S-13 đã kiểm trên server thật đạt (mục 4), kèm các bản vá đang chờ merge ở bảng mục 1. Cột "Code đạt AC trên main" cho S-12, S-14, S-15, S-16 chưa được đối chiếu lần này.
