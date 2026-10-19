# Báo cáo nội dung đưa nhánh khoaaa350-bot/GYM-80-chang-08-bao-cao-van-hanh về giống nhánh dev

**Ngày thực hiện:** 2026-10-18  
**Tác vụ:** Đồng bộ và khôi phục nhánh `khoaaa350-bot/GYM-80-chang-08-bao-cao-van-hanh` về giống hoàn toàn với nhánh `origin/dev`.

---

## 1. Bối cảnh & Mục đích

Nhánh `khoaaa350-bot/GYM-80-chang-08-bao-cao-van-hanh` ban đầu được phân nhánh từ `origin/dev` (commit gốc `7ee0530`) và chứa 4 commit thực hiện công việc Chặng 8 (báo cáo doanh thu, đối soát, chia sẻ doanh thu đối tác, quản trị người dùng, theo dõi sức khỏe hệ thống).

Tuy nhiên, các commit trên nhánh bot này bị gộp nhiều đầu việc (`[GYM-72, GYM-80, GYM-84, GYM-87, GYM-89]`), sửa đổi đồng thời 58 file với hơn 2600 dòng code, gây khó khăn cho việc nghiệm thu nguyên tử và đối soát kiểm thử theo quy ước repository. Nhằm chuẩn hóa lại nhánh làm việc theo đúng quy trình và đưa nhánh về trạng thái sạch sẽ tương đương `dev`, toàn bộ 58 file đã được đưa về trạng thái nguyên bản của `dev`.

---

## 2. Các commit đã có trên nhánh bot trước khi đưa về dev

Trước khi thực hiện revert, nhánh `khoaaa350-bot/GYM-80-chang-08-bao-cao-van-hanh` gồm 4 commit trên đỉnh `origin/dev` (`7ee0530`):

1. **`512ac5b`** — `feat(db): thêm hồ sơ tỉ lệ chia theo chủ trạm, chỉ-ghi-thêm, có ngày hiệu lực [GYM-80]`
2. **`ff1c27b`** — `feat(settlement): thêm hàm thuần tính phần chia theo đoạn tỉ lệ, làm tròn nửa lên mỗi đoạn [GYM-80]`
3. **`899e209`** — `feat(settlement): thêm API khai và xem tỉ lệ chia của chủ trạm kèm quyền và audit [GYM-80]`
4. **`4ea623a`** — `feat(chang-08): thêm báo cáo và quản trị vận hành [GYM-72, GYM-80, GYM-84, GYM-87, GYM-89]`

---

## 3. Thống kê 58 file đã được khôi phục về trạng thái nhánh dev

Toàn bộ các file dưới đây đã được khôi phục (xóa các file tạo mới không có trên `dev` và trả lại nội dung gốc của các file bị sửa đổi):

### 3.1. Cơ sở dữ liệu & Migrations (Đã xóa 6 file migration mới không thuộc `dev`)
- `backend/migrations/047_partner_share_rates.sql` *(Xóa)*
- `backend/migrations/047_partner_share_rates.down.sql` *(Xóa)*
- `backend/migrations/048_settlement_statements.sql` *(Xóa)*
- `backend/migrations/048_settlement_statements.down.sql` *(Xóa)*
- `backend/migrations/049_user_account_management.sql` *(Xóa)*
- `backend/migrations/049_user_account_management.down.sql` *(Xóa)*

### 3.2. Backend Modules & Logic (Đã khôi phục về trạng thái `dev`)
- `backend/src/app.js` *(Khôi phục bỏ mount các route mới)*
- `backend/src/server.js` *(Khôi phục bỏ khởi chạy cron job cảnh báo)*
- `backend/src/security/permissions.js` *(Khôi phục quyền chuẩn của dev)*
- `backend/src/lib/csv.js` *(Xóa)*
- `backend/src/modules/auth/auth.service.js` *(Khôi phục)*
- `backend/src/modules/charge-points/charge-point-alert-job.js` *(Xóa)*
- `backend/src/modules/health/health.routes.js` *(Khôi phục)*
- `backend/src/modules/reports/reconciliation.routes.js` *(Khôi phục)*
- `backend/src/modules/reports/reports.routes.js` *(Khôi phục)*
- `backend/src/modules/settlement/compute.js` *(Xóa)*
- `backend/src/modules/settlement/partners.repository.js` *(Xóa)*
- `backend/src/modules/settlement/partners.routes.js` *(Xóa)*
- `backend/src/modules/settlement/partners.schema.js` *(Xóa)*
- `backend/src/modules/settlement/partners.service.js` *(Xóa)*
- `backend/src/modules/settlement/statements.repository.js` *(Xóa)*
- `backend/src/modules/settlement/statements.service.js` *(Xóa)*
- `backend/src/modules/users/users.repository.js` *(Khôi phục)*
- `backend/src/modules/users/users.routes.js` *(Khôi phục)*
- `backend/src/modules/users/users.schema.js` *(Khôi phục)*
- `backend/src/modules/users/users.service.js` *(Khôi phục)*

### 3.3. Bộ kiểm thử (Backend Tests)
- `backend/tests/acceptance/S-03.rbac-matrix.test.js` *(Khôi phục)*
- `backend/tests/acceptance/S-03.route-guard.test.js` *(Khôi phục)*
- `backend/tests/acceptance/S-46.charge-point-alerts.test.js` *(Xóa)*
- `backend/tests/acceptance/S-54.partner-share-rates.test.js` *(Xóa)*
- `backend/tests/acceptance/S-54.settlement-statements.test.js` *(Xóa)*
- `backend/tests/acceptance/S-56.audit-driver-filter.test.js` *(Khôi phục)*
- `backend/tests/acceptance/S-58.csv-export.test.js` *(Xóa)*
- `backend/tests/acceptance/S-61.admin-user-management.test.js` *(Xóa)*
- `backend/tests/acceptance/S-63.system-health.test.js` *(Xóa)*
- `backend/tests/helpers/db.js` *(Khôi phục)*
- `backend/tests/integration/migrate-017-charging-sessions.test.js` *(Khôi phục)*
- `backend/tests/integration/migrate-035-session-invoices.test.js` *(Khôi phục)*
- `backend/tests/integration/migrate-036-wallets.test.js` *(Khôi phục)*
- `backend/tests/integration/migrate-039-notifications.test.js` *(Khôi phục)*
- `backend/tests/integration/migrate-045-zero-power.test.js` *(Khôi phục)*
- `backend/tests/integration/migrate-046-reservations.test.js` *(Khôi phục)*
- `backend/tests/integration/migrate-047-partner-share-rates.test.js` *(Xóa)*
- `backend/tests/integration/migrate-048-settlement-statements.test.js` *(Xóa)*
- `backend/tests/integration/migrate-049-user-account-management.test.js` *(Xóa)*
- `backend/tests/integration/migrate.test.js` *(Khôi phục)*
- `backend/tests/unit/settlement-compute.test.js` *(Xóa)*

### 3.4. Giao diện người dùng (Frontend)
- `frontend/app/permissions.js` *(Khôi phục)*
- `frontend/app/router.js` *(Khôi phục)*
- `frontend/app/workspace.js` *(Khôi phục)*
- `frontend/pages/admin/users.js` *(Khôi phục)*
- `frontend/pages/shared/audit-logs.js` *(Khôi phục)*
- `frontend/pages/shared/reconciliation.js` *(Khôi phục)*
- `frontend/pages/shared/revenue.js` *(Khôi phục)*
- `frontend/pages/shared/settlements.js` *(Xóa)*
- `frontend/pages/shared/system-health.js` *(Xóa)*
- `frontend/services/api.js` *(Khôi phục)*
- `frontend/services/csms.js` *(Khôi phục)*

---

## 4. Phương pháp thực hiện

1. **Checkout nhánh làm việc**:  
   `git checkout -b khoaaa350-bot/GYM-80-chang-08-bao-cao-van-hanh origin/khoaaa350-bot/GYM-80-chang-08-bao-cao-van-hanh`
2. **Revert toàn bộ thay đổi của 4 commit**:  
   `git revert --no-commit 7ee0530..HEAD`  
   Lệnh trên tự động đưa toàn bộ 58 file đã sửa đổi hoặc thêm mới về trạng thái gốc của nhánh `dev` tại commit `7ee0530`, bảo toàn tính lịch sử mà không phá vỡ cây git.
3. **Đối chiếu mã nguồn**:  
   `git diff origin/dev` cho kết quả rỗng (ngoại trừ file tài liệu này).
4. **Lưu trữ trên local**:  
   Tuân thủ chỉ thị không tự ý `git push --force` lên remote origin.

---

## 5. Kết quả nghiệm thu

- Cây thư mục và mã nguồn của nhánh hiện tại (`khoaaa350-bot/GYM-80-chang-08-bao-cao-van-hanh`) trùng khớp 100% với `origin/dev` (commit `7ee0530`).
- Không còn bất kỳ file migration thừa hay thay đổi logic nào ngoài nhánh `dev`.
