# CSMS · Nền tảng vận hành trạm sạc xe điện

Đồ án Thực tập cơ sở ICTU × CodeGym · nhóm **TTCS_T926_K8S4_N3** · PO: Mentor Lê Đình Tuấn · dự án 21/9 – 26/10/2026.

**Product Goal:** Đơn vị vận hành nắm được mọi phiên sạc theo thời gian thực qua OCPP 1.6J, tính đúng tiền theo biểu giá nhiều khung giờ, không để trạm vượt công suất, và đối soát doanh thu khớp với số kWh đã cấp.

> **Ràng buộc:** thanh toán chỉ chạy môi trường sandbox. Vị trí và lịch sử di chuyển của tài xế là dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.

---

## 1. Hệ thống đang làm được đến đâu

*Cập nhật: 24/9/2026, đang ở Sprint 1. Trạng thái Done chính thức theo Jira (bảng GYM) và Definition of Done.*

### Đã có trên `main`

| Chức năng | Story | Ghi chú |
|---|---|---|
| Khung dự án: Docker Compose, PostgreSQL, migration tiến/lùi, test, lint | S-01 | Chạy trên máy cá nhân, **chưa có staging và CI** |
| Đăng nhập email + mật khẩu, khoá 15 phút sau 5 lần sai, đếm theo tài khoản và theo IP | S-02 | Không tiết lộ email có tồn tại hay không |
| Đăng ký công khai (luôn là tài khoản Tài xế); Quản trị tạo tài khoản các vai trò khác | S-02 | Tạo qua API, chưa có giao diện quản trị |
| 5 vai trò, mỗi vai trò có trang chủ riêng sau đăng nhập | S-02, S-03 | Trang chủ hiện mới có lời chào |
| Phân quyền: route chưa khai quyền bị chặn mặc định; chủ trạm chỉ thấy trạm của mình; truy cập trái phép trả 403 và ghi nhật ký | S-03 | |
| API trạm, trụ sạc (tạo, sửa, xem) có lọc theo chủ sở hữu | S-04, S-05 | Chỉ có API, **chưa đạt đủ AC** (xem dưới) |

### Đang làm trong Sprint 1 (demo Thứ 4, 30/9)

- **S-04:** kiểm tra dải toạ độ, trạm mới ở trạng thái chưa hoạt động, bấm lưu hai lần chỉ tạo một trạm, **màn hình quản lý trạm**.
- **S-05:** khai báo số đầu nối từ 1 đến 4 cho mỗi trụ, **màn hình trụ và đầu nối**.
- **K-01:** trụ sạc ảo nối được vào máy chủ WebSocket tối giản.

### Chưa có (theo lộ trình backlog)

| Sprint | Mục tiêu |
|---|---|
| 2 | Trụ ảo nối vào hệ thống được xác thực; vận hành viên thấy đúng trạng thái mọi trụ kể cả khi kết nối chập chờn |
| 3 | Một phiên sạc chạy trọn vẹn từ cắm tới rút với số kWh đúng, dù trụ mất kết nối giữa chừng |
| 4 | Tính tiền đúng theo biểu giá nhiều khung giờ, tài xế đọc được vì sao ra số tiền đó |
| 5 | Nạp ví (sandbox), tự trừ tiền khi sạc xong, số dư không sai một đồng |
| 6 | Phân bổ công suất: trạm không bao giờ vượt hạn mức |
| 7 | Tìm trạm trống và đặt chỗ |
| 8 | Đối soát doanh thu khớp kWh, chia cho từng đối tác |

> ⚠️ Backlog có 8 sprint nhưng dự án chỉ có 4 tuần làm việc. Phạm vi thực tế tới 26/10 do PO chốt; bảng trên là lộ trình, không phải cam kết.

---

## 2. Chạy dự án lần đầu

**Cần có:** Git, Docker Desktop, Node.js **22.7 trở lên** (chỉ cần khi chạy test hoặc chạy app ngoài Docker).

### Cách A — chạy tất cả bằng Docker (khuyến nghị để dùng thử, demo)

1. Clone và vào thư mục dự án:
   ```
   git clone https://github.com/dtc245010034-rgb/Charging-Station-Management-System-CSMS-.git
   cd Charging-Station-Management-System-CSMS-
   ```
2. Tạo file `.env` **ở thư mục gốc** (file này chỉ dùng cho Docker Compose, không commit):
   ```
   POSTGRES_PASSWORD=<mat-khau-db-tu-dat>
   JWT_SECRET=<chuoi-ngau-nhien-it-nhat-32-ky-tu>
   ```
   Tạo chuỗi ngẫu nhiên: `openssl rand -hex 32` (Git Bash) hoặc
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

   > ⚠️ Đừng đặt mật khẩu chứa ký tự `#` trong file `.env`: phần sau dấu `#` bị coi là ghi chú và bị cắt mất. Nếu bắt buộc dùng, bọc cả giá trị trong nháy kép, ví dụ `ADMIN_PASSWORD="Mat#Khau12345"`.
3. Khởi động (app tự chạy migration trước khi mở cổng):
   ```
   docker compose up --build app
   ```
   Lệnh này chỉ bật `app` và `db`. Đừng bỏ chữ `app`: khi đó Docker bật thêm `db_test` (Postgres dành cho test, cổng 5433) và sẽ báo lỗi nếu cổng 5433 đang bị dùng.
4. Mở `http://localhost:3000`. Kiểm tra sức khoẻ: `http://localhost:3000/api/health`.
5. Tạo tài khoản Quản trị đầu tiên (hệ thống **không có tài khoản mặc định**):
   ```
   docker compose exec -e ADMIN_EMAIL=admin@csms.local -e ADMIN_PASSWORD=<it-nhat-12-ky-tu> app npm run create-admin
   ```

### Cách B — app chạy trên máy, database trong Docker (dùng khi code backend)

```
docker compose up -d db
cd backend
npm ci
copy .env.example .env      # macOS/Linux: cp .env.example .env
```
Điền `backend/.env`: `DATABASE_URL` (mật khẩu trùng `POSTGRES_PASSWORD` ở `.env` gốc), `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (không dùng ký tự `#`, xem cảnh báo ở Cách A). Sau đó:
```
npm run migrate
npm run create-admin
npm run dev                  # tự khởi động lại khi sửa code
```

> ⚠️ Có **hai** file `.env`: `.env` ở gốc cho Docker Compose, `backend/.env` cho app chạy trực tiếp bằng Node. Cả hai đều không được commit.

---

## 3. Hướng dẫn sử dụng theo vai trò

| Vai trò | Mã | Trang chủ sau đăng nhập | Làm được gì lúc này |
|---|---|---|---|
| Quản trị | `ADMIN` | `/pages/admin.html` | Tạo tài khoản mọi vai trò (qua API), xem và sửa mọi trạm, trụ |
| Chủ trạm | `STATION_OWNER` | `/pages/station-owner.html` | Tạo, sửa, xem **trạm và trụ của mình** (qua API; giao diện đang làm) |
| Vận hành viên | `OPERATOR` | `/pages/operator.html` | Xem mọi trạm, trụ; không sửa được |
| Kế toán | `ACCOUNTANT` | `/pages/accountant.html` | Chưa có chức năng (từ sprint tính tiền) |
| Tài xế | `DRIVER` | `/pages/driver.html` | Tự đăng ký, đăng nhập; chưa có chức năng sạc |

### Kịch bản dùng thử nhanh (thay cho giao diện chưa có)

Dùng `curl` (Windows PowerShell gõ `curl.exe`, không gõ `curl`). Cookie đăng nhập được lưu vào file `admin.cookie`, `owner.cookie` (đã có trong `.gitignore`, vì chứa phiên đăng nhập: **không commit, không gửi cho người khác**).

```
# 1. Quản trị đăng nhập
curl -c admin.cookie -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" -d "{\"email\":\"admin@csms.local\",\"password\":\"<mat-khau-admin>\"}"

# 2. Quản trị tạo tài khoản chủ trạm
curl -b admin.cookie -X POST http://localhost:3000/api/admin/users -H "content-type: application/json" -d "{\"name\":\"Chu tram A\",\"email\":\"a@csms.local\",\"password\":\"MatKhau#12345\",\"role\":\"STATION_OWNER\"}"

# 3. Chủ trạm đăng nhập rồi tạo trạm
curl -c owner.cookie -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" -d "{\"email\":\"a@csms.local\",\"password\":\"MatKhau#12345\"}"
curl -b owner.cookie -X POST http://localhost:3000/api/stations -H "content-type: application/json" -d "{\"name\":\"Tram ICTU\",\"address\":\"Thai Nguyen\",\"latitude\":21.59,\"longitude\":105.84}"

# 4. Xem danh sách trạm của mình
curl -b owner.cookie http://localhost:3000/api/stations
```

Danh sách API đầy đủ và quy tắc bảo mật: xem `backend/README.md`.

---

## 4. Cấu trúc thư mục

```
backend/
  src/modules/<miền>/     routes (khai quyền, kiểm đầu vào) → service (nghiệp vụ) → repository (SQL)
  src/security/           ma trận quyền (permissions.js), chặn route chưa khai quyền (routeGuard.js)
  migrations/             NNN_ten.sql + NNN_ten.down.sql — đã merge thì không sửa, muốn đổi thì thêm file mới
  tests/                  unit/ integration/ acceptance/ (một file cho mỗi story, tên test theo AC)
  scripts/create-admin.js
frontend/                 HTML/CSS/JS thuần, ES modules; mọi request đi qua js/api.js
docs/testing/             kế hoạch, ca kiểm thử, báo cáo lỗi của QA
```

---

## 5. Kiểm thử

```
docker compose up -d db_test    # Postgres riêng cho test, cổng 5433, dữ liệu trong RAM
cd backend
npm run lint
npm test
```
Test xoá sạch database `csms_test` mỗi lần chạy, **không đụng dữ liệu dev**. Ca kiểm thử và báo cáo: `docs/testing/`.

---

## 6. Gặp lỗi thường gặp

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| App thoát ngay, báo thiếu `JWT_SECRET` hoặc `DATABASE_URL` | Chưa tạo hoặc điền thiếu file `.env` tương ứng (mục 2). `JWT_SECRET` phải ≥ 32 ký tự |
| `migrate` lỗi ở `003_stations_owner` hoặc `001_baseline` | Database cũ từ trước baseline. Chạy `docker compose down -v` **một lần** (xoá dữ liệu dev) rồi chạy lại |
| Cổng 5432 hoặc 3000 đã bị dùng | Tắt Postgres/ứng dụng khác, hoặc đổi `POSTGRES_PORT` / `APP_PORT` trong `.env` gốc |
| Đổi cổng app xong thì mọi thao tác ghi bị 403 "Origin không hợp lệ" | Đặt `APP_ORIGIN` khớp địa chỉ đang mở, ví dụ `http://localhost:8080` |
| Đăng nhập bị 429 kể cả khi đúng mật khẩu | Đang bị khoá 15 phút do sai quá 5 lần; đợi hết thời gian khoá |
| Node báo phiên bản không hợp lệ | Cần Node.js ≥ 22.7 |

---

## 7. Tài liệu liên quan

- Backlog dự án: file ghim trong nhóm Zalo của Khối 8 — nguồn sự thật về phạm vi và AC.
- Jira: bảng **GYM** (Team-CodeGym).
- Chi tiết backend (API, phân quyền, khoá đăng nhập): `backend/README.md`.
- Kiểm thử: `docs/testing/`.

---

## Quy ước làm việc

> Áp dụng cho cả nhóm từ Sprint 1. Muốn đổi quy ước: nêu trong Daily hoặc Retrospective, rồi cập nhật mục này bằng một Pull Request.

### 1. Nguyên tắc chung

- Nhánh `main` luôn chạy được. **Không push trực tiếp vào `main`**, mọi thay đổi đều đi qua Pull Request (PR).
- Một việc trên Jira = một nhánh = một PR. Việc lớn thì tách nhỏ, PR nhỏ thì review nhanh.
- Luôn ghi mã Jira (ví dụ `GYM-19`) vào tên nhánh, commit và tiêu đề PR để truy vết được.
- **Không commit bí mật**: mật khẩu, khoá API, chuỗi kết nối cơ sở dữ liệu, file `.env`. Đọc từ biến môi trường và chỉ commit file mẫu `.env.example`.

### 2. Đặt tên nhánh

Cú pháp: `<tên>/<MÃ-JIRA>-<mô-tả-ngắn>`

Quy tắc: `<tên>` là tiền tố cố định của bạn (bảng dưới); chữ thường, không dấu tiếng Việt, nối các từ bằng dấu gạch ngang, mô tả tối đa khoảng 5 từ, mã Jira giữ chữ hoa. Mỗi thẻ Jira một nhánh mới tạo từ `main`.

Ví dụ đúng:

```
lam/GYM-19-form-tao-tram
kien/GYM-25-loi-khoa-dang-nhap
phuc/GYM-13-quy-uoc-lam-viec
```

Ví dụ sai: `lam` (không gắn thẻ Jira), `lam/tao-tram` (thiếu mã Jira), `feature/GYM-19-form` (thiếu tên), `Lâm/GYM-19` (có dấu).

| Thành viên | Tiền tố |
|---|---|
| Nguyễn Anh Phúc | `phuc/` |
| Nguyễn Văn Hữu | `huu/` |
| Sầm Nông Anh Khoa | `khoa/` |
| Dương Trung Kiên | `kien/` |
| Phạm Quang Anh | `quanganh/` |
| Lý Ngọc Lâm | `lam/` |
| Dương Công Lộc | `loc/` |
| Lồ Đức Minh | `minh/` |
| Nguyễn Hà Nam | `nam/` |

### 3. Viết commit

Cú pháp: `<type>(<phạm vi>): <mô tả ngắn> [MÃ-JIRA]`

| Type | Ý nghĩa |
|---|---|
| `feat` | Thêm chức năng |
| `fix` | Sửa lỗi |
| `docs` | Thay đổi tài liệu |
| `refactor` | Viết lại code, không đổi hành vi |
| `test` | Thêm hoặc sửa test |
| `chore` | Cấu hình, thư viện, việc lặt vặt |

Phạm vi là tuỳ chọn, ví dụ: `auth`, `station`, `charge-point`, `db`, `ui`, `readme`.

Quy tắc:

- Mô tả viết tiếng Việt, bắt đầu bằng động từ (thêm, sửa, xoá, đổi), tối đa 72 ký tự, không có dấu chấm cuối.
- Một commit là một thay đổi có ý nghĩa. Commit thường xuyên, không dồn cả ngày làm việc vào một commit.

Ví dụ đúng:

```
feat(station): thêm form tạo trạm sạc [GYM-19]
fix(auth): sửa lỗi không khoá đăng nhập sau 5 lần sai [GYM-16]
docs(readme): thêm quy ước làm việc [GYM-13]
```

Ví dụ sai: `update`, `fix bug`, `done`, `abc`, `sửa nhiều thứ`.

### 4. Quy trình làm một việc và mở Pull Request

1. Trên Jira, kéo thẻ sang **In Progress** và gán tên mình.
2. Cập nhật `main` rồi tạo nhánh mới:

   ```
   git checkout main
   git pull origin main
   git checkout -b lam/GYM-19-form-tao-tram
   ```

3. Làm việc và commit theo quy ước ở mục 3.
4. Trước khi mở PR, lấy code mới nhất của `main` về nhánh của mình, tự xử lý xung đột nếu có, chạy thử ứng dụng trên máy và tự xem lại phần thay đổi:

   ```
   git fetch origin
   git merge origin/main
   ```

5. Đẩy nhánh và mở PR vào `main` trên GitHub:

   ```
   git push -u origin lam/GYM-19-form-tao-tram
   ```

   Tiêu đề PR: `[GYM-19] Thêm form tạo trạm sạc`. Điền đầy đủ mẫu PR và chọn reviewer (mục 5).
6. Sửa theo góp ý của reviewer, đẩy commit mới lên cùng nhánh.
7. Khi đã có approve: tác giả bấm **Squash and merge**, xoá nhánh, rồi chuyển thẻ Jira sang **Done**.

   **PR xếp chồng** (PR B dựa trên nhánh của PR A vì cần code của A): luôn mở PR vào `main`, không merge vào nhánh của PR khác. Khi PR A đã vào `main`, cập nhật PR B: `git fetch origin && git merge origin/main`, đổi base của PR B về `main` nếu cần, rồi mới nhờ review. Nếu không, code của B nằm lại trên nhánh của A và không bao giờ tới `main`.

### 5. Ai review và review thế nào

- Mỗi PR cần **ít nhất 1 approve từ một thành viên khác** (không phải tác giả), theo Definition of Done.
- Tác giả chọn reviewer, xoay vòng giữa các thành viên, ưu tiên người hiểu phần việc đó. PR đụng tới cấu trúc cơ sở dữ liệu (migration) hoặc phân quyền thì thêm **trưởng dev** làm reviewer.
- Reviewer phản hồi **trong ngày làm việc**. Ai đang chờ review của ai thì nêu trong Daily, Scrum Master theo dõi.
- Reviewer **tự chạy** `npm run lint && npm test` trên nhánh của PR trước khi approve.
- Reviewer kiểm tra: code chạy đúng tiêu chí chấp nhận (AC) của việc trên Jira, không có bí mật, tên nhánh và commit đúng quy ước, code dễ đọc.
- Góp ý tập trung vào code, không nhắm vào người viết. Nêu rõ, mang tính xây dựng, và phân biệt "cần sửa" với "gợi ý".
- Không tự merge khi chưa có approve. Xung đột merge do tác giả tự xử lý, cần giúp thì hỏi trên nhóm chat.

### 6. Việc phải đạt trước khi coi là xong

Trích từ Definition of Done của dự án, phần liên quan tới code:

- Đã được ít nhất 1 thành viên khác review và approve.
- Có test cho logic mới; `npm run lint && npm test` xanh trên máy (nhóm chưa dùng CI).
- Không có bí mật trong mã nguồn.
- README được cập nhật nếu đổi cách chạy hoặc thêm biến môi trường.
