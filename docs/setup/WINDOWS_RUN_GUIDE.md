# Hướng dẫn chạy dự án trên Windows

Bước 1: Cài đặt các công cụ bắt buộc
- Git
- Docker Desktop + Docker Engine đang chạy
- Node.js 22.7+ (chỉ cần khi chạy backend local ngoài Docker)
- VS Code (khuyến nghị)

Kiểm tra:
```powershell
docker --version
node --version
npm --version
```

Bước 2: Clone project
```powershell
git clone https://github.com/<your-user>/<your-repo>.git
cd <tên-thư-mục-project>
```

Bước 3: Tạo file .env ở thư mục gốc
Copy file mẫu:
```powershell
Copy-Item .env.example .env
```

Mở file .env và thay các giá trị thật, ví dụ:
```env
POSTGRES_DB=csms
POSTGRES_USER=csms
POSTGRES_PASSWORD=StrongPassword123!
POSTGRES_PORT=5432
PORT=3000
APP_PORT=3000
JWT_SECRET=abcdefghijklmnopqrstuvwxyz1234567890abcd
APP_ORIGIN=http://localhost:3000
TRUST_PROXY=0
```

Lưu ý:
- `JWT_SECRET` phải dài tối thiểu 32 ký tự.
- Không để `#` trong mật khẩu nếu không cần thiết.
- Không commit file .env.

Bước 4: Khởi động database và app bằng Docker Compose
```powershell
docker compose up --build app
```

Nếu bạn muốn chỉ khởi động database trước rồi chạy local backend:
```powershell
docker compose up -d db
```

Bước 5: Kiểm tra app
Mở trình duyệt:
- http://localhost:3000
- http://localhost:3000/api/health

Bước 6: Tạo tài khoản quản trị lần đầu
```powershell
docker compose exec app npm run create-admin
```

Nếu script yêu cầu biến môi trường bổ sung, chạy lệnh sau trước đó:
```powershell
$env:ADMIN_EMAIL="admin@csms.local"
$env:ADMIN_PASSWORD="AdminPassword123!"
docker compose exec app npm run create-admin
```

Bước 7: Chạy backend local nếu cần phát triển
```powershell
cd backend
npm install
Copy-Item .env.example .env
```
Điền file backend/.env theo mẫu:
```env
NODE_ENV=development
PORT=3000
APP_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://csms:StrongPassword123!@localhost:5432/csms
JWT_SECRET=abcdefghijklmnopqrstuvwxyz1234567890abcd
LOGIN_IP_MAX_FAILURES=20
TRUST_PROXY=0
ADMIN_EMAIL=admin@csms.local
ADMIN_PASSWORD=AdminPassword123!
```

Sau đó:
```powershell
npm run migrate
npm run create-admin
npm run dev
```

Bước 8: Chạy kiểm thử cơ bản
```powershell
cd backend
npm run lint
npm test
```

Các lỗi thường gặp
- Docker: Docker Desktop chưa chạy
- PORT 3000 hoặc 5432 đang được dùng -> đổi trong .env
- JWT_SECRET quá ngắn
- APP_ORIGIN không khớp với URL đang mở trong trình duyệt
- Database chưa được tạo -> kiểm tra `docker compose up -d db`

Nếu bạn muốn tôi tiếp tục, hãy cài Docker Desktop trên máy local và chạy lại project; lúc đó tôi sẽ hỗ trợ sửa runtime chi tiết cho đến khi frontend mở được hoàn chỉnh.
