# CLAUDE.md — CSMS (Hệ thống quản lý trạm sạc xe điện)

Tài liệu cho các phiên Claude Code làm việc trong repo này. Tóm tắt dự án, quy tắc làm việc với người dùng, những gì đã làm, những bài học và việc còn mở. Cập nhật lần cuối: **30/9/2026**. Tài liệu đầy đủ nằm ở `README.md`, `docs/OPERATIONS.md`, `docs/SPRINT_STATUS.md`, `docs/SPRINT_2_PLAN.md`; file này không thay thế chúng.

## 1. Người dùng và cách làm việc

- **Nguyễn Anh Phúc**, Scrum Master, nhóm Team-CodeGym (9 người), đồ án ICTU × CodeGym. Trưởng nhóm kỹ thuật: Nguyễn Văn Hữu. PO/Mentor: Lê Đình Tuấn. Đây là dự án **thực hành**, không phải sản phẩm thương mại.
- **Trả lời bằng tiếng Việt**, chi tiết, đi thẳng vào vấn đề, **phản biện thẳng, không chiều người dùng**, không dùng "chắc là/có thể" khi có dữ liệu để kiểm chứng. Khi chưa chắc phải nói rõ "chưa kiểm chứng" và nói cách kiểm chứng.
- Việc lớn: hỏi lại trước, đưa đề xuất tối ưu. Việc đã chốt: làm ngay, không hỏi lại.
- Tra web khi cần số liệu ngoài (giá, giới hạn dịch vụ) và dẫn nguồn. Trong môi trường này nhiều domain bị chặn (render.com, Jira); WebSearch dùng được.
- Nhóm dev yếu kỹ năng và hay lạm dụng AI nên hệ thống từng chưa ổn định: **kiểm chứng bằng chạy thật**, đừng tin báo cáo/AI khác (kể cả báo cáo QA) mà không đối chiếu code.

## 2. Quy tắc git (bắt buộc)

- Commit **dưới tên người dùng** (`Nguyễn Anh Phúc <dtc245010034@ictu.edu.vn>`), **không** thêm `Co-Authored-By: Claude`, `Claude-Session:` hay dòng "Generated with Claude Code" vào commit/PR. Người dùng đã yêu cầu rõ điều này.
- Nhánh đặt tên `phuc/GYM-<mô-tả>` (hoặc `phuc/<mô-tả>`). Mỗi việc một nhánh **từ `origin/main` mới nhất**. Không đẩy vào `main`.
- **Không tự tạo PR** trừ khi được yêu cầu. Người dùng tự tạo và merge PR (đã có #41–#51). PR do giao diện Claude Code tạo thì đẩy thêm commit vào nhánh là PR tự cập nhật.
- Push: `git push -u origin <nhánh>`. Chỉ force-push (`--force-with-lease`) nhánh do chính mình vừa tạo và chưa ai dùng.
- File `.github/workflows/ci.yml` dùng **CRLF**: giữ nguyên khi sửa.
- Không commit `.env`, `*.cookie`, `.run/`, `__pycache__/` (đã có trong `.gitignore`).

## 3. Dự án

**Stack:** Node ≥ 22.7, Express 5, PostgreSQL 16, Zod, argon2id, JWT trong cookie httpOnly, thư viện `ws`; frontend JS thuần (ES modules, không build), Leaflet nhúng sẵn; Docker Compose; GitHub Actions; staging Render (`render.yaml`, `autoDeployTrigger: checksPass`).

```
backend/     src/ (app, modules/, security/, db/, config/), migrations/ (001–005, có up/down), scripts/, tests/{unit,integration,acceptance}
frontend/    app/ (router hash, status.js, permissions.js), services/realtime.js (đang polling 15 giây), styles, vendor
docs/        OPERATIONS, SPRINT_STATUS, SPRINT_2_PLAN, TEST_INVENTORY, PROJECT_STRUCTURE, spikes/ (K-01 OCPP), design/ (spec UX + 30 ảnh chụp)
run.py       chạy bằng Docker (một lệnh); test.py chạy toàn bộ test; tools/test_run.py = test của run.py
```

**Kiến trúc/quy ước đã có (đừng phá):**
- RBAC qua `secureRouter()` + `permissions.js`, có luật ESLint chặn route không qua guard. 5 vai trò: `ADMIN`, `STATION_OWNER`, `OPERATOR`, `ACCOUNTANT`, `DRIVER`. Chủ trạm bị giới hạn theo sở hữu bằng `scopeByOwner`.
- `POST /api/stations` bắt buộc `Idempotency-Key`. Mã trụ (`charge_points.code`) viết hoa.
- Ghi (POST/PUT/PATCH/DELETE) kiểm `Origin` phải khớp `APP_ORIGIN` (có thể là danh sách phân cách dấu phẩy) → sai origin là 403.
- Frontend: `#/<workspace>/<page>/<id>?query`, 5 workspace; 9 trạng thái OCPP gom nhóm ở `app/status.js`; DOM dựng bằng helper `h()` (không `innerHTML` với dữ liệu người dùng). Mục menu chưa làm ẩn bằng `enabled:false` + `since`.
- Test `no-backdoor`: chữ `admin`/mật khẩu mặc định **chỉ được nằm trong `run.py`**, không nằm trong `backend/`.
- Có **hai file `.env` độc lập**: `.env` gốc (Docker Compose) và `backend/.env` (Node chạy trực tiếp; có `DATABASE_URL`). Backend không đọc `.env` gốc. Mật khẩu chứa `#` phải bọc ngoặc kép (dotenv cắt phần sau `#`).

## 4. Lệnh thường dùng

```
python run.py                       # build + chạy + admin + demo (Docker); --port, --no-open, --no-demo, --rebuild
python run.py down | reset | logs | status
python run.py --public-url https://<tên>.ngrok-free.app   # staging công khai; --local để quay về
python test.py                      # lint + toàn bộ test trong container Node 22 (--only unit|integration|acceptance, --file <f>, --lint-only)
python3 -m unittest discover -s tools   # test của run.py, không cần Docker
cd backend && npm run lint && npm test  # cần Postgres test cổng 5433 hoặc TEST_DATABASE_URL (DB tên kết thúc _test)
```

Trạng thái kiểm tra gần nhất (30/9): lint sạch, **140/140 test backend**, **20/20 test `run.py`**. CI có job `lint-and-test` (Linux) và `test-windows` (mới thêm, **chưa thấy chạy xanh trên runner thật**: bước khởi động PostgreSQL có thể cần chỉnh).

Tài khoản chạy local: `admin@csms.local` / `admin`; demo `owner@`, `owner2@`, `operator@`, `accountant@`, `driver@`, `multi@` + `demo.csms.local` / `demo12345`. Chỉ tạo mật khẩu yếu khi `BIND_HOST=127.0.0.1` **và** không ở chế độ công khai; `create-admin` từ chối mật khẩu yếu khi `NODE_ENV=production`.

## 5. Những gì đã làm trong phiên (theo thứ tự)

1. Đọc toàn bộ dự án và backlog Jira (qua file CSV xuất; không truy cập được Jira/Chrome).
2. Hoàn tất Sprint 1: cấu hình staging Render, dữ liệu demo (`seed-demo.js`), ổn định test (`CSMS_SKIP_DOTENV=1`).
3. Thiết kế lại toàn bộ frontend theo spec UX Level 3, chụp 30 màn hình vào `docs/design/screenshots/`.
4. Hoàn thiện spike **K-01** (OCPP): chọn `ocpp-rpc`; phát hiện thư viện không tự từ chối subprotocol sai, chạy lại handler khi trùng `messageId`, `MeterValues.transactionId` tuỳ chọn, `Authorize.idTag` ≤ 20 ký tự. Tài liệu ở `docs/spikes/`.
5. Cập nhật toàn bộ tài liệu vận hành/tổng quan/tiến độ sprint.
6. Lập kế hoạch Sprint 2 (S-06…S-16, 20 SP) và kế hoạch cho 25 SP chưa xếp sprint.
7. `run.py` + `test.py` + `tools/test_run.py`: chạy Docker một lệnh, tự chọn cổng, sinh bí mật, tạo admin/demo, các lệnh con.
8. Sửa các lỗi do người dùng/QA tìm ra: tag image docker-compose v1 (`image: csms_app:latest`), deadlock `.env`/`reset` (điền giá trị tạm cho `down`, hỏi xoá volume khi mất `.env`), test S-02 hỏng trên Windows (`path.sep`), hướng dẫn curl PowerShell (`--%`), `start:staging` chạy trên Windows, tài liệu `backend/.env`.
9. Chế độ `--public-url` cho staging công khai qua tunnel (xem mục 6).
10. Chốt Q1–Q4 của Sprint 2 và ghi vào `docs/SPRINT_2_PLAN.md`.

## 6. Quyết định đã chốt

- **OCPP:** dùng `ocpp-rpc` (strictMode, subprotocol `ocpp1.6`, tự kiểm subprotocol trong `auth`). PO chọn **phương án A: cam kết đủ 20 SP**. Chuỗi bắt buộc S-06→S-07→S-08→S-09→S-10→S-11 (12 SP); goal cần **15 SP (S-06…S-13)**; S-15 là **Must**; thứ tự cắt khi thiếu: **S-16 → S-15 → S-14**.
- **Q1:** "khoá bởi quản trị" = cột `stations.locked_at` (+ `locked_by`), không thêm trạng thái vào `status`. Trạm khoá → `BootNotification` `Rejected`; `INACTIVE`/`MAINTENANCE` vẫn `Accepted` nhưng `Authorize` → `Blocked`. Kèm endpoint admin `PATCH /api/admin/stations/:id/lock` (T-16b).
- **Q2:** `OCPP_HEARTBEAT_INTERVAL` mặc định **60 giây** (test đặt 5), lưu theo từng trụ; ngoại tuyến khi `last_seen_at` quá 2 × interval. (Đề xuất ban đầu là 300 nhưng chậm: 10 phút mới hiện ngoại tuyến.)
- **Q3:** dùng **SSE** cho S-11 (AC ≤ 1 giây; polling hiện 15 giây). Cần kiểm tra middleware nén không gom bộ đệm; giữ polling làm dự phòng.
- **Q4 (staging):** laptop Linux homelab chạy `run.py --public-url` + **ngrok gói miễn phí** (tên miền tĩnh miễn phí); Render giữ dự phòng. Người giữ tài khoản/quyền: Phúc. Giới hạn ngrok miễn phí: ~20.000 yêu cầu HTTP và 1 GB mỗi tháng → trụ ảo và test tự động chạy ngay trên máy chủ (gọi `localhost`), đừng để tab dashboard polling mở cả ngày qua ngrok trước khi có SSE.
- **`--public-url`:** giữ `APP_ORIGIN`, `NODE_ENV=production` (cookie `Secure`), `TRUST_PROXY=1`, ép `BIND_HOST=127.0.0.1`, mật khẩu admin/demo ngẫu nhiên, **từ chối chạy nếu DB còn tài khoản mật khẩu mặc định**.

## 7. Bài học / cạm bẫy đã gặp

- docker-compose v1 tự đặt tag `<thư-mục>_app`; thư mục clone mặc định kết thúc bằng `-` → tag không hợp lệ. Đã cố định `image: csms_app:latest`. Compose v2 không dính.
- `docker-compose.yml` dùng `${VAR:?}` nên **mọi lệnh compose (kể cả `down -v`) đều cần `POSTGRES_PASSWORD` và `JWT_SECRET`**; `run.py` điền giá trị tạm qua `compose_env()`.
- `run.py` từng ghi đè `APP_ORIGIN` về `localhost` mỗi lần chạy và coi máy là "cục bộ" chỉ dựa vào `BIND_HOST` (tunnel làm lộ `admin/admin`). Đã xử lý bằng chế độ công khai.
- Test dùng đường dẫn hard-code `'/backend/src/'` hỏng trên Windows (`\`). CI chỉ chạy Linux nên lọt → đã thêm job `test-windows`.
- Một báo cáo QA đã chép log cũ của lỗi đã sửa (nhãn thời gian trước bản sửa) → luôn đối chiếu ngày/commit của log.
- Cách sửa QA đề xuất không phải lúc nào cũng đúng (ví dụ "đọc `.env` gốc" cho backend sẽ vẫn thiếu `DATABASE_URL`). Kiểm chứng trước khi áp dụng.
- Docker giả (`fake docker`) dùng để thử `run.py` trong sandbox không có Docker daemon **không tạo lại container khi đổi biến môi trường** như Docker thật; đừng kết luận từ đó về hành vi `APP_ORIGIN`.

## 8. Môi trường sandbox (khi làm việc từ xa)

- Không có Docker daemon, Jira, Render, ngrok, Windows: `run.py` chỉ kiểm bằng docker giả + backend/Postgres thật. **Đường Windows/PowerShell/Docker thật chưa được kiểm chứng bởi Claude**; nhờ QA/người dùng thử.
- Postgres cục bộ: `service postgresql start`; test dùng `TEST_DATABASE_URL=postgresql://csms:csms_test_only@localhost:5432/csms_test`.
- Đừng dùng `pkill -f` (từng giết chính shell); dùng PID.
- Không dùng `gh`; dùng công cụ MCP `mcp__github__*`.

## 9. Việc còn mở

- **Sprint 2 chưa bắt đầu code.** Khi bắt đầu: nhánh mới từ `main`; làm S-06 + S-13 cùng migration `006…` (`last_seen_at`, `heartbeat_interval`, `raw_status`, `connector_errors`, `ocpp_messages`, `id_tags`, `stations.locked_at`, …); module `backend/src/modules/ocpp/`; handler phải idempotent (xử lý hai lần = một lần). Chi tiết từng story, lane và lịch: `docs/SPRINT_2_PLAN.md` (lịch do Phúc điều phối, mốc ngày chỉ là đề xuất).
- **Q5** (phân làn/người) chưa điền.
- Chưa thử `--public-url` với ngrok thật; chưa thử WebSocket trụ ảo ở máy khác đi qua tunnel; job `test-windows` chưa xác nhận xanh; cách `curl.exe --%` trên PowerShell chờ QA xác nhận.
- Homelab: cần SSH khoá, sao lưu `pg_dump`, `restart: unless-stopped`, người dự phòng; chỉ deploy từ `main` khi CI xanh (không có cổng CI tự động như Render).
- Render staging chưa bật; R-02 (tài khoản sandbox thanh toán) chưa có hồ sơ; kế hoạch 25 SP chưa xếp sprint chờ duyệt (S-61 làm trước, S-65 cắt); Jira Sprint 3–8 chưa tạo.
