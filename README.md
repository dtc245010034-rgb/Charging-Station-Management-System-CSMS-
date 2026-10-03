# CSMS · Nền tảng vận hành trạm sạc xe điện

Đồ án Thực tập cơ sở ICTU × CodeGym · nhóm **TTCS_T926_K8S4_N3** · PO: Mentor Lê Đình Tuấn · dự án 21/9 – 26/10/2026.

**Mục tiêu sản phẩm:** đơn vị vận hành nắm được mọi phiên sạc theo thời gian thực qua OCPP 1.6J, tính đúng tiền theo biểu giá nhiều khung giờ, không để trạm vượt công suất, và đối soát doanh thu khớp với số kWh đã cấp.

> **Ràng buộc:** thanh toán chỉ chạy môi trường sandbox. Vị trí và lịch sử di chuyển của tài xế là dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.

## Bắt đầu nhanh

Cần: **Git**, **Docker**, **Python 3.8+**. Không cần cài Node, Postgres hay tự tạo `.env`.

```bash
git clone https://github.com/dtc245010034-rgb/Charging-Station-Management-System-CSMS-.git
cd Charging-Station-Management-System-CSMS-
python run.py          # Windows: py run.py   |   Linux/macOS: python3 run.py
```

Lần đầu mất vài phút (build image). Xong, trình duyệt tự mở `http://localhost:3000`; đăng nhập bằng `admin@csms.local` / `admin` (chỉ trên máy cá nhân, xem [Tài khoản](#tài-khoản-có-sẵn)).

| Tôi muốn… | Lệnh |
|---|---|
| Chạy dự án | `python run.py` |
| Chạy toàn bộ kiểm thử (lint + test) | `python test.py` |
| Dừng, giữ dữ liệu | `python run.py down` |
| Xoá sạch dữ liệu làm lại | `python run.py reset` |
| Đọc quy ước nhánh/commit/PR | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Hiểu dự án đang ở đâu | [Trạng thái dự án](#trạng-thái-dự-án-0310) |

## Mục lục

1. [Trạng thái dự án](#trạng-thái-dự-án-0310)
2. [Chạy dự án](#1-chạy-dự-án) · [Tài khoản có sẵn](#tài-khoản-có-sẵn) · [Biến môi trường](#biến-môi-trường)
3. [Dùng thử hệ thống](#2-dùng-thử-hệ-thống) · [Tạo tài khoản](#tạo-tài-khoản) · [Dữ liệu demo](#dữ-liệu-demo) · [Thử trụ sạc ảo (OCPP)](#thử-trụ-sạc-ảo-ocpp)
4. [Kiểm thử](#3-kiểm-thử)
5. [Staging trên Render](#4-staging-trên-render)
6. [Gặp lỗi thường gặp](#5-gặp-lỗi-thường-gặp)
7. [Tổng quan hệ thống](#6-tổng-quan-hệ-thống) · [Giới hạn đã biết](#giới-hạn-đã-biết)
8. [Cấu trúc thư mục](#7-cấu-trúc-thư-mục) · [Tài liệu liên quan](#8-tài-liệu-liên-quan)

---

## Trạng thái dự án (03/10)

*Cập nhật 03/10/2026, khớp `main` sau PR #74. Trạng thái Done chính thức theo Jira (bảng GYM, **chưa đối chiếu bằng API** trong lần cập nhật này); bảng đầy đủ: [`docs/SPRINT_STATUS.md`](docs/SPRINT_STATUS.md).*

| Hạng mục | Tình trạng |
|---|---|
| Sprint 1 (21–28/9) | **12/12 SP xong**: khung dự án, đăng nhập, phân quyền, trạm/trụ/đầu nối, spike OCPP |
| Sprint 2 (28/9–5/10), 20 SP | **Đã có trên `main`:** S-06 (trụ kết nối, trụ lạ bị từ chối), S-07 (đọc/ghi khung OCPP), S-08 (BootNotification, khoá trạm), S-09 (Heartbeat, `last_seen_at`), S-10 (StatusNotification), S-11 (màn hình trạng thái mọi trụ, đẩy bằng SSE), S-13 (trùng mã trụ đóng kết nối cũ), cờ ngoại tuyến theo nhịp tim (S-12), tắt máy sạch (N4). **Chưa làm:** S-14 (chống xử lý tin trùng), S-15 (xác thực thẻ, `Authorize` còn là stub), S-16 (Reset từ xa) |
| Chất lượng | Lint sạch · **280/280 test pass** (Linux, có Docker; chạy 3 lần liên tiếp không chập chờn) · CI: `lint-and-test` (Ubuntu) + `test-windows` |
| Chạy được ngay | Đăng nhập, 5 workspace theo vai trò, quản lý trạm/trụ, bảng điều khiển Vận hành với trạng thái trụ cập nhật tức thời, khoá/mở khoá trạm, trụ ảo kết nối được |
| Chưa có | Phiên sạc thật, tính tiền, ví, phân bổ công suất, đặt chỗ, đối soát (Sprint 3–8) |
| Còn mở | B5 (trụ chưa xác thực), K-01 (tin trùng, thuộc S-14), staging 50 trụ ảo, tile bản đồ thật: xem [Giới hạn đã biết](#giới-hạn-đã-biết) |

---

## 1. Chạy dự án

**Cần có:** Git, **Docker** (Docker Desktop trên Windows 10/11, Docker Engine trên Linux) và **Python 3.8+**.

`python run.py` tự làm theo thứ tự (dừng và báo cách sửa nếu bước nào hỏng):
1. Kiểm tra Docker đã cài và đang chạy; tự nhận Compose v2 hoặc v1.
2. **Tạo `.env`** với mật khẩu và khoá ngẫu nhiên (không commit); chạy lại không ghi đè.
3. Chọn cổng: mặc định 3000, **bận thì lấy cổng trống kế tiếp** và ghi vào `.env`.
4. **Build image và chạy** (có cache nên nhanh từ lần hai), đợi `/api/health` xanh.
5. **Tạo admin và dữ liệu demo** (6 tài khoản, 6 trạm, 12 trụ), rồi mở trình duyệt.

| Lệnh | Việc |
|---|---|
| `python run.py` | Build (nếu cần) + chạy + tài khoản + demo + mở trình duyệt. Tuỳ chọn: `--port 4000`, `--no-open`, `--no-demo`, `--rebuild`, `--public-url https://…` (staging công khai qua tunnel, xem [`docs/OPERATIONS.md`](docs/OPERATIONS.md) mục 3), `--local` (quay về chế độ máy này) |
| `python run.py down` | Dừng, **giữ dữ liệu** |
| `python run.py reset` | Dừng và **xoá dữ liệu** (hỏi xác nhận; `--yes` bỏ hỏi) |
| `python run.py logs` | Xem log app (`logs db` cho Postgres); `Ctrl+C` để thoát, app vẫn chạy |
| `python run.py status` | Địa chỉ, sức khoẻ, đã có dữ liệu chưa |
| `python test.py` | Lint + toàn bộ test (mục [Kiểm thử](#3-kiểm-thử)) |

**Sửa code:** `python run.py down` → sửa → `python run.py`. Container chạy ảnh đã build (giống staging), không tự tải lại code.

### Tài khoản có sẵn

Chỉ có **trên máy cá nhân** (do `python run.py` tạo):

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin@csms.local` | `admin` | Quản trị |
| `owner@`, `owner2@`, `operator@`, `accountant@`, `driver@`, `multi@` + `demo.csms.local` | `demo12345` | Chủ trạm A, Chủ trạm B, Vận hành, Kế toán, Tài xế, Vận hành + Chủ trạm |

> ⚠️ **`admin/admin` và `demo12345` chỉ dành cho máy cá nhân.** Chúng chỉ được tạo khi cổng mở riêng cho `127.0.0.1` (mặc định). Đặt `BIND_HOST=0.0.0.0` hoặc dùng `--public-url` thì script tự sinh mật khẩu ngẫu nhiên và in một lần. Mật khẩu yếu bị **từ chối tuyệt đối khi `NODE_ENV=production`**; staging Render **không có tài khoản mặc định**.
> Đã đổi mật khẩu admin thì chạy lại `python run.py` không đổi lại; quên mật khẩu thì `python run.py reset`.

### Biến môi trường

Có **hai** file `.env` độc lập, đều không commit: `.env` ở gốc (Docker Compose, do `run.py` tạo) và `backend/.env` (chỉ khi chạy Node trực tiếp, mẫu: `backend/.env.example`). Bảng đầy đủ kèm biến chỉ dùng cho `run.py`/seed/test: [`docs/OPERATIONS.md`](docs/OPERATIONS.md) mục 10.

| Biến | Ý nghĩa | Đơn vị | Mặc định |
|---|---|---|---|
| `PORT` | Cổng HTTP / WebSocket của server | Số nguyên | `3000` |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL | URL | **bắt buộc** |
| `JWT_SECRET` | Khoá ký phiên JWT (≥ 32 ký tự) | Chuỗi | **bắt buộc** |
| `APP_ORIGIN` | Nguồn gốc hợp lệ của frontend (chống CSRF); sai thì mọi thao tác ghi bị 403 | URL | `http://localhost:3000` |
| `LOGIN_IP_MAX_FAILURES` | Ngưỡng khoá đăng nhập sai theo IP trong 15 phút | Số lần | `20` |
| `TRUST_PROXY` | Số reverse proxy tin cậy (0 = bỏ qua `X-Forwarded-For`) | Số nguyên | `0` |
| `OCPP_HEARTBEAT_INTERVAL` | Khoảng nhịp tim gửi cho trụ trong BootNotificationResponse | Giây | `60` |
| `OCPP_PING_INTERVAL` | Chu kỳ WebSocket Ping giữ kết nối OCPP (B9) | Giây | `30` |
| `OCPP_RATE_LIMIT_MAX` | Giới hạn tần suất tin nhắn mỗi kết nối OCPP (B3) | Tin/giây | `50` |
| `OCPP_ERROR_DEDUP_SECONDS` | Bỏ qua lỗi đầu nối y hệt (cùng đầu nối, `errorCode`, `vendorErrorCode`, trạng thái không đổi) đã ghi trong N giây gần nhất; `0` = tắt | Giây | `60` |

---

## 2. Dùng thử hệ thống

### Vai trò và workspace

Đăng nhập tại `/`, hệ thống chuyển tới workspace theo vai trò (`/app.html#/<workspace>`). Tài khoản nhiều vai trò đổi workspace ở góc trên bên trái. **Ctrl+K** tìm trạm/trụ/trang; nút mặt trời/trăng đổi sáng/tối.

| Vai trò | Mã | Workspace | Làm được gì lúc này |
|---|---|---|---|
| Quản trị | `ADMIN` | `#/admin` | Tạo tài khoản mọi vai trò, xem và sửa mọi trạm/trụ, khoá/mở khoá trạm |
| Chủ trạm | `STATION_OWNER` | `#/owner` | Tạo, sửa, xem **trạm và trụ của mình** (danh sách, bản đồ, thêm trụ) |
| Vận hành viên | `OPERATOR` | `#/operator` | Bảng điều khiển: chỉ số, bản đồ, trạng thái trụ/đầu nối cập nhật tức thời (SSE); xem mọi trạm/trụ, **không sửa** |
| Kế toán | `ACCOUNTANT` | `#/accountant` | Khung trống (chờ sprint tính tiền) |
| Tài xế | `DRIVER` | `#/driver` | Tự đăng ký/đăng nhập, giao diện điện thoại; chưa có chức năng sạc |

Menu của chức năng chưa có backend bị **ẩn** (`frontend/app/workspace.js`, mỗi mục ghi story sẽ bật nó): phiên sạc, cảnh báo, điều khiển từ xa, hiệu suất, doanh thu, đối soát, ví, tìm trạm…

### Tạo tài khoản

| Ai tạo | Vai trò tạo được | Endpoint | Ghi chú |
|---|---|---|---|
| Bất kỳ ai (đăng ký công khai) | Chỉ `DRIVER` | `POST /api/auth/register` | Gửi `role` (kể cả `"DRIVER"`) → 400 |
| Quản trị đã đăng nhập | Cả 5 vai trò | `POST /api/admin/users` | Bắt buộc `role` ∈ `ADMIN`, `STATION_OWNER`, `OPERATOR`, `ACCOUNTANT`, `DRIVER` |

Mật khẩu tối thiểu **8 ký tự**; riêng `ADMIN_PASSWORD` của `npm run create-admin` tối thiểu **12 ký tự** (trừ khi chạy qua `run.py` trên máy cá nhân). Staging/production không có tài khoản mặc định: Quản trị đầu tiên tạo bằng `create-admin`.

### Thử bằng dòng lệnh

PowerShell dùng `curl.exe`, không dùng `curl`. Lệnh dưới viết cho bash/cmd; trên PowerShell gõ `curl.exe --%` rồi giữ nguyên phần còn lại (sau `--%` không dùng được biến PowerShell), hoặc ghi JSON ra file rồi `-d "@file.json"`.

```bash
# 1. Quản trị đăng nhập
curl -c admin.cookie -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" \
  -d "{\"email\":\"admin@csms.local\",\"password\":\"<mat-khau-admin>\"}"

# 2. Quản trị tạo Chủ trạm (đổi "role" và email cho các vai trò khác)
curl -b admin.cookie -X POST http://localhost:3000/api/admin/users -H "content-type: application/json" \
  -d "{\"name\":\"Chu tram A\",\"email\":\"owner@csms.local\",\"password\":\"MatKhau#12345\",\"role\":\"STATION_OWNER\"}"

# 3. Chủ trạm đăng nhập rồi tạo trạm (bắt buộc Idempotency-Key 8–128 ký tự, thiếu → 400)
curl -c owner.cookie -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" \
  -d "{\"email\":\"owner@csms.local\",\"password\":\"MatKhau#12345\"}"
curl -b owner.cookie -X POST http://localhost:3000/api/stations -H "content-type: application/json" -H "Idempotency-Key: demo-tram-001" \
  -d "{\"name\":\"Tram ICTU\",\"address\":\"Thai Nguyen\",\"latitude\":21.59,\"longitude\":105.84}"

# 4. Xem trạm của mình / kiểm tra sức khoẻ
curl -b owner.cookie http://localhost:3000/api/stations
curl http://localhost:3000/api/health
```

Danh sách API và quy tắc bảo mật: [`backend/README.md`](backend/README.md).

### Dữ liệu demo

Tạo sẵn 6 tài khoản (mỗi vai trò một, cộng 1 tài khoản nhiều vai trò), 6 trạm, 12 trụ (mã `DEMO-…`), 24 đầu nối với trạng thái đa dạng; chạy lại không tạo trùng. `owner@` thấy 4 trạm của mình, `owner2@` thấy 2 trạm khác (để thử cô lập dữ liệu).

- **Máy cá nhân:** `python run.py` tự seed. Chạy tay: `docker compose exec -e ALLOW_DEMO_SEED=1 -e DEMO_PASSWORD=... app npm run seed-demo`.
- **Staging (Render):** đặt `ALLOW_DEMO_SEED=1` và `DEMO_PASSWORD` (≥ 8 ký tự) rồi deploy lại; xoá `ALLOW_DEMO_SEED` để tắt. Đổi miền email bằng `DEMO_EMAIL_DOMAIN`.
- ⚠️ Trạng thái trụ (Đang sạc, Lỗi…) trong seed là **giả lập để trình diễn**, không phải dữ liệu OCPP thật. Không chạy trên dữ liệu thật; script từ chối chạy nếu thiếu `ALLOW_DEMO_SEED=1`.

### Thử trụ sạc ảo (OCPP)

Trụ kết nối tại `ws://localhost:3000/ocpp/<mã trụ>` với subprotocol `ocpp1.6`. Trụ phải **đã đăng ký** (tạo trong giao diện) và trạm không bị khoá; mã lạ bị từ chối lúc bắt tay (HTTP 404).

| Action | Hiện trạng |
|---|---|
| `BootNotification` | Lưu vendor/model/serial/firmware; trạm không `ACTIVE` hoặc bị khoá → `Rejected`; trụ `ONLINE` khi được chấp nhận |
| `Heartbeat` | Trả giờ máy chủ; cập nhật `last_seen_at` theo giờ DB (không tin đồng hồ trụ) |
| `StatusNotification` | Cập nhật trạng thái đầu nối (`connectorId` ≥ 1), lưu lỗi vào `connector_errors` (có khử trùng); giới hạn độ dài trường |
| `Authorize` | **Stub:** trả `Accepted` nếu có `idTag`, chưa kiểm thẻ (S-15) |
| Action khác | Trả `NotImplemented`, không đóng kết nối |

Mẫu trụ ảo: `docs/spikes/k01-simulator.js`, `docs/spikes/k01/` (xem [`docs/spikes/K-01-ocpp-simulator.md`](docs/spikes/K-01-ocpp-simulator.md)), và các kịch bản kiểm chứng trong `tools/` (đọc thông tin đăng nhập từ biến môi trường, chỉ chạy trên DB thử `_test`/`_chk`). Kết quả kiểm chứng vòng 6: [`docs/testing/BAO-CAO-VONG-6.md`](docs/testing/BAO-CAO-VONG-6.md).

---

## 3. Kiểm thử

Chỉ cần Docker và Python. Script dựng Postgres test riêng (cổng 5433, dữ liệu trong RAM) và cài thư viện trong container Node 22 (volume riêng, không lẫn `node_modules` trên máy).

```bash
python test.py                         # lint + TẤT CẢ test + kiểm tra logic của run.py
python test.py --only unit             # unit | integration | acceptance
python test.py --file tests/acceptance/S-04.station-management.test.js
python test.py --lint-only
python test.py --verbose               # in toàn bộ output
```

- Kết quả cuối: `KẾT QUẢ: ĐẠT (N test pass, 0 fail)` hoặc `KHÔNG ĐẠT` kèm tên ca lỗi; mã thoát 0 = đạt. Log đầy đủ ở `.run/test-output.log` (không commit).
- **`# fail 0` là điều kiện để merge**: CI trên mỗi PR chạy lint, quét phụ thuộc (`npm audit --omit=dev --audit-level=high`), test backend, test của `tools/` (job Ubuntu) và test trên Windows.
- Lần đầu chậm vài phút (tải Node 22, cài thư viện).
- **Test S-09 T-19 cần Docker** (trụ ảo chạy trong container có đồng hồ lệch 5 giờ) và chỉ chạy trên Linux; máy không có Docker sẽ bỏ qua.
- Hai test tắt máy sạch (N4, gửi `SIGTERM`/`SIGINT`) **bị bỏ qua trên Windows** vì Windows không gửi được tín hiệu POSIX tới tiến trình con; chúng chạy ở job Linux.
- Chạy bằng Node trên máy (cần Node ≥ 22.7): `docker compose up -d db_test`, rồi trong `backend/`: `npm ci && npm run lint && npm test`. Test chỉ chạy trên DB có tên kết thúc `_test` (đặt `TEST_DATABASE_URL` nếu dùng DB khác).
- Hồ sơ QA: [`docs/testing/`](docs/testing/README.md), kịch bản theo story: [`docs/testing/stories/S/`](docs/testing/stories/S/).

---

## 4. Staging trên Render

Staging chạy **cùng Dockerfile** với `docker-compose`, triển khai trên [Render](https://render.com) bằng `render.yaml` (gói free). Đây là môi trường để PO và cả nhóm xem sản phẩm chạy thật; Definition of Done yêu cầu AC pass ở đây.

**Bật một lần (người có quyền admin repo, khoảng 10 phút):**
1. Đăng ký Render bằng tài khoản GitHub, cho Render quyền đọc repo.
2. Dashboard Render: **New → Blueprint** → chọn repo, nhánh `main`. Render đọc `render.yaml` và tạo web service `csms-staging` + database `csms-staging-db`.
3. Khi Render hỏi 3 biến:
   - `APP_ORIGIN`: đúng URL Render cấp (ví dụ `https://csms-staging.onrender.com`). Sai thì mọi thao tác ghi bị 403.
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 12 ký tự, tránh ký tự `#`): Quản trị đầu tiên, tự tạo lúc khởi động.
4. Sau lần deploy đầu, mở `<URL>/api/health` phải thấy `"ok":true`, rồi đăng nhập bằng admin.

**Vận hành:** merge vào `main` → Render chờ CI xanh (`autoDeployTrigger: checksPass`) → build → migrate → mở cổng. CI đỏ hoặc deploy lỗi thì giữ bản cũ. Bí mật nằm ở Render, không nằm trong repo. Rollback, tạm dừng, danh sách biến: [`docs/OPERATIONS.md`](docs/OPERATIONS.md) mục 9.

**Giới hạn gói free (biết trước):**
- Service **ngủ sau 15 phút không có request**, mở lại chờ 30–60 giây: **mở trang trước buổi demo 5 phút**.
- Trụ ảo giữ WebSocket lâu không chạy tốt khi service ngủ. Muốn thử trụ lâu dài: dùng máy chủ nhóm với `python run.py --public-url …` hoặc gói trả phí.
- Database free bị **xoá sau 30 ngày**: không phải nơi giữ dữ liệu quan trọng.
- `TRUST_PROXY=2` trong `render.yaml` là giá trị theo tài liệu, **chưa kiểm chứng trên Render thật**. Nếu sai, mọi người dùng bị coi là một IP và khoá đăng nhập theo IP sẽ khoá cả nhóm. Cách kiểm: đăng nhập sai 6 lần bằng một email lạ từ máy A, rồi đăng nhập đúng từ máy B (mạng khác): phải vào được.

---

## 5. Gặp lỗi thường gặp

Script in `[LỖI]` kèm cách sửa. Các trường hợp hay gặp:

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| Docker chưa chạy / `permission denied` (Linux) | Mở Docker Desktop và đợi *running*; Linux: `sudo usermod -aG docker $USER` rồi đăng nhập lại |
| Docker Desktop báo lỗi WSL2 (Windows) | Bật WSL2 theo hướng dẫn Docker Desktop, khởi động lại máy; đây là cấu hình Windows, không phải lỗi dự án |
| Cổng 3000 hoặc 5432 đã bị dùng | `run.py` tự chọn cổng trống kế tiếp và báo rõ; muốn chọn: `python run.py --port 4000` |
| Đổi cổng xong mọi thao tác ghi bị 403 "Origin không hợp lệ" | Đặt `APP_ORIGIN` khớp địa chỉ đang mở, ví dụ `http://localhost:8080` |
| Có dữ liệu Postgres cũ nhưng mất `.env` | Chạy lại `python run.py`: script hỏi gõ `xoa` để xoá dữ liệu cũ rồi tạo `.env` mới (`--yes` để bỏ hỏi) |
| App thoát ngay, báo thiếu `JWT_SECRET`/`DATABASE_URL` | Chạy `python run.py` (tự tạo `.env`). Nếu tự sửa `.env`, `JWT_SECRET` ≥ 32 ký tự; xoá dòng đó để script sinh lại |
| `migrate` lỗi ở `001_baseline` hoặc `003_stations_owner` | DB cũ từ trước baseline. `python run.py reset` **một lần** (xoá dữ liệu dev) rồi chạy lại |
| `invalid reference format` khi build với `docker-compose` v1 | Thư mục clone kết thúc bằng `-`. Đã sửa bằng `image: csms_app:latest`: `git pull` rồi chạy lại; nên dùng Compose v2 |
| `docker compose: unknown command` | Máy chỉ có Compose v1: đổi thành `docker-compose` (khi chạy lệnh tay; `run.py` tự nhận) |
| Đăng nhập bị 429 dù đúng mật khẩu | Bị khoá 15 phút do sai quá 5 lần; đợi hết thời gian khoá |
| `npm error engine Unsupported` / Node sai phiên bản | Cần Node ≥ 22.7; hoặc dùng `python test.py` (chạy trong container, không cần Node trên máy) |
| Trụ ảo báo kết nối bị từ chối | Mã trụ chưa đăng ký, trạm bị khoá, hoặc thiếu subprotocol `ocpp1.6` |

---

## 6. Tổng quan hệ thống

### Kiến trúc

```
Trình duyệt ──HTTP/JSON (cookie httpOnly)──► Express 5 (backend/src)
   frontend/ (HTML/CSS/JS thuần, ES modules,    ├─ modules: auth · users · stations · charge-points · connectors
   không build; Leaflet đặt sẵn trong repo)     │           fleet-status (REST + SSE) · health · audit · ocpp
        ▲                                       ├─ security: ma trận quyền + chặn route chưa khai quyền
        └──── SSE /api/fleet-status/events ─────┤
                                                └─ PostgreSQL 16 (migration 001–014)
Trụ sạc ──WebSocket /ocpp/<mã trụ>──► máy chủ OCPP 1.6J (`ws` + bộ khung tự viết):
   xác thực mã trụ, Boot/Heartbeat/StatusNotification, thay thế kết nối trùng, rate limit, ping giữ kết nối, tắt máy sạch
```

Công nghệ: Node ≥ 22.7 · Express 5 · PostgreSQL 16 · Zod · argon2id · JWT trong cookie · `ws` · Docker Compose · GitHub Actions · Render (staging).

### Luồng trạng thái trụ

- `charge_points.status`: `UNKNOWN` (mới tạo, mất kết nối, bị khoá hoặc dọn khi khởi động) → `ONLINE` (đã `BootNotification` được chấp nhận). Quá `2 × heartbeat_interval` không liên lạc thì giao diện coi là **ngoại tuyến** (suy từ `last_seen_at`, không cần job nền).
- `connectors.status`: `AVAILABLE`, `OCCUPIED`, `RESERVED`, `ERROR`, `UNAVAILABLE` (OCPP `Unavailable`, hiển thị "Tạm ngừng"), `UNKNOWN`. Trạng thái OCPP gốc luôn lưu nguyên ở `connectors.ocpp_status`; trạng thái OCPP lạ xếp vào `ERROR` kèm cảnh báo gom.
- Trụ mất kết nối thì mọi đầu nối của nó về `UNKNOWN` (giữ `ocpp_status` làm "trạng thái cuối biết được").
- Tắt server bằng `SIGTERM`/`SIGINT`: đóng WebSocket bằng mã 1001, ghi `UNKNOWN`, thoát mã 0. Khởi động lại dọn mọi trụ `ONLINE` mồ côi về `UNKNOWN` trước khi mở cổng.

### Tiến độ theo sprint

| Sprint | Mục tiêu | Trạng thái |
|---|---|---|
| 1 (21–28/9) | Khai báo trạm, trụ, đầu nối; cả nhóm chạy được dự án | **Xong** (12 SP) |
| 2 (28/9–5/10) | Trụ ảo nối vào hệ thống được xác thực; vận hành viên thấy đúng trạng thái mọi trụ | S-06…S-11, S-13 và cờ ngoại tuyến (S-12) đã có trên `main`; còn S-14, S-15, S-16. Kế hoạch: [`docs/SPRINT_2_PLAN.md`](docs/SPRINT_2_PLAN.md) |
| 3 | Một phiên sạc trọn vẹn, kWh đúng dù trụ mất kết nối | Chưa |
| 4 | Tính đúng tiền theo biểu giá nhiều khung giờ | Chưa |
| 5 | Nạp ví (sandbox), tự trừ tiền | Chưa; **chưa có hồ sơ sandbox thanh toán** |
| 6–8 | Phân bổ công suất · Tìm trạm, đặt chỗ · Đối soát | Chưa |

> ⚠️ Backlog có 8 sprint nhưng dự án kết thúc 26/10 (còn khoảng 3 tuần): thực tế tới Sprint 5. Phạm vi cuối do PO chốt; bảng trên là lộ trình, không phải cam kết.

### API hiện có

`/api/auth/{register,login,logout,me}` · `/api/admin/users` · `/api/admin/stations/:id/lock` · `/api/roles` · `/api/stations` (+`/:id`) · `/api/stations/:id/charge-points` · `/api/charge-points` (+`/:id`, `/check-code`) · `/api/fleet-status` (+`/events`, SSE) · `/api/health` · WebSocket `/ocpp/<mã>`. Chi tiết: [`backend/README.md`](backend/README.md).

### Giới hạn đã biết

Các mục dưới đây là hiện trạng thật trên `main`, không phải lỗi chưa biết.

| Mã | Giới hạn | Hướng xử lý |
|---|---|---|
| **B5** | **Trụ chưa được xác thực.** WebSocket `/ocpp/:mã` chỉ kiểm tra mã trụ tồn tại và trạm không bị khoá. Kết nối ẩn danh biết mã trụ có thể thay thế (đá) trụ thật theo logic S-13. **Rủi ro được ghi nhận và chấp nhận tạm cho demo/staging (03/10/2026); không dùng nguyên trạng cho production.** | Đề xuất thiết kế, chưa có code, chờ PO chọn phương án: [`docs/B5-xac-thuc-tru-de-xuat-thiet-ke.md`](docs/B5-xac-thuc-tru-de-xuat-thiet-ke.md) |
| **K-01** | Chưa chống xử lý trùng: hai khung CALL cùng `messageId` bị xử lý hai lần. | Thuộc S-14 |
| — | **Trạng thái mức trụ (F5, `connectorId = 0`) đã được lưu** vào `charge_points.ocpp_status`, `last_error_code`, `status_updated_at`; lỗi vào `connector_errors` (cột `charge_point_id`, `connector_id` để trống). Trạng thái `ONLINE` của trụ **không đổi** theo lỗi mức trụ, giao diện chỉ thêm huy hiệu "Lỗi mức trụ". Quy tắc ảnh hưởng đến trạng thái tổng của trụ và trạm chưa có, chờ PO. Huy hiệu mới chưa kiểm bằng trình duyệt. | Chờ PO/QA xác nhận |
| — | `Authorize` còn là stub (trả `Accepted` nếu có `idTag`, chưa kiểm thẻ). `errorCode` ngoài 16 mã OCPP 1.6 được lưu `OtherError` (mã gốc giữ ở `vendor_error_code`). | S-15 |
| — | **Tắt máy sạch (N4) chỉ đúng với một tiến trình server.** Khởi động sau sẽ đánh dấu nhầm trụ đang kết nối ở bản kia nếu chạy nhiều bản cùng một DB. `SIGKILL` không chạy được handler tắt máy: trụ `ONLINE` mồ côi chỉ được dọn ở lần khởi động kế tiếp. | Cần cơ chế theo phiên trước khi mở rộng ngang |
| — | **Quy tắc hiển thị:** trụ `ONLINE` mà đầu nối chưa báo trạng thái (`UNKNOWN`) vẫn hiện "Sẵn sàng" (xanh); trụ `ONLINE` có toàn đầu nối `UNAVAILABLE` hiện "Ngoại tuyến / chưa rõ". | Chờ PO/QA xác nhận |
| — | Hai test N4 bỏ qua trên Windows (xem [Kiểm thử](#3-kiểm-thử)); đường tắt máy bằng `taskkill` trên Windows chưa kiểm. | Khởi động lại sẽ tự dọn trụ mồ côi |
| #25 | **Đăng xuất thu hồi mọi phiên của tài khoản** (kể cả thiết bị khác): `users.token_version` tăng lên, token cũ bị `authenticate` từ chối (401). Mỗi yêu cầu có xác thực tốn thêm một truy vấn khoá chính. Luồng SSE `/api/fleet-status/events` đã mở **không bị đóng ngay** khi đăng xuất, kết thúc khi JWT hết hạn. | Đóng luồng SSE theo `token_version` nếu PO yêu cầu |
| — | **Chưa kiểm chứng:** staging với 50 trụ ảo (thiếu URL staging), tile bản đồ OSM thật (kiểm thử giao diện dùng tile giả), trạng thái Jira bằng API (thiếu token). | Xem [`docs/testing/BAO-CAO-VONG-6.md`](docs/testing/BAO-CAO-VONG-6.md) |
| — | Bộ khung OCPP tự viết trên `ws` (không dùng `ocpp-rpc` như kế hoạch ban đầu) để kiểm soát chặt giao thức. | Quyết định đã thực hiện |

---

## 7. Cấu trúc thư mục

```
backend/
  src/modules/<miền>/     routes (khai quyền, kiểm đầu vào) → service (nghiệp vụ) → repository (SQL)
                          auth · users · stations · charge-points · connectors · fleet-status · health · audit · ocpp
  src/modules/ocpp/       frames, message-handler, ws-connection, ocpp-upgrade, shutdown, handlers/ (một file mỗi action)
  src/security/           ma trận quyền (permissions.js), chặn route chưa khai quyền
  src/server.js           HTTP server + WebSocketServer OCPP, đăng ký handler, tắt máy sạch
  migrations/             NNN_ten.sql + NNN_ten.down.sql (001–014); đã merge thì không sửa, muốn đổi thì thêm file mới
  scripts/                create-admin.js, seed-demo.js
  tests/                  unit/ integration/ acceptance/ helpers/
frontend/                 HTML/CSS/JS thuần, ES modules, không build
  index.html, app.html    đăng nhập/đăng ký · vỏ ứng dụng (mọi workspace)
  app/                    router (hash), phiên, quyền, workspace (menu), status (nhóm trạng thái), theme
  components/             sidebar, topbar, palette (Ctrl+K), modal/drawer, bảng, biểu đồ tròn, bản đồ, toast…
  pages/<vai trò>/        trang theo vai trò; pages/shared/ dùng chung (trạm, trụ, bản đồ, fleet, tài khoản)
  services/               api.js (mọi request), csms.js (endpoint), realtime.js (SSE + polling dự phòng)
  vendor/leaflet/         thư viện bản đồ (MIT), không dùng CDN
tools/                    test_run.py (test của run.py) và kịch bản kiểm chứng chạy server thật (test-*-live.js, verify-*-round6.js)
docs/                     OPERATIONS · SPRINT_STATUS · SPRINT_2_PLAN · B5 · design/ · spikes/ · testing/ · Audit/
render.yaml               blueprint staging trên Render
run.py / test.py          chạy dự án / chạy toàn bộ test bằng Docker
```

---

## 8. Tài liệu liên quan

| Cần gì | Đọc |
|---|---|
| Build, chạy, dừng, sao lưu DB, staging, biến môi trường | [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |
| Dự án đang ở đâu (từng story, rủi ro, DoD) | [`docs/SPRINT_STATUS.md`](docs/SPRINT_STATUS.md), [`docs/SPRINT_2_PLAN.md`](docs/SPRINT_2_PLAN.md) |
| Đóng góp code (nhánh, commit, review, DoD) | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| API, phân quyền, khoá đăng nhập, migration | [`backend/README.md`](backend/README.md) |
| Thiết kế giao diện | [`docs/design/`](docs/design/) |
| OCPP: spike K-01 và đề xuất xác thực trụ B5 | [`docs/spikes/K-01-ocpp-simulator.md`](docs/spikes/K-01-ocpp-simulator.md), [`docs/B5-xac-thuc-tru-de-xuat-thiet-ke.md`](docs/B5-xac-thuc-tru-de-xuat-thiet-ke.md) |
| Kiểm thử/QA, báo cáo vòng 6 | [`docs/testing/README.md`](docs/testing/README.md), [`docs/testing/BAO-CAO-VONG-6.md`](docs/testing/BAO-CAO-VONG-6.md) |
| Backlog (nguồn sự thật về phạm vi và AC) | File ghim trong nhóm Zalo Khối 8 |
| Theo dõi công việc | Jira, bảng **GYM** (Team-CodeGym) |
