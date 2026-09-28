# Tình trạng dự án và sprint — CSMS

> Cập nhật: **28/9/2026** (cuối Sprint 1, đầu Sprint 2). Nguồn: Jira bảng GYM, file backlog của PO, mã nguồn và kết quả chạy thật (`npm run lint`, `npm test`, chạy app trên trình duyệt).
> Định nghĩa Done chính thức theo Jira và Definition of Done trong backlog; tài liệu này ghi thêm **bằng chứng** và **chỗ chưa đạt**.

## 1. Tóm tắt một trang

| Mục | Giá trị |
|---|---|
| Dự án | Nền tảng vận hành trạm sạc xe điện (CSMS) — Đồ án TTCS ICTU × CodeGym, nhóm TTCS_T926_K8S4_N3, 9 thành viên |
| Product Goal | Nắm mọi phiên sạc thời gian thực qua OCPP 1.6J, tính đúng tiền theo biểu giá nhiều khung giờ, không để trạm vượt công suất, đối soát doanh thu khớp kWh |
| Thời gian | 21/9 – 26/10/2026, sprint 1 tuần (5 ngày làm việc), đơn vị ước lượng story point |
| Sprint 1 (21–28/9) | **12/12 SP hoàn thành** trên Jira (trừ việc chuẩn bị demo GYM-14 đang làm). Demo Thứ Tư 30/9 |
| Sprint 2 (28/9–5/10) | Kế hoạch 20 SP, 11 story (GYM-32…42), **chưa bắt đầu code** |
| Chất lượng hiện tại | Lint sạch · **138/138 test tự động pass** · giao diện mới đã chạy thử trên trình duyệt (Chromium) |
| Cảnh báo lịch | Backlog có 8 sprint nhưng chỉ còn khoảng 5 tuần: thực tế tới Sprint 5. Phạm vi cuối do PO chốt |

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

## 3. Hệ thống hiện có gì

| Lớp | Có | Chưa có |
|---|---|---|
| Nền tảng | Express 5 + PostgreSQL 16, Docker Compose, migration 001–005 (tiến/lùi), CI, Dockerfile chạy user thường + healthcheck, blueprint Render | Staging đang chạy thật, sao lưu tự động (S-62), thống kê sức khoẻ (S-63) |
| Tài khoản & quyền | Đăng ký công khai (luôn Tài xế), Quản trị tạo mọi vai trò, đăng nhập, khoá tạm, RBAC 5 vai trò, cô lập dữ liệu theo chủ trạm, audit truy cập trái phép | Danh sách/khoá tài khoản (S-61), đổi/quên mật khẩu |
| Trạm – trụ – đầu nối | API tạo/sửa/xem (có lọc theo chủ sở hữu), mã trụ duy nhất, toạ độ, chống bấm hai lần | Tạm ngừng trạm có hiệu lực với phiên (S-66), chặn đổi mã khi có phiên |
| OCPP | `ws://…/ocpp/<mã>` trả lời tĩnh 4 loại tin (**mã spike, không lưu DB, nhận mọi mã trụ**) | Toàn bộ Sprint 2–3: xác thực trụ, khung CALL chuẩn, lưu trạng thái, phiên sạc |
| Giao diện | Đăng nhập/đăng ký; workspace Vận hành, Chủ trạm, Quản trị, Kế toán (khung), Tài xế (khung, mobile) | Cảnh báo, phiên sạc, điều khiển từ xa, ví, hoá đơn, đặt chỗ, đối soát |
| Tiền, ví, biểu giá, công suất, đặt chỗ, đối soát | — | Sprint 4–8 |

Chi tiết từng màn hình và ai thao tác được: xem README mục 2 và ảnh chụp trong `docs/design/screenshots/`.

## 4. Sprint 2 — “Trụ ảo nối vào hệ thống được xác thực; vận hành viên thấy đúng trạng thái mọi trụ” (28/9 – 5/10, 20 SP)

Tất cả đang **To Do**, chưa gán người. Bổ sung từ kết quả K-01:

| Jira | Story | SP | Phụ thuộc | Ghi chú từ K-01 |
|---|---|---|---|---|
| GYM-32 | S-06 Trụ đã đăng ký kết nối, trụ lạ bị từ chối | 2 | S-05, K-01 | Tự kiểm subprotocol `ocpp1.6` (thư viện mặc định không chặn); mã trụ chuẩn hoá chữ hoa khi tra bảng; mã lạ → HTTP 404 lúc bắt tay |
| GYM-33 | S-07 Đọc/ghi đúng ba loại khung | 2 | S-06 | Khung sai schema → `CALLERROR`, không đóng kết nối; cân nhắc dùng `ocpp-rpc` thay tự viết (T-14/T-15) |
| GYM-34 | S-08 `BootNotification` | 2 | S-06 | Lưu vendor/model/serial/firmware; `interval` chỉ là gợi ý |
| GYM-35 | S-09 Nhịp tim, thời điểm liên lạc cuối | 1 | S-08 | Dùng giờ máy chủ DB |
| GYM-36 | S-10 `StatusNotification` từng đầu nối | 2 | S-08 | `connectorId = 0` là cả trụ; `timestamp` có thể vắng → dùng giờ nhận |
| GYM-37 | S-11 Màn hình trạng thái mọi trụ, tự cập nhật | 3 | S-10 | Khung giao diện đã có; cần nguồn dữ liệu và kênh đẩy (SSE); hiện polling 15 giây |
| GYM-38 | S-12 Quá hạn nhịp tim → ngoại tuyến | 2 | S-09 | Suy từ `last_seen_at`, không phụ thuộc job chạy hay không |
| GYM-39 | S-13 Trùng mã trụ → đóng kết nối cũ | 1 | S-06 | Registry hiện chỉ đếm, phải giữ socket; làm chung với S-06 |
| GYM-40 | S-14 Tin nhắn trùng mã nhận lại câu trả lời cũ | 2 | S-08 | **Có bằng chứng cần thiết**: gửi lại cùng `messageId` tạo hai `transactionId` |
| GYM-41 | S-15 Xác thực thẻ qua `Authorize` | 2 | S-08 | `idTag` tối đa 20 ký tự; log chỉ 4 ký tự cuối |
| GYM-42 | S-16 Khởi động lại trụ từ xa (`Reset`) | 1 | S-07 | Should — có thể dời sang Sprint 3 làm cùng RemoteStop |

**Rủi ro Sprint 2:** kế hoạch 20 SP là **+67%** so với 12 SP của Sprint 1 trong lúc cả nhóm làm OCPP lần đầu (R-05, R-09). Đề xuất để PO cân nhắc: dời S-16, dùng polling thay SSE ở S-11, dời S-15 sang Sprint 3 nếu trễ. Chưa quyết.

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
| Review bởi người khác | Theo quy ước PR (chưa có PR nào cho ba nhánh mới) |
| Unit test cho nhánh logic mới | Đạt: 138 test |
| CI xanh (build, lint, test) | Đạt trên `main` cũ; nhánh mới đã chạy cục bộ. **Chưa có `typecheck`** (dự án JS thuần) |
| Quét phụ thuộc sạch | Đạt: `npm audit --omit=dev` = 0 lỗ hổng, đã thêm vào CI |
| AC pass trên staging với trụ ảo chạy thật | **Chưa đạt** — chưa có staging chạy; trụ ảo mới ở spike |
| Không log dữ liệu định danh / mã thẻ | Đạt với mã hiện có (chưa có xử lý thẻ) |
| README cập nhật | Đạt (28/9) |

## 8. Nhánh Git hiện có (chưa merge vào `main`)

| Nhánh | Nội dung | Kiểm tra |
|---|---|---|
| `phuc/fix-frontend` | Giao diện mới + ảnh chụp + thiết kế | lint sạch, 134 test |
| `phuc/GYM-14-staging-demo` | `render.yaml`, Dockerfile, CI, seed demo | 131 test |
| `phuc/GYM-12-k01-hoan-thien` | K-01 hoàn thiện | chạy lại được `run-all.js` |
| `phuc/docs-cap-nhat` | Gộp cả ba + tài liệu này | lint sạch, **138/138 test** |

Ba nhánh đầu gộp với nhau không xung đột (đã thử). Nhánh cũ `claude/focused-einstein-g66f92` chứa cùng nội dung nhưng có tên Claude — nên xoá sau khi merge.
