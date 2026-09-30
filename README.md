# CSMS · Nền tảng vận hành trạm sạc xe điện

Đồ án Thực tập cơ sở ICTU × CodeGym · nhóm **TTCS_T926_K8S4_N3** · PO: Mentor Lê Đình Tuấn · dự án 21/9 – 26/10/2026.

**Product Goal:** Đơn vị vận hành nắm được mọi phiên sạc theo thời gian thực qua OCPP 1.6J, tính đúng tiền theo biểu giá nhiều khung giờ, không để trạm vượt công suất, và đối soát doanh thu khớp với số kWh đã cấp.

> **Ràng buộc:** thanh toán chỉ chạy môi trường sandbox. Vị trí và lịch sử di chuyển của tài xế là dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.

## Trạng thái nhanh (28/9/2026)

| | |
|---|---|
| Sprint 1 | **12/12 SP xong** (Jira): khung dự án, đăng nhập, phân quyền, trạm/trụ/đầu nối, spike OCPP. Demo Thứ Tư 30/9 |
| Sprint 2 | Kế hoạch 20 SP (kết nối OCPP có xác thực, trạng thái trụ), **chưa bắt đầu code** |
| Chất lượng | Lint sạch · **140/140 test pass** · giao diện mới đã chạy thử trên trình duyệt |
| Chạy được ngay | Đăng nhập, 5 workspace theo vai trò, quản lý trạm/trụ, bảng điều khiển Vận hành, dữ liệu demo |
| Chưa có | Phiên sạc thật, tính tiền, ví, phân bổ công suất, đặt chỗ, đối soát (Sprint 2–8) |

Chạy: `python run.py` · Kiểm thử: `python test.py`. Chi tiết: mục 5 (tổng quan), [`docs/SPRINT_STATUS.md`](docs/SPRINT_STATUS.md) (từng story, rủi ro, DoD), [`docs/OPERATIONS.md`](docs/OPERATIONS.md) (build, chạy, dừng, dữ liệu, staging).
Muốn đóng góp code? Xem `CONTRIBUTING.md`. Còn không, bắt đầu ngay dưới đây.

---

## 1. Chạy dự án (một lệnh)

**Cần có:** Git, **Docker** (Docker Desktop trên Windows 10/11, Docker Engine trên Linux) và **Python 3.8+**. Không cần cài Node, Postgres hay tự tạo file `.env`.

```
git clone https://github.com/dtc245010034-rgb/Charging-Station-Management-System-CSMS-.git
cd Charging-Station-Management-System-CSMS-
python run.py            # Windows có thể dùng: py run.py   |   Linux: python3 run.py
```

Lần đầu (máy chưa build gì) script tự làm hết, mất vài phút:
1. Kiểm tra Docker đã cài và đang chạy (báo cách sửa nếu chưa), tự nhận Compose v2 hoặc v1.
2. **Tạo file `.env`** với mật khẩu và khoá ngẫu nhiên (không commit); chạy lại không ghi đè.
3. Chọn cổng: mặc định 3000; **nếu bận tự dùng cổng kế tiếp** và ghi vào `.env`.
4. **Build image và chạy** (mỗi lần chạy đều build lại, nhờ cache nên nhanh từ lần hai), rồi đợi `/api/health` xanh.
5. **Tạo tài khoản admin** và **dữ liệu demo** (6 tài khoản, 6 trạm, 12 trụ), rồi mở trình duyệt.

| Lệnh | Việc |
|---|---|
| `python run.py` | Build (nếu cần) + chạy + tài khoản + demo + mở trình duyệt. Tuỳ chọn: `--port 4000`, `--no-open`, `--no-demo`, `--rebuild`, `--public-url https://…` (staging công khai qua tunnel, xem `docs/OPERATIONS.md` mục 3), `--local` (quay về chế độ máy này) |
| `python run.py down` | Dừng, **giữ dữ liệu** |
| `python run.py reset` | Dừng và **xoá dữ liệu** (hỏi xác nhận; `--yes` để bỏ hỏi) |
| `python run.py logs` | Xem log app (`logs db` cho Postgres); `Ctrl+C` để thoát, app vẫn chạy |
| `python run.py status` | Địa chỉ, sức khoẻ, có dữ liệu hay chưa |
| `python test.py` | Lint + **toàn bộ test** (unit, integration, acceptance), xem mục 3 |

**Quy trình sửa code:** `python run.py down` → sửa → `python run.py`. Container chạy ảnh đã build (giống staging), nên sửa code xong phải chạy lại để build; không có chế độ tự tải lại.

### Tài khoản có sẵn (chỉ trên máy cá nhân)

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin@csms.local` | `admin` | Quản trị |
| `owner@`, `owner2@`, `operator@`, `accountant@`, `driver@`, `multi@` + `demo.csms.local` | `demo12345` | Chủ trạm A, Chủ trạm B, Vận hành, Kế toán, Tài xế, Vận hành + Chủ trạm |

> ⚠️ **`admin/admin` và mật khẩu demo chỉ dành cho máy cá nhân.** Chúng chỉ được tạo khi cổng chỉ mở cho `127.0.0.1` (mặc định). Nếu bạn đặt `BIND_HOST=0.0.0.0` (cho máy khác trong mạng truy cập), script tự sinh mật khẩu admin ngẫu nhiên và in ra một lần thay vì dùng `admin`. Mật khẩu yếu bị **từ chối tuyệt đối khi `NODE_ENV=production`** (staging/production). Trên staging Render vẫn **không có tài khoản mặc định**: xem mục Staging.
> Đã đổi mật khẩu admin thì chạy lại `python run.py` không đổi lại; quên mật khẩu thì `python run.py reset`.

### Gặp sự cố khi chạy
Script in `[LỖI]` kèm cách sửa. Các trường hợp hay gặp: Docker chưa mở (mở Docker Desktop, đợi báo *running*); Linux báo `permission denied` (`sudo usermod -aG docker $USER` rồi đăng nhập lại); có dữ liệu Postgres cũ nhưng mất `.env` (chạy lại `python run.py`: script hỏi gõ `xoa` để xoá dữ liệu cũ rồi tạo `.env` mới; thêm `--yes` để bỏ hỏi). Bảng đầy đủ ở mục 4. Cấu hình thủ công không dùng script (nâng cao): `docs/OPERATIONS.md`.

---

## 2. Dùng thử hệ thống

| Vai trò | Mã | Workspace sau đăng nhập | Làm được gì lúc này |
|---|---|---|---|
| Quản trị | `ADMIN` | `/app.html#/admin` | Tạo tài khoản mọi vai trò (form trong giao diện), xem và sửa mọi trạm, trụ |
| Chủ trạm | `STATION_OWNER` | `/app.html#/owner` | Tạo, sửa, xem **trạm và trụ của mình** (giao diện đầy đủ: danh sách, bản đồ, thêm trụ) |
| Vận hành viên | `OPERATOR` | `/app.html#/operator` | Bảng điều khiển vận hành: chỉ số, bản đồ, trạng thái trụ; xem mọi trạm, trụ, không sửa được |
| Kế toán | `ACCOUNTANT` | `/app.html#/accountant` | Chưa có chức năng (từ sprint tính tiền) |
| Tài xế | `DRIVER` | `/app.html#/driver` | Tự đăng ký, đăng nhập; giao diện điện thoại; chưa có chức năng sạc |

### Tạo tài khoản

Trên **staging/production không có tài khoản mặc định** (Quản trị đầu tiên tạo bằng `create-admin`). Trên máy cá nhân, `python run.py` tạo sẵn `admin@csms.local` và tài khoản demo (mục 1). Hai cách tạo thêm tài khoản:

| Ai tạo | Vai trò tạo được | Endpoint | Ghi chú |
|---|---|---|---|
| Bất kỳ ai (đăng ký công khai) | Chỉ `DRIVER` | `POST /api/auth/register` | Gửi `role` (kể cả `"DRIVER"`) → 400. Không được chọn vai trò |
| Quản trị (`ADMIN`, đã đăng nhập) | Cả 5 vai trò | `POST /api/admin/users` | Bắt buộc gửi `role` đúng 1 trong 5 giá trị dưới |

5 giá trị `role` hợp lệ: `ADMIN`, `STATION_OWNER`, `OPERATOR`, `ACCOUNTANT`, `DRIVER`. Mật khẩu tối thiểu **8 ký tự** cho cả hai cách (riêng `ADMIN_PASSWORD` của `npm run create-admin` yêu cầu tối thiểu **12 ký tự**, trừ khi chạy qua `run.py` trên máy cá nhân).

Dùng `curl` (Windows PowerShell gõ `curl.exe`, không gõ `curl`). Các lệnh mẫu dưới đây viết cho bash/cmd. **Trên PowerShell** dấu `\"` và dấu cách trong JSON bị xử lý sai (lỗi 400, hoặc `curl: (3) URL rejected` khi giá trị có dấu cách như `"Thai Nguyen"`); cách sửa: gõ `curl.exe --%` rồi giữ **nguyên phần còn lại của lệnh mẫu**. `--%` bảo PowerShell ngừng xử lý và chuyển nguyên dòng cho `curl.exe`. Ví dụ: `curl.exe --% -c admin.cookie -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" -d "{\"email\":\"admin@csms.local\",\"password\":\"admin\"}"`. Sau `--%` không dùng được biến PowerShell (`$x`). Cách khác chạy ở mọi shell: ghi JSON ra file rồi `-d "@file.json"`.

```
# 1. Quản trị đăng nhập (tài khoản đã tạo ở bước 5 mục 1)
curl -c admin.cookie -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" -d "{\"email\":\"admin@csms.local\",\"password\":\"<mat-khau-admin>\"}"

# 2. Quản trị tạo tài khoản cho từng vai trò còn lại — đổi "role" và email cho mỗi lệnh
curl -b admin.cookie -X POST http://localhost:3000/api/admin/users -H "content-type: application/json" -d "{\"name\":\"Chu tram A\",\"email\":\"owner@csms.local\",\"password\":\"MatKhau#12345\",\"role\":\"STATION_OWNER\"}"
curl -b admin.cookie -X POST http://localhost:3000/api/admin/users -H "content-type: application/json" -d "{\"name\":\"Van hanh A\",\"email\":\"operator@csms.local\",\"password\":\"MatKhau#12345\",\"role\":\"OPERATOR\"}"
curl -b admin.cookie -X POST http://localhost:3000/api/admin/users -H "content-type: application/json" -d "{\"name\":\"Ke toan A\",\"email\":\"accountant@csms.local\",\"password\":\"MatKhau#12345\",\"role\":\"ACCOUNTANT\"}"

# 3. Đăng ký công khai — luôn ra tài khoản Tài xế, không gửi "role"
curl -c driver.cookie -X POST http://localhost:3000/api/auth/register -H "content-type: application/json" -d "{\"name\":\"Tai xe A\",\"email\":\"driver@csms.local\",\"password\":\"MatKhau#12345\"}"
```

### Thử bằng dòng lệnh (không cần giao diện)

```
# Chủ trạm đăng nhập rồi tạo trạm
curl -c owner.cookie -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" -d "{\"email\":\"owner@csms.local\",\"password\":\"MatKhau#12345\"}"
curl -b owner.cookie -X POST http://localhost:3000/api/stations -H "content-type: application/json" -H "Idempotency-Key: demo-tram-001" -d "{\"name\":\"Tram ICTU\",\"address\":\"Thai Nguyen\",\"latitude\":21.59,\"longitude\":105.84}"

# Xem danh sách trạm của mình
curl -b owner.cookie http://localhost:3000/api/stations
```

> `POST /api/stations` bắt buộc header `Idempotency-Key` (chuỗi 8-128 ký tự, tự đặt, dùng để chống bấm lưu hai lần tạo hai trạm) — thiếu header này bị 400.

### Dữ liệu demo (GYM-14) — để cả nhóm thử giao diện

Tạo sẵn 6 tài khoản (mỗi vai trò một tài khoản, cộng 1 tài khoản **nhiều vai trò** Vận hành + Chủ trạm), 6 trạm, 12 trụ (mã `DEMO-...`), 24 đầu nối với trạng thái đa dạng để dashboard có dữ liệu. Chạy lại nhiều lần không tạo trùng.

- **Trên staging (Render):** đặt 2 biến `ALLOW_DEMO_SEED=1` và `DEMO_PASSWORD=<mật-khẩu-≥8-ký-tự>` rồi deploy lại; seed chạy tự động lúc khởi động. Xoá biến `ALLOW_DEMO_SEED` để tắt.
- **Trên máy:** `python run.py` tự seed (mật khẩu `demo12345`); chạy tay: `docker compose exec -e ALLOW_DEMO_SEED=1 -e DEMO_PASSWORD=... app npm run seed-demo`.
- Đăng nhập bằng `owner@`, `owner2@`, `operator@`, `accountant@`, `driver@`, `multi@` + `demo.csms.local` (đổi được bằng `DEMO_EMAIL_DOMAIN`), mật khẩu là `DEMO_PASSWORD`. `owner@` chỉ thấy 4 trạm của mình, `owner2@` thấy 2 trạm khác — dùng để thử cô lập dữ liệu.
- ⚠️ Trạng thái trụ (Đang sạc, Lỗi…) trong seed là **giả lập để trình diễn**, không phải dữ liệu OCPP thật. Chỉ dùng trên staging/máy cá nhân, không chạy trên dữ liệu thật. Script từ chối chạy nếu thiếu `ALLOW_DEMO_SEED=1`.

Danh sách API đầy đủ và quy tắc bảo mật: xem `backend/README.md`.

---

## 3. Kiểm thử

Chỉ cần Docker và Python — không cần cài Node hay bật Postgres tay. Script dựng Postgres test riêng (cổng 5433, dữ liệu trong RAM), cài thư viện trong container (volume riêng, không lẫn với `node_modules` trên máy) rồi chạy.

```
python test.py                        # lint + TẤT CẢ test (unit, integration, acceptance) + kiểm tra logic của run.py
python test.py --only unit            # chỉ một nhóm: unit | integration | acceptance
python test.py --file tests/acceptance/S-04.station-management.test.js
python test.py --lint-only
python test.py --verbose              # in toàn bộ output thay vì bản tóm tắt
```

- Kết quả cuối: `KẾT QUẢ: ĐẠT (N test pass, 0 fail)` hoặc `KHÔNG ĐẠT` kèm tên các ca lỗi; mã thoát 0 = đạt. Toàn bộ output được lưu ở `.run/test-output.log` (không commit).
- **`# fail 0` là điều kiện để merge** — CI trên mỗi Pull Request chạy lint + test + quét phụ thuộc.
- Lần đầu chậm (tải Node 22 và cài thư viện, vài phút); các lần sau nhanh hơn.
- Muốn chạy bằng Node trên máy (cần Node ≥ 22.7): `docker compose up -d db_test`, rồi trong `backend/`: `npm ci && npm run lint && npm test`; test chỉ chạy trên DB có tên kết thúc `_test`.
- Ca kiểm thử và báo cáo QA: `docs/testing/`, `docs/stories/S-xx.md`.

---

## Staging (môi trường chạy thật, tự cập nhật khi merge)

Staging chạy **cùng Dockerfile** với `docker-compose`, triển khai trên [Render](https://render.com) bằng file `render.yaml` ở thư mục gốc (gói free, không tốn tiền). Đây là môi trường để Product Owner và cả nhóm xem sản phẩm chạy thật; Definition of Done yêu cầu AC pass ở đây.

**Bật một lần (người có quyền admin repo GitHub, khoảng 10 phút):**

1. Đăng ký Render bằng tài khoản GitHub, cho Render quyền đọc repo này.
2. Dashboard Render: **New → Blueprint** → chọn repo → nhánh `main`. Render đọc `render.yaml` và tạo 1 web service `csms-staging` + 1 database `csms-staging-db`.
3. Khi Render hỏi 3 biến (`sync: false`):
   - `APP_ORIGIN`: `https://csms-staging.onrender.com` (đúng URL Render cấp, xem ở đầu trang service; nếu tên bị trùng Render sẽ thêm hậu tố thì dùng URL đó). Sai giá trị này thì mọi thao tác ghi bị 403.
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 12 ký tự, không dùng ký tự `#`): tài khoản Quản trị đầu tiên, tự tạo lúc khởi động (chạy lại không đổi gì).
4. Sau lần deploy đầu, mở `<URL>/api/health` phải thấy `"ok":true`, rồi đăng nhập bằng admin ở bước 3.

**Cách nó vận hành**

- Merge vào `main` → Render chờ CI GitHub xanh (`autoDeployTrigger: checksPass`) → build → chạy migration → mở cổng. CI đỏ thì Render **không** triển khai, bản cũ vẫn chạy. Deploy lỗi lúc khởi động cũng giữ bản cũ.
- Bí mật (`JWT_SECRET`, mật khẩu admin, chuỗi kết nối DB) nằm ở Render, không nằm trong repo.
- Xem log / khởi động lại: dashboard Render → service `csms-staging`.

**Giới hạn của gói free — biết trước để khỏi bất ngờ**

- Service **ngủ sau 15 phút không có request**, lần đầu mở lại chờ 30–60 giây. **Mở trang staging trước buổi demo 5 phút.**
- Trụ sạc ảo giữ kết nối WebSocket lâu dài sẽ không chạy tốt khi service ngủ. Trước Sprint 2 (OCPP) cần chuyển sang gói trả phí của Render hoặc một máy chủ riêng chạy `docker compose`.
- Database free của Render bị **xoá sau 30 ngày** (có thêm 14 ngày chờ). Đủ cho dự án đến 26/10 nhưng **không phải nơi giữ dữ liệu quan trọng**.
- `TRUST_PROXY=2` trong `render.yaml` là giá trị theo tài liệu, **chưa kiểm chứng trên Render thật**: nếu sai, mọi người dùng bị coi là cùng một IP và khoá đăng nhập theo IP (20 lần sai) sẽ khoá cả nhóm. Kiểm sau deploy đầu: cố ý đăng nhập sai 6 lần bằng một email lạ từ máy A, rồi đăng nhập đúng từ máy B (mạng khác) — phải vào được.

---

## 4. Gặp lỗi thường gặp

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| App thoát ngay, báo thiếu `JWT_SECRET` hoặc `DATABASE_URL` | Chạy `python run.py` (tự tạo `.env`). Nếu tự sửa `.env`, `JWT_SECRET` phải ≥ 32 ký tự; xoá dòng đó để script sinh lại |
| `migrate` lỗi ở `003_stations_owner` hoặc `001_baseline` | Database cũ từ trước baseline. Chạy `python run.py reset` **một lần** (xoá dữ liệu dev) rồi chạy lại |
| `invalid argument "...csms-_app" for "-t, --tag": invalid reference format` | Lỗi của `docker-compose` v1 khi thư mục clone kết thúc bằng `-`. Đã sửa bằng `image: csms_app:latest` trong `docker-compose.yml`: cập nhật code (`git pull`) rồi chạy lại. Ngoài ra nên dùng Docker Compose v2 (`docker compose`) |
| Cổng 5432 hoặc 3000 đã bị dùng | `run.py` tự chọn cổng trống kế tiếp và báo rõ; muốn chọn: `python run.py --port 4000` |
| Đổi cổng app xong thì mọi thao tác ghi bị 403 "Origin không hợp lệ" | Đặt `APP_ORIGIN` khớp địa chỉ đang mở, ví dụ `http://localhost:8080` |
| Docker Desktop báo lỗi WSL2 / không chạy được trên Windows | Bật WSL2 theo hướng dẫn của Docker Desktop, khởi động lại máy; đây là cấu hình Windows, không phải lỗi dự án |
| Đăng nhập bị 429 kể cả khi đúng mật khẩu | Đang bị khoá 15 phút do sai quá 5 lần; đợi hết thời gian khoá |
| Node báo phiên bản không hợp lệ, hoặc `npm error engine Unsupported` | Dùng `python test.py` (chạy trong container Node 22, không cần Node trên máy) |
| `docker compose: unknown command` hoặc `command not found` | `run.py` tự nhận Compose v1/v2; chỉ gặp khi chạy lệnh `docker compose` tay trên máy chỉ có v1 — đổi thành `docker-compose` |
| Muốn chạy riêng 1 file test | `python test.py --file tests/.../ten.test.js` (mục 3) |

---

## 5. Tổng quan hệ thống

*Cập nhật: 28/9/2026, cuối Sprint 1. Trạng thái Done chính thức theo Jira (bảng GYM) và Definition of Done; bảng đầy đủ ở [`docs/SPRINT_STATUS.md`](docs/SPRINT_STATUS.md).*

### Kiến trúc

```
Trình duyệt ──HTTP/JSON (cookie httpOnly)──► Express 5 (backend/src)
   frontend/ (HTML/CSS/JS thuần, ES modules,          ├─ modules: auth · users · stations · charge-points · health · audit
   không build; Leaflet đặt sẵn trong repo)           ├─ security: ma trận quyền + chặn route chưa khai quyền
                                                      └─ PostgreSQL 16 (migration 001–005)
Trụ sạc ──WebSocket /ocpp/<mã trụ>──► máy chủ OCPP (hiện là mã spike, chỉ trả lời tĩnh)
```

Công nghệ: Node ≥ 22.7 · Express 5 · PostgreSQL 16 · Zod · argon2id · JWT trong cookie · `ws` · Docker Compose · GitHub Actions · Render (staging).

### Sprint 1 — đã xong (12 SP)

| Jira | Story | Kết quả |
|---|---|---|
| GYM-7 | S-01 Khung ứng dụng | Docker Compose, migration tiến/lùi, test, lint, CI (lint + test + quét phụ thuộc). **Staging cần bật một lần** (mục Staging) |
| GYM-8 | S-02 Đăng nhập | Email + mật khẩu, khoá 15 phút sau 5 lần sai (theo email và IP), không lộ email tồn tại |
| GYM-9 | S-03 Phân quyền | 5 vai trò; route chưa khai quyền bị chặn; chủ trạm chỉ thấy trạm của mình; truy cập trái phép trả 403 và ghi nhật ký |
| GYM-10 | S-04 Tạo/sửa trạm | Toạ độ bắt buộc và được kiểm; chống bấm lưu hai lần bằng `Idempotency-Key`; trạm mới `INACTIVE` |
| GYM-11 | S-05 Trụ và đầu nối | Mã trụ duy nhất, luôn chữ hoa (khớp OCPP), 1–4 đầu nối |
| GYM-12 | K-01 Spike OCPP | Phiên sạc trọn vẹn đã ghi, R-08 đã kiểm, bằng chứng cho S-06/S-14/S-21: `docs/spikes/K-01-ocpp-simulator.md` |
| GYM-13 | SM-01 Quy ước làm việc | `CONTRIBUTING.md` |
| GYM-14 | SM-02 Chuẩn bị demo | Đang làm: dữ liệu demo, ảnh chụp giao diện, hướng dẫn |

### Giao diện — bạn thao tác được ở đâu

Đăng nhập tại `/` rồi vào workspace theo vai trò (`/app.html#/<workspace>`). Một tài khoản có nhiều vai trò thì đổi workspace ở góc trên bên trái. **Ctrl+K** tìm trạm/trụ/trang; nút mặt trời/trăng đổi sáng/tối.

| Workspace | Làm được thật | Chỉ là khung / chưa có |
|---|---|---|
| Chủ trạm | Danh sách trạm, **tạo/sửa trạm** (chọn vị trí trên bản đồ), **thêm trụ** (kiểm tra trùng mã), sửa trụ, bản đồ, tổng quan | Doanh thu |
| Quản trị | Như Chủ trạm cho mọi trạm; **tạo tài khoản mọi vai trò** | Danh sách/khoá tài khoản, nhật ký |
| Vận hành viên | Bảng điều khiển (chỉ số, bản đồ, biểu đồ trạng thái trụ), xem trạm/trụ, lọc, ngăn kéo chi tiết — **chỉ xem** | Cảnh báo, hiệu suất, phiên sạc, điều khiển từ xa (khối hiển thị “chưa có dữ liệu”) |
| Kế toán | Đăng nhập, khung tổng quan | Toàn bộ đối soát |
| Tài xế | Đăng ký/đăng nhập, giao diện điện thoại, trang tài khoản | Tìm trạm, sạc, ví, lịch sử |

Menu của chức năng chưa có backend được **ẩn** (cấu hình trong `frontend/app/workspace.js`, mỗi mục ghi story sẽ bật nó). Trạng thái “thời gian thực” hiện là tự tải lại mỗi 15 giây vì chưa có trụ nào kết nối thật.

### API hiện có (chi tiết ở `backend/README.md`)

`/api/auth/{register,login,logout,me}` · `/api/admin/users` · `/api/roles` · `/api/stations` (+`/:id`) · `/api/stations/:id/charge-points` · `/api/charge-points` (+`/:id`, `/check-code`) · `/api/health` · WebSocket `/ocpp/<mã>` (spike).

### Đang làm / sắp tới

| Sprint | Mục tiêu | Trạng thái |
|---|---|---|
| 2 (28/9–5/10) | Trụ ảo nối vào hệ thống được xác thực; vận hành viên thấy đúng trạng thái mọi trụ (S-06…S-16, GYM-32…42, 20 SP, cam kết đủ) | Chưa bắt đầu code; đã chốt dùng `ocpp-rpc`; kế hoạch chi tiết: `docs/SPRINT_2_PLAN.md` |
| 3 | Một phiên sạc trọn vẹn, kWh đúng dù trụ mất kết nối | Chưa |
| 4 | Tính đúng tiền theo biểu giá nhiều khung giờ | Chưa |
| 5 | Nạp ví (sandbox), tự trừ tiền | Chưa; **chưa có hồ sơ sandbox thanh toán** |
| 6 | Phân bổ công suất | Chưa |
| 7 | Tìm trạm, đặt chỗ | Chưa |
| 8 | Đối soát, chia doanh thu | Chưa |

> ⚠️ Backlog có 8 sprint nhưng dự án chỉ còn khoảng 5 tuần làm việc (kết thúc 26/10). Phạm vi thực tế do PO chốt; bảng trên là lộ trình, không phải cam kết.

---

## 6. Cấu trúc thư mục

```
backend/
  src/modules/<miền>/     routes (khai quyền, kiểm đầu vào) → service (nghiệp vụ) → repository (SQL)
  src/security/           ma trận quyền (permissions.js), chặn route chưa khai quyền (routeGuard.js)
  src/server.js           listen + WebSocket OCPP (mã spike, sẽ thay ở Sprint 2)
  migrations/             NNN_ten.sql + NNN_ten.down.sql — đã merge thì không sửa, muốn đổi thì thêm file mới
  scripts/                create-admin.js, seed-demo.js
  tests/                  unit/ integration/ acceptance/ (một file cho mỗi story, tên test theo AC)
frontend/                 HTML/CSS/JS thuần, ES modules, không build
  index.html              đăng nhập / đăng ký          app.html   vỏ ứng dụng (mọi workspace)
  main.js                 khởi động, dựng shell theo vai trò
  app/                    router (hash), phiên, quyền, workspace (menu), status (nhóm trạng thái), theme
  components/             sidebar, topbar, palette (Ctrl+K), modal/drawer, bảng, biểu đồ tròn, bản đồ, toast…
  pages/<vai trò>/        trang theo vai trò; pages/shared/ dùng chung (trạm, trụ, bản đồ, tài khoản)
  services/               api.js (mọi request), csms.js (endpoint), realtime.js (polling, sẽ đổi sang SSE)
  styles/                 tokens.css, themes.css (sáng/tối), layout.css, components.css
  vendor/leaflet/         thư viện bản đồ (MIT), không dùng CDN
docs/OPERATIONS.md        sổ tay vận hành: build, chạy, dừng, DB, staging
docs/SPRINT_STATUS.md     tình trạng dự án và sprint đầy đủ
docs/design/              đặc tả giao diện đã duyệt, ảnh tham chiếu, ảnh chụp hiện có
docs/spikes/              spike (K-01 có mã chạy lại được trong k01/)
docs/testing/, docs/stories/, docs/integration/   hồ sơ QA
render.yaml               blueprint staging trên Render
run.py / test.py          chạy dự án bằng Docker / chạy toàn bộ test (mục 1, 3); tools/ chứa test của chính run.py
```

---

## 7. Tài liệu liên quan

- **Vận hành** (build, chạy, dừng, sao lưu, staging, biến môi trường): [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
- **Tình trạng dự án và sprint**: [`docs/SPRINT_STATUS.md`](docs/SPRINT_STATUS.md).
- **Đóng góp code** (đặt tên nhánh, commit, review, Definition of Done): [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Chi tiết backend** (API, phân quyền, khoá đăng nhập): [`backend/README.md`](backend/README.md).
- **Thiết kế giao diện**: [`docs/design/`](docs/design/) (đặc tả, ảnh chụp, các quyết định lệch đặc tả).
- **Spike OCPP**: [`docs/spikes/K-01-ocpp-simulator.md`](docs/spikes/K-01-ocpp-simulator.md).
- **Kiểm thử/QA**: `docs/README.md` (điểm vào), `docs/testing/`, `docs/stories/`.
- Backlog dự án: file ghim trong nhóm Zalo của Khối 8 — nguồn sự thật về phạm vi và AC.
- Jira: bảng **GYM** (Team-CodeGym).
