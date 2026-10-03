# Project Structure

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: AI Pair Programmer / QA Analyst  
> **Snapshot Date**: 30/09/2026  
> **Git Commit**: `7fe1e7a0d22111f672d167b6967ebfa7b7575845` (nhánh `main`)  
> **Structure Status**: **VERIFIED** (100% khớp filesystem thực tế)  
> **Entry Point / Router**: [`docs/README.md`](./README.md)  
> **Bộ quy chuẩn trung tâm**: [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md)  
> **Chỉ mục kiểm thử**: [`docs/TEST_INVENTORY.md`](./TEST_INVENTORY.md)  

---

> **Cập nhật 03/10/2026:** cây dưới đây là snapshot 30/09. Thêm sau đó trên `main`: `backend/src/modules/fleet-status/` (REST + SSE), `modules/ocpp/handlers/status-notification.js`, `modules/ocpp/shutdown.js`, migration `010`–`012`, `docs/B5-xac-thuc-tru-de-xuat-thiet-ke.md`, `docs/testing/BAO-CAO-VONG-6.md`, `docs/testing/ui-round6/`, `docs/testing/round6/`, các `tools/verify-*-round6.js`. Cấu trúc hiện hành: `README.md` mục 7.

## 0. Cập nhật cấu trúc toàn diện (30/09/2026)

Tài liệu này được tái tạo toàn bộ (**Rescanned and Rebuilt**) từ filesystem thực tế tại commit `7fe1e7a` trên nhánh `main`, triệt tiêu toàn bộ độ lệch (discrepancy) so với các snapshot cũ:

1. **Bổ sung các thành phần mới trong mã nguồn & tài liệu**:
   - `CONTRIBUTING.md`: Quy ước làm việc nhóm CSMS, quy tắc đặt tên nhánh theo mã Jira, commit message, checklist PR.
   - `backend/scripts/seed-demo-if-enabled.js`: Script cross-platform kiểm tra `ALLOW_DEMO_SEED=1` trước khi chạy seed demo cho `npm run start:staging`.
   - `docs/SPRINT_2_PLAN.md`: Kế hoạch chi tiết phân làn làm việc Sprint 2 (S-06 → S-16: kiến trúc module OCPP, WebSocket, simulator).
   - `docs/Audit/`: Toàn bộ bộ khung tiêu chuẩn kiểm toán an ninh độc lập **AI Security Audit Framework v3.0** gồm 6 thư mục con (`01_standards/`, `02_runbook/`, `03_catalogs/`, `04_templates/`, `05_references/`, `results/`) với 26 tệp tiêu chuẩn, runbook và báo cáo kiểm toán ngày 29/09/2026.
2. **Chi tiết hóa toàn bộ cây thư mục Frontend và Assets**:
   - Khai báo đầy đủ từng tệp component trong `frontend/components/` (`badge.js`, `donut.js`, `empty-state.js`, `hero.js`, `icons.js`, `kpi-card.js`, `modal.js`, `palette.js`, `sidebar.js`, `station-map.js`, `table.js`, `toast.js`, `topbar.js`).
   - Khai báo đầy đủ từng tệp trang dùng chung trong `frontend/pages/shared/` (`account.js`, `charge-points.js`, `fleet.js`, `fleet-overview.js`, `map-page.js`, `station-drawer.js`, `station-form.js`, `stations.js`).
   - Khai báo chi tiết các tệp thư viện bản đồ và tài nguyên ảnh tại `frontend/vendor/leaflet/` và `frontend/vendor/leaflet/images/`.
   - Khai báo toàn bộ 30 tệp ảnh chụp màn hình nghiệm thu giao diện thực tế tại `docs/design/screenshots/`.
   - Khai báo chi tiết 8 tệp thực thi và dữ liệu trong cụm spike OCPP `docs/spikes/k01/`.
3. **Làm rõ ranh giới vị trí các thư mục tài liệu**:
   - `docs/stories/`: Chứa toàn bộ 5 hồ sơ kiểm thử User Story (`S-01.md` đến `S-05.md`) — *lưu ý: nằm trực tiếp dưới `docs/stories/`, không nằm trong `docs/testing/stories/`*.
   - `docs/integration/`: Chứa hồ sơ kiểm thử tích hợp `FRONTEND_BACKEND.md` — *lưu ý: nằm trực tiếp dưới `docs/integration/`, không nằm trong `docs/testing/integration/`*.
   - `docs/spikes/`: Chứa các tài liệu nghiên cứu OCPP (`K-01-ocpp-simulator.md`, `k01-session-log.json`, `k01-simulator.js`, `S-05-AC3-ghi-nhan-cho-PO.md`) và mã chạy lại `k01/` — *lưu ý: nằm trực tiếp dưới `docs/spikes/`, không nằm trong `docs/testing/spikes/`*.
   - `docs/testing/`: Chỉ chứa 4 báo cáo kiểm thử tổng hợp (`BUG_REPORT.md`, `REGRESSION_REPORT.md`, `TEST_PLAN.md`, `TEST_REPORT.md`).
4. **Bảng tra cứu lịch sử chuyển đổi Frontend (từ ngày 28/09/2026)**:

| Đường dẫn cũ (đến 27/09) | Đường dẫn hiện tại | Ghi chú chuyển đổi |
|---|---|---|
| `frontend/js/api.js` | `frontend/services/api.js` | Giữ nguyên hành vi: cùng origin, `credentials: include`, `ApiError` |
| `frontend/js/auth.js` | `frontend/app/auth.js` | Bổ sung hàm `toSessionUser` (chuẩn hóa danh sách `roles`) |
| `frontend/js/router.js` (`homePathFor`) | `frontend/app/workspace.js` (`homePathFor`) + `frontend/app/router.js` (`parseHash`, nạp trang) | Định tuyến theo workspace: `/app.html#/<workspace>/overview` |
| `frontend/js/validate.js` | `frontend/app/validate.js` | Validate form đăng nhập / đăng ký |
| `frontend/js/theme.js` | `frontend/app/theme.js` + `frontend/app/theme-boot.js` | `localStorage` quản lý theme sáng/tối |
| `frontend/js/pages/login.js`, `frontend/index.html` | `frontend/pages/auth/login.js`, `frontend/index.html` | Bỏ số liệu giả, kiểm tra lỗi form từng ô |
| `frontend/js/pages/dashboard.js`, `frontend/pages/{admin,operator,accountant,driver}.html` | `frontend/main.js` + `frontend/app.html` + `frontend/pages/<role>/` | Vỏ ứng dụng SPA dùng chung cho mọi vai trò |
| `frontend/pages/station-owner.html`, `frontend/js/pages/station-owner.js` | `frontend/pages/shared/{stations,station-drawer,station-form,charge-points}.js` | Dùng chung cho Chủ trạm, Quản trị viên và Vận hành viên |
| `frontend/styles.css` | `frontend/styles/{tokens,themes,reset,layout,components}.css` | Phân tầng CSS tokens, themes sáng/tối và component styles |
| Leaflet từ CDN unpkg | `frontend/vendor/leaflet/` | Tự lưu trữ cục bộ 100%, không còn phụ thuộc CDN ngoài |

---

## 1. Mục đích của tài liệu

Tài liệu này là **VERIFIED PROJECT MAP** (Bản đồ cấu trúc dự án đã qua xác minh thực tế) với các mục tiêu:
- Cung cấp bức tranh toàn diện, chính xác 100% về cấu trúc thư mục, tệp tin và các thành phần mã nguồn của dự án CSMS.
- Xác định quyền sở hữu tài nguyên và ranh giới kiểm thử: Tester/QA toàn quyền quản trị phân vùng `docs/` và đọc-kiểm tra (read-only) toàn bộ các thành phần khác.
- Thiết lập hệ thống ánh xạ truy vết hai chiều (Bidirectional Traceability) giữa Yêu cầu nghiệp vụ ($E 
ightarrow S 
ightarrow T$) $\longleftrightarrow$ Mã nguồn hiện thực (Source Components) $\longleftrightarrow$ Bộ kiểm thử tự động của Dev $\longleftrightarrow$ Hồ sơ kiểm thử của QA.
- Thực thi nguyên tắc **NO-REDISCOVERY**: Mọi tác vụ phân tích, kiểm thử và rà soát đều trực tiếp tra cứu vị trí cần thiết từ bản đồ này mà không phải quét lại toàn bộ mã nguồn hoặc suy đoán vị trí file.

---

## 2. Structure Authority (Thẩm quyền cấu trúc)

1. **Filesystem thực tế là Nguồn Sự Thật Tối Thượng (Source of Truth)**:
   - Cấu trúc thư mục, tệp tin hiện hữu trên ổ đĩa và hành vi mã nguồn thực tế tại commit hiện tại là căn cứ cao nhất về cấu trúc dự án.
2. **PROJECT_STRUCTURE.md là Bản Đồ Đã Xác Minh (Verified Map)**:
   - Tài liệu này là sự phản ánh có cấu trúc của filesystem thực tế. Tài liệu không tự tạo ra sự thật thay thế filesystem.
3. **Quy tắc giải quyết xung đột (Conflict Resolution)**:
   - Khi phát hiện có sự sai lệch giữa `PROJECT_STRUCTURE.md` và filesystem thực tế: **Luôn ưu tiên dữ liệu từ filesystem thực tế**, phân tích mục đích thực tế của tệp, sau đó cập nhật đồng bộ lại vào `PROJECT_STRUCTURE.md`.

---

## 3. Tester Ownership (Quyền sở hữu của Tester)

| Khu vực tài nguyên | Phạm vi quyền hạn của Tester | Ghi chú vận hành |
|:---|:---:|:---|
| **`docs/`** | **CREATE / EDIT / DELETE**<br>(Toàn quyền quản trị) | Khu vực duy nhất Tester được phép tạo mới, chỉnh sửa, cập nhật hoặc dọn dẹp các tệp tài liệu kiểm thử, quy chuẩn, inventory, stories, integration và báo cáo. |
| **`backend/`** | **READ-ONLY**<br>(Chỉ đọc & Phân tích) | Tuyệt đối không sửa source code, business logic, controller, service, middleware, schema hay test code của Developer. |
| **`frontend/`** | **READ-ONLY**<br>(Chỉ đọc & Phân tích) | Tuyệt đối không sửa đổi HTML, CSS, client scripts JS (`api.js`, `router.js`, `auth.js`, components,...). |
| **`database / migrations`** | **READ-ONLY**<br>(Chỉ kiểm tra DDL & Chạy test) | Tuyệt đối không sửa file SQL migration. Chỉ thực thi migration runner trên DB test để nghiệm thu. |
| **`Docker / Configuration`** | **READ-ONLY**<br>(Chỉ đọc để kiểm chứng NFR) | Tuyệt đối không sửa `docker-compose.yml`, `Dockerfile`, `.env.example`, `package.json`, `eslint.config.js`, `render.yaml`. |
| **`Session Cookies (*.cookie)`** | **READ-ONLY**<br>(Chỉ nạp phiên kiểm thử) | Tệp tạm sinh ra khi chạy live test curl xác thực (được `.gitignore` loại trừ, không lưu trong repo git). |
| **`Git History & CI/CD`** | **READ-ONLY**<br>(Tuyệt đối không can thiệp) | Không commit, không push, không checkout/switch branch, không sửa đổi workflow `.github/`. |

---

## 4. Verified Project Tree (Cây thư mục đã xác minh)

Toàn bộ cây thư mục thực tế của dự án `Charging-Station-Management-System-CSMS-` (gồm 54 thư mục và 244 tệp tin, loại trừ các dependency và cache sinh tự động) đã được quét và kiểm chứng chi tiết:

```text
Charging-Station-Management-System-CSMS-/
├── .dockerignore
├── .github/
│   ├── pull_request_template.md
│   └── workflows/
│       └── ci.yml
├── .gitignore
├── CONTRIBUTING.md
├── README.md
├── backend/
│   ├── .env.example
│   ├── .gitignore
│   ├── .npmrc
│   ├── Dockerfile
│   ├── README.md
│   ├── migrations/
│   │   ├── 001_baseline.down.sql
│   │   ├── 001_baseline.sql
│   │   ├── 002_login_throttle_drop_user_lockout.down.sql
│   │   ├── 002_login_throttle_drop_user_lockout.sql
│   │   ├── 003_stations_owner.down.sql
│   │   ├── 003_stations_owner.sql
│   │   ├── 004_station_management.down.sql
│   │   ├── 004_station_management.sql
│   │   ├── 005_charge_point_code_upper.down.sql
│   │   └── 005_charge_point_code_upper.sql
│   ├── package-lock.json
│   ├── package.json
│   ├── scripts/
│   │   ├── create-admin.js
│   │   ├── seed-demo-if-enabled.js
│   │   └── seed-demo.js
│   ├── src/
│   │   ├── app.js
│   │   ├── config/
│   │   │   ├── env.js
│   │   │   └── nodeVersion.js
│   │   ├── db/
│   │   │   ├── migrate.js
│   │   │   ├── pool.js
│   │   │   ├── scope.js
│   │   │   └── tx.js
│   │   ├── lib/
│   │   │   ├── errors.js
│   │   │   ├── ownership.js
│   │   │   ├── password.js
│   │   │   ├── roles.js
│   │   │   └── schemas.js
│   │   ├── middlewares/
│   │   │   ├── authenticate.js
│   │   │   ├── errorHandler.js
│   │   │   └── requireJson.js
│   │   ├── modules/
│   │   │   ├── audit/
│   │   │   │   └── audit.repository.js
│   │   │   ├── auth/
│   │   │   │   ├── auth.routes.js
│   │   │   │   ├── auth.schema.js
│   │   │   │   ├── auth.service.js
│   │   │   │   └── login-throttle.repository.js
│   │   │   ├── charge-points/
│   │   │   │   ├── charge-points.repository.js
│   │   │   │   ├── charge-points.routes.js
│   │   │   │   ├── charge-points.schema.js
│   │   │   │   ├── charge-points.service.js
│   │   │   │   └── connection-registry.js
│   │   │   ├── health/
│   │   │   │   └── health.routes.js
│   │   │   ├── stations/
│   │   │   │   ├── stations.repository.js
│   │   │   │   ├── stations.routes.js
│   │   │   │   ├── stations.schema.js
│   │   │   │   └── stations.service.js
│   │   │   └── users/
│   │   │       ├── users.repository.js
│   │   │       ├── users.routes.js
│   │   │       ├── users.schema.js
│   │   │       └── users.service.js
│   │   ├── security/
│   │   │   ├── permissions.js
│   │   │   └── routeGuard.js
│   │   └── server.js
│   └── tests/
│       ├── acceptance/
│       │   ├── S-01.baseline.test.js
│       │   ├── S-02.frontend.test.js
│       │   ├── S-02.login-ip.test.js
│       │   ├── S-02.login.test.js
│       │   ├── S-03.accounts.test.js
│       │   ├── S-03.csrf.test.js
│       │   ├── S-03.rbac-matrix.test.js
│       │   ├── S-03.rbac.test.js
│       │   ├── S-03.route-guard.test.js
│       │   ├── S-03.trust-proxy.test.js
│       │   ├── S-04.station-management.test.js
│       │   └── S-05.charge-point-code.test.js
│       ├── helpers/
│       │   ├── app.js
│       │   ├── auth.js
│       │   ├── db.js
│       │   └── station.js
│       ├── integration/
│       │   ├── auth.regression.test.js
│       │   ├── create-admin.test.js
│       │   ├── migrate.test.js
│       │   └── seed-demo.test.js
│       └── unit/
│           ├── connection-registry.test.js
│           ├── env.test.js
│           ├── errorHandler.test.js
│           ├── eslint-guard.test.js
│           ├── frontend-permissions.test.js
│           ├── frontend.test.js
│           ├── no-backdoor.test.js
│           ├── nodeVersion.test.js
│           ├── scope.test.js
│           └── station-schema.test.js
├── docker-compose.yml
├── docs/
│   ├── Audit/
│   │   ├── 01_standards/
│   │   │   ├── data_schemas.md
│   │   │   ├── evidence_ladder.md
│   │   │   ├── principles_and_safety.md
│   │   │   ├── profiles_and_governance.md
│   │   │   └── state_machine_enums.md
│   │   ├── 02_runbook/
│   │   │   ├── step1_inventory_and_scope.md
│   │   │   ├── step2_discovery_and_taint.md
│   │   │   ├── step3_verification_and_poc.md
│   │   │   ├── step4_correlation_and_state.md
│   │   │   └── step5_quality_gate.md
│   │   ├── 03_catalogs/
│   │   │   ├── 00_overview.md
│   │   │   ├── 01_auth_session_tenancy.md
│   │   │   ├── 02_injection_data_handling.md
│   │   │   ├── 03_crypto_and_secrets.md
│   │   │   ├── 04_logic_race_logging.md
│   │   │   ├── 05_deps_supply_cicd_iac.md
│   │   │   └── 06_api_and_llm.md
│   │   ├── 04_templates/
│   │   │   ├── audit_config.example.yaml
│   │   │   ├── audit_report_template.md
│   │   │   ├── finding_artifact.json
│   │   │   └── inventory_artifact.json
│   │   ├── 05_references/
│   │   │   ├── failure_codes_registry.md
│   │   │   ├── requirement_id_registry.md
│   │   │   ├── severity_rubric.md
│   │   │   └── worked_example.md
│   │   ├── README.md
│   │   └── results/
│   │       └── audit_29_9_2026.md
│   ├── OPERATIONS.md
│   ├── PROJECT_STRUCTURE.md
│   ├── README.md
│   ├── SPRINT_2_PLAN.md
│   ├── SPRINT_STATUS.md
│   ├── TESTER_STANDARD.md
│   ├── TEST_INVENTORY.md
│   ├── design/
│   │   ├── CSMS_UX_Redesign_Level_3_Operator_Dashboard.md
│   │   ├── README.md
│   │   ├── operator-dashboard-baseline.webp
│   │   └── screenshots/
│   │       ├── 01-dang-nhap-dark.png
│   │       ├── 01-dang-nhap-light.png
│   │       ├── 02-dang-ky.png
│   │       ├── 03-dang-nhap-loi-validate.png
│   │       ├── 10-operator-tong-quan-dark.png
│   │       ├── 11-tim-kiem-ctrl-k.png
│   │       ├── 12-thong-bao.png
│   │       ├── 13-menu-nguoi-dung.png
│   │       ├── 14-operator-tram-sac.png
│   │       ├── 15-operator-chi-tiet-tram-drawer.png
│   │       ├── 16-operator-tru-sac.png
│   │       ├── 17-operator-chi-tiet-tru-drawer.png
│   │       ├── 18-tru-sac-loc-dang-sac.png
│   │       ├── 19-operator-ban-do.png
│   │       ├── 20-tai-khoan.png
│   │       ├── 21-operator-tong-quan-light.png
│   │       ├── 22-chon-workspace-da-vai-tro.png
│   │       ├── 30-owner-tong-quan.png
│   │       ├── 31-owner-tram-sac-cua-toi.png
│   │       ├── 32-form-them-tram.png
│   │       ├── 33-form-them-tram-loi.png
│   │       ├── 34-owner-chi-tiet-tram-them-tru.png
│   │       ├── 35-owner-chi-tiet-tru-co-nut-sua.png
│   │       ├── 40-admin-tong-quan.png
│   │       ├── 41-admin-tao-tai-khoan.png
│   │       ├── 50-ke-toan-tong-quan.png
│   │       ├── 60-tai-xe-trang-chu-mobile.png
│   │       ├── 61-tai-xe-tai-khoan-mobile.png
│   │       ├── 62-operator-mobile.png
│   │       └── 63-operator-mobile-menu.png
│   ├── integration/
│   │   └── FRONTEND_BACKEND.md
│   ├── spikes/
│   │   ├── K-01-ocpp-simulator.md
│   │   ├── S-05-AC3-ghi-nhan-cho-PO.md
│   │   ├── k01/
│   │   │   ├── findings.json
│   │   │   ├── frame-log.js
│   │   │   ├── package-lock.json
│   │   │   ├── package.json
│   │   │   ├── reference-server.js
│   │   │   ├── run-all.js
│   │   │   ├── session-log.json
│   │   │   └── virtual-charge-point.js
│   │   ├── k01-session-log.json
│   │   └── k01-simulator.js
│   ├── stories/
│   │   ├── S-01.md
│   │   ├── S-02.md
│   │   ├── S-03.md
│   │   ├── S-04.md
│   │   └── S-05.md
│   └── testing/
│       ├── BUG_REPORT.md
│       ├── REGRESSION_REPORT.md
│       ├── TEST_PLAN.md
│       └── TEST_REPORT.md
├── eslint.config.js
├── frontend/
│   ├── app/
│   │   ├── auth.js
│   │   ├── dom.js
│   │   ├── format.js
│   │   ├── permissions.js
│   │   ├── router.js
│   │   ├── state.js
│   │   ├── status.js
│   │   ├── theme-boot.js
│   │   ├── theme.js
│   │   ├── validate.js
│   │   └── workspace.js
│   ├── app.html
│   ├── components/
│   │   ├── badge.js
│   │   ├── donut.js
│   │   ├── empty-state.js
│   │   ├── hero.js
│   │   ├── icons.js
│   │   ├── kpi-card.js
│   │   ├── modal.js
│   │   ├── palette.js
│   │   ├── sidebar.js
│   │   ├── station-map.js
│   │   ├── table.js
│   │   ├── toast.js
│   │   └── topbar.js
│   ├── index.html
│   ├── main.js
│   ├── pages/
│   │   ├── accountant/
│   │   │   └── overview.js
│   │   ├── admin/
│   │   │   └── users.js
│   │   ├── auth/
│   │   │   └── login.js
│   │   ├── driver/
│   │   │   └── overview.js
│   │   ├── operator/
│   │   │   └── dashboard.js
│   │   └── shared/
│   │       ├── account.js
│   │       ├── charge-points.js
│   │       ├── fleet-overview.js
│   │       ├── fleet.js
│   │       ├── map-page.js
│   │       ├── station-drawer.js
│   │       ├── station-form.js
│   │       └── stations.js
│   ├── services/
│   │   ├── api.js
│   │   ├── csms.js
│   │   └── realtime.js
│   ├── styles/
│   │   ├── components.css
│   │   ├── layout.css
│   │   ├── reset.css
│   │   ├── themes.css
│   │   └── tokens.css
│   └── vendor/
│       └── leaflet/
│           ├── LICENSE
│           ├── images/
│           │   ├── layers-2x.png
│           │   ├── layers.png
│           │   ├── marker-icon-2x.png
│           │   ├── marker-icon.png
│           │   └── marker-shadow.png
│           ├── leaflet.css
│           └── leaflet.js
├── render.yaml
├── run.py
├── test.py
└── tools/
    └── test_run.py
```

---

## 5. Directory & Component Purpose Listing (Mục đích từng thành phần)

Toàn bộ các tệp tin và thư mục trong dự án được ghi nhận với mục đích thực tế xác minh từ nội dung code, import, cấu hình và tài liệu:

`.dockerignore` — Danh sách mẫu tệp và thư mục loại trừ khi build Docker image
`.github/` — Thư mục cấu hình GitHub repository (CI/CD workflows và pull request templates)
`.github/pull_request_template.md` — Mẫu checklist tiêu chuẩn khi tạo Pull Request nhằm đảm bảo chất lượng và quy chuẩn nhóm
`.github/workflows/` — Thư mục định nghĩa các pipeline tự động hóa GitHub Actions
`.github/workflows/ci.yml` — Workflow GitHub Actions tự động kiểm tra cú pháp ESLint, chạy unit test, và build Docker container khi push/PR
`.gitignore` — Danh sách mẫu tệp và thư mục Git không theo dõi (dependencies, cache, environment, logs, cookies)
`CONTRIBUTING.md` — Quy ước làm việc nhóm CSMS (quy tắc Git flow, đặt tên nhánh theo mã Jira, commit message chuẩn, pull request checklist)
`README.md` — Tài liệu gốc dự án: giới thiệu tổng quan, kiến trúc hệ thống, hướng dẫn cài đặt, tài khoản seed và lệnh vận hành
`backend/` — Thư mục mã nguồn, cấu hình và kiểm thử của dịch vụ Backend (Node.js / Express)
`backend/.env.example` — Tệp mẫu khai báo các biến môi trường cấu hình backend (cổng PORT, chuỗi kết nối DB, JWT secret,...)
`backend/.gitignore` — Quy tắc bỏ qua tệp riêng của backend (node_modules, .env, SQLite DB tạm)
`backend/.npmrc` — Tệp cấu hình các tùy chọn cài đặt package của npm
`backend/Dockerfile` — Chỉ dẫn build Docker image cho backend (Node.js 22 alpine, cài đặt dependencies và thiết lập entrypoint)
`backend/README.md` — Tài liệu kỹ thuật chi tiết riêng của module Backend (hướng dẫn API, kiến trúc mã nguồn, quy trình chạy test)
`backend/migrations/` — Thư mục chứa các file SQL DDL migration quản lý tiến hóa cấu trúc cơ sở dữ liệu PostgreSQL
`backend/migrations/001_baseline.down.sql` — Rollback migration 001: xóa toàn bộ các bảng trong schema baseline
`backend/migrations/001_baseline.sql` — SQL migration khởi tạo schema baseline: các bảng users, roles, user_roles, stations, charge_points, audit_logs
`backend/migrations/002_login_throttle_drop_user_lockout.down.sql` — Rollback migration 002: drop bảng login_throttle và khôi phục cấu trúc cũ
`backend/migrations/002_login_throttle_drop_user_lockout.sql` — SQL migration tạo bảng login_throttle chống brute-force và loại bỏ logic lockout khỏi bảng users
`backend/migrations/003_stations_owner.down.sql` — Rollback migration 003: xóa cột owner_id khỏi bảng stations
`backend/migrations/003_stations_owner.sql` — SQL migration bổ sung cột owner_id liên kết khóa ngoại với users(id) cho bảng stations
`backend/migrations/004_station_management.down.sql` — Rollback migration 004: xóa bảng station_idempotency_keys và các cột mở rộng của stations
`backend/migrations/004_station_management.sql` — SQL migration mở rộng trạm sạc (status, lat, lng, capacity, price_kwh) và tạo bảng station_idempotency_keys
`backend/migrations/005_charge_point_code_upper.down.sql` — Rollback migration 005: gỡ bỏ ràng buộc mã trụ chữ in hoa
`backend/migrations/005_charge_point_code_upper.sql` — SQL migration chuẩn hóa mã trụ sạc về chữ in hoa và thêm ràng buộc CHECK cho bảng charge_points
`backend/package-lock.json` — Khóa phiên bản chi tiết của toàn bộ cây phụ thuộc npm trong backend
`backend/package.json` — Định nghĩa thông tin gói backend, dependencies runtime, devDependencies kiểm thử và các scripts thực thi npm
`backend/scripts/` — Thư mục chứa các script CLI hỗ trợ khởi tạo dữ liệu và vận hành hệ thống
`backend/scripts/create-admin.js` — Script CLI khởi tạo tài khoản quản trị viên tối cao ban đầu với mật khẩu băm Argon2id
`backend/scripts/seed-demo-if-enabled.js` — Script CLI kiểm tra điều kiện biến môi trường ALLOW_DEMO_SEED=1 trước khi kích hoạt seed-demo.js (tương thích cross-platform Windows/Linux cho lệnh start:staging)
`backend/scripts/seed-demo.js` — Script CLI khởi tạo dữ liệu mẫu demo GYM-14 (6 tài khoản, 6 trạm sạc, 12 trụ DEMO-*); yêu cầu ALLOW_DEMO_SEED=1
`backend/src/` — Thư mục mã nguồn ứng dụng Backend
`backend/src/app.js` — Khởi tạo ứng dụng Express, gắn middlewares bảo mật, phục vụ tĩnh frontend và định tuyến các API module
`backend/src/config/` — Thư mục cấu hình và kiểm tra môi trường hệ thống
`backend/src/config/env.js` — Xác thực và nạp biến môi trường bằng Zod schema với cơ chế fail-fast khi thiếu biến bắt buộc
`backend/src/config/nodeVersion.js` — Kiểm tra tính tương thích phiên bản Node.js tối thiểu của máy host (>= 22.7.0)
`backend/src/db/` — Thư mục tầng giao tiếp và thao tác cơ sở dữ liệu PostgreSQL
`backend/src/db/migrate.js` — Module runner tự động quét, theo dõi và thực thi các tệp SQL migration forward/rollback
`backend/src/db/pool.js` — Quản lý kết nối cơ sở dữ liệu PostgreSQL Connection Pool thông qua thư viện pg
`backend/src/db/scope.js` — Hàm tiện ích scopeByOwner cô lập phạm vi truy vấn dữ liệu theo quyền sở hữu của vai trò Station Owner
`backend/src/db/tx.js` — Hàm tiện ích bọc thực thi giao dịch cơ sở dữ liệu an toàn (BEGIN, COMMIT, ROLLBACK)
`backend/src/lib/` — Thư mục thư viện dùng chung, tiện ích cốt lõi và định nghĩa kiểu dữ liệu
`backend/src/lib/errors.js` — Định nghĩa các lớp lỗi HTTP tùy biến (AppError, UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError)
`backend/src/lib/ownership.js` — Tiện ích kiểm tra và xử lý quan hệ sở hữu tài nguyên dữ liệu
`backend/src/lib/password.js` — Hàm tiện ích băm và xác thực mật khẩu sử dụng thuật toán Argon2id an toàn
`backend/src/lib/roles.js` — Định nghĩa enum các vai trò người dùng trong hệ thống (ADMIN, OPERATOR, STATION_OWNER, ACCOUNTANT, DRIVER)
`backend/src/lib/schemas.js` — Bộ schema Zod chuẩn hóa dùng chung để validate kiểu dữ liệu (UUID, email, chuỗi ký tự)
`backend/src/middlewares/` — Thư mục chứa các middleware xử lý trung gian của Express
`backend/src/middlewares/authenticate.js` — Middleware xác thực phiên người dùng từ HttpOnly cookie hoặc JWT Bearer token
`backend/src/middlewares/errorHandler.js` — Middleware bắt và xử lý lỗi tập trung, chuẩn hóa JSON response { error: { code, message, details } }
`backend/src/middlewares/requireJson.js` — Middleware bắt buộc request mutation có Content-Type application/json và kiểm tra Origin chống CSRF
`backend/src/modules/` — Thư mục chứa các module nghiệp vụ phân rã theo miền chức năng (Domain modules)
`backend/src/modules/audit/` — Module ghi nhận và quản lý nhật ký an ninh hệ thống
`backend/src/modules/audit/audit.repository.js` — Tầng truy vấn bảng audit_logs để lưu vết các sự kiện bảo mật (như ACCESS_DENIED)
`backend/src/modules/auth/` — Module quản lý xác thực và phiên làm việc người dùng
`backend/src/modules/auth/auth.routes.js` — Khai báo các endpoint API xác thực /api/auth (POST /login, POST /logout, GET /me)
`backend/src/modules/auth/auth.schema.js` — Zod schema xác thực dữ liệu đầu vào cho yêu cầu đăng nhập
`backend/src/modules/auth/auth.service.js` — Nghiệp vụ xác thực người dùng, so khớp mật khẩu Argon2id, quản lý throttle và tạo phiên đăng nhập
`backend/src/modules/auth/login-throttle.repository.js` — Truy vấn bảng login_throttle để theo dõi số lần đăng nhập sai và khóa tạm thời tài khoản
`backend/src/modules/charge-points/` — Module quản lý các trụ sạc xe điện và kết nối OCPP
`backend/src/modules/charge-points/charge-points.repository.js` — Truy vấn và thao tác dữ liệu bảng charge_points và connectors
`backend/src/modules/charge-points/charge-points.routes.js` — Khai báo các endpoint API CRUD trụ sạc /api/stations/:stationId/charge-points
`backend/src/modules/charge-points/charge-points.schema.js` — Zod schema validate dữ liệu trụ sạc (mã trụ UPPERCASE, số connector 1-4, công suất)
`backend/src/modules/charge-points/charge-points.service.js` — Nghiệp vụ quản lý trụ sạc: kiểm tra mã duy nhất, sinh connectors, kiểm tra trạng thái
`backend/src/modules/charge-points/connection-registry.js` — Quản lý trạng thái kết nối in-memory của các trụ sạc phục vụ kết nối WebSocket OCPP
`backend/src/modules/health/` — Module kiểm tra tình trạng hoạt động của hệ thống
`backend/src/modules/health/health.routes.js` — Khai báo endpoint GET /api/health kiểm tra trạng thái hoạt động của máy chủ và kết nối DB
`backend/src/modules/stations/` — Module quản lý các trạm sạc xe điện
`backend/src/modules/stations/stations.repository.js` — Truy vấn dữ liệu bảng stations kết hợp cơ chế lọc quyền sở hữu scopeByOwner
`backend/src/modules/stations/stations.routes.js` — Khai báo các endpoint API CRUD trạm sạc /api/stations
`backend/src/modules/stations/stations.schema.js` — Zod schema validate dữ liệu trạm sạc (toạ độ lat/lng, tên trạm, địa chỉ, công suất, giá điện)
`backend/src/modules/stations/stations.service.js` — Nghiệp vụ phân quyền trạm sạc, kiểm tra quyền sở hữu và xử lý idempotency key chống double-click
`backend/src/modules/users/` — Module quản lý tài khoản người dùng và phân vai trò
`backend/src/modules/users/users.repository.js` — Truy vấn và thao tác dữ liệu các bảng users, roles, user_roles
`backend/src/modules/users/users.routes.js` — Khai báo các endpoint API quản lý người dùng /api/users
`backend/src/modules/users/users.schema.js` — Zod schema validate dữ liệu tạo tài khoản người dùng mới và chỉ định vai trò
`backend/src/modules/users/users.service.js` — Nghiệp vụ quản lý người dùng: tạo tài khoản, băm mật khẩu Argon2id, gán vai trò, kiểm tra trùng lặp
`backend/src/security/` — Thư mục tầng an ninh và kiểm soát quyền truy cập
`backend/src/security/permissions.js` — Ma trận phân quyền chi tiết định nghĩa quyền hạn (permissions) cho từng vai trò người dùng
`backend/src/security/routeGuard.js` — Middleware kiểm soát quyền truy cập route (Route Guard) dựa trên vai trò với cơ chế chặn mặc định (Default Deny)
`backend/src/server.js` — Entry point khởi động ứng dụng, lắng nghe kết nối HTTP trên cổng cấu hình
`backend/tests/` — Thư mục chứa toàn bộ bộ kiểm thử tự động của Developer
`backend/tests/acceptance/` — Thư mục kiểm thử mức chấp nhận tính năng theo từng User Story Jira
`backend/tests/acceptance/S-01.baseline.test.js` — Kiểm thử chấp nhận Story S-01: khởi động hệ thống, kết nối DB, kiểm tra health check
`backend/tests/acceptance/S-02.frontend.test.js` — Kiểm thử chấp nhận Story S-02: luồng đăng nhập frontend, xử lý cookie và chuyển hướng
`backend/tests/acceptance/S-02.login-ip.test.js` — Kiểm thử chấp nhận Story S-02: cơ chế giới hạn tần suất đăng nhập sai theo địa chỉ IP
`backend/tests/acceptance/S-02.login.test.js` — Kiểm thử chấp nhận Story S-02: logic đăng nhập và khóa tài khoản tạm thời theo email
`backend/tests/acceptance/S-03.accounts.test.js` — Kiểm thử chấp nhận Story S-03: truy cập tài khoản người dùng và xác thực vai trò
`backend/tests/acceptance/S-03.csrf.test.js` — Kiểm thử chấp nhận Story S-03: cơ chế phòng vệ chống tấn công CSRF (Origin header / JSON Content-Type)
`backend/tests/acceptance/S-03.rbac-matrix.test.js` — Kiểm thử chấp nhận Story S-03: ma trận phân quyền RBAC toàn diện cho tất cả vai trò
`backend/tests/acceptance/S-03.rbac.test.js` — Kiểm thử chấp nhận Story S-03: tính thực thi phân quyền trên các route API nghiệp vụ
`backend/tests/acceptance/S-03.route-guard.test.js` — Kiểm thử chấp nhận Story S-03: cơ chế chặn Default Deny (HTTP 403) của Route Guard
`backend/tests/acceptance/S-03.trust-proxy.test.js` — Kiểm thử chấp nhận Story S-03: xử lý địa chỉ IP client phía sau reverse proxy
`backend/tests/acceptance/S-04.station-management.test.js` — Kiểm thử chấp nhận Story S-04: tạo/sửa trạm sạc, toạ độ thực, Idempotency-Key
`backend/tests/acceptance/S-05.charge-point-code.test.js` — Kiểm thử chấp nhận Story S-05: quản lý mã trụ sạc (chuẩn hóa chữ hoa, connectors 1-4, mã duy nhất)
`backend/tests/helpers/` — Thư mục chứa các hàm tiện ích hỗ trợ thiết lập môi trường và fixture kiểm thử
`backend/tests/helpers/app.js` — Helper khởi tạo Express app phục vụ chạy test suite
`backend/tests/helpers/auth.js` — Helper tạo cookie/token xác thực giả lập phiên đăng nhập cho các ca test
`backend/tests/helpers/db.js` — Helper kết nối, dọn dẹp và reset cơ sở dữ liệu test
`backend/tests/helpers/station.js` — Helper tạo fixture dữ liệu trạm sạc và trụ sạc cho test suite
`backend/tests/integration/` — Thư mục kiểm thử tích hợp giữa các thành phần backend và cơ sở dữ liệu
`backend/tests/integration/auth.regression.test.js` — Kiểm thử tích hợp hồi quy cơ chế xác thực và bảo mật phiên
`backend/tests/integration/create-admin.test.js` — Kiểm thử tích hợp script CLI tạo tài khoản admin ban đầu
`backend/tests/integration/migrate.test.js` — Kiểm thử tích hợp tiến trình chạy migration forward và rollback DB
`backend/tests/integration/seed-demo.test.js` — Kiểm thử tích hợp script seed dữ liệu demo: tính idempotent, xác nhận biến môi trường
`backend/tests/unit/` — Thư mục kiểm thử đơn vị độc lập từng hàm logic nghiệp vụ
`backend/tests/unit/connection-registry.test.js` — Unit test cho module registry kết nối socket của trụ sạc
`backend/tests/unit/env.test.js` — Unit test kiểm tra parse và validate biến môi trường cấu hình
`backend/tests/unit/errorHandler.test.js` — Unit test kiểm tra middleware xử lý lỗi tập trung
`backend/tests/unit/eslint-guard.test.js` — Unit test rà soát quy chuẩn lint và phân tích mã tĩnh
`backend/tests/unit/frontend-permissions.test.js` — Unit test xác minh bảng quyền frontend khớp tuyệt đối với ma trận quyền backend
`backend/tests/unit/frontend.test.js` — Unit test cho các module frontend: api, auth, router hash, nhóm trạng thái
`backend/tests/unit/no-backdoor.test.js` — Unit test quét mã nguồn bảo đảm không có backdoor hoặc credentials hardcode
`backend/tests/unit/nodeVersion.test.js` — Unit test kiểm tra logic điều kiện tương thích phiên bản Node.js
`backend/tests/unit/scope.test.js` — Unit test logic hàm lọc dữ liệu scopeByOwner theo quyền sở hữu
`backend/tests/unit/station-schema.test.js` — Unit test validate Zod schema trạm sạc (toạ độ lat/lng, tên, địa chỉ)
`docker-compose.yml` — Cấu hình khởi chạy cụm container môi trường phát triển/kiểm thử (db:5432, db_test:5433, app:3000)
`docs/` — Thư mục tài liệu dự án thuộc quyền quản lý của Tester / QA Analyst
`docs/Audit/` — Khung tiêu chuẩn kiểm toán bảo mật module hóa độc lập AI Security Audit Framework v3.0
`docs/Audit/01_standards/` — Bộ tiêu chuẩn và nguyên tắc an toàn bắt buộc trong kiểm toán
`docs/Audit/01_standards/data_schemas.md` — Quy chuẩn schema dữ liệu cho Finding, Evidence và quy tắc quan hệ Parent-Child
`docs/Audit/01_standards/evidence_ladder.md` — Thang bậc bằng chứng kiểm toán (Evidence Ladder) và quy tắc nâng hạng Certainty
`docs/Audit/01_standards/principles_and_safety.md` — 15 nguyên tắc an toàn bắt buộc (P1-P15), quy tắc ứng xử (ROE) và xử lý secret an toàn
`docs/Audit/01_standards/profiles_and_governance.md` — Phân định quyền hạn kiểm toán theo Profile (A/B/C) và ranh giới an toàn AI
`docs/Audit/01_standards/state_machine_enums.md` — Tuple trạng thái chính tắc (C, R, V, F) và ma trận chuyển đổi trạng thái của finding
`docs/Audit/02_runbook/` — Quy trình hướng dẫn thực thi kiểm toán từng bước chi tiết (Runbooks)
`docs/Audit/02_runbook/step1_inventory_and_scope.md` — Bước 1: Quét và lập danh mục tài sản, endpoints, actors và luồng dữ liệu nhạy cảm
`docs/Audit/02_runbook/step2_discovery_and_taint.md` — Bước 2: Dò quét lỗ hổng bảo mật và phân tích dòng dữ liệu Source-to-Sink
`docs/Audit/02_runbook/step3_verification_and_poc.md` — Bước 3: Xác minh an toàn lỗ hổng bằng PoC canary lành tính và negative test
`docs/Audit/02_runbook/step4_correlation_and_state.md` — Bước 4: Hợp nhất các phát hiện, xây dựng attack chain và kiểm tra độ tươi
`docs/Audit/02_runbook/step5_quality_gate.md` — Bước 5: Đánh giá Quality Gate theo mức độ nghiêm trọng và xuất báo cáo kiểm toán
`docs/Audit/03_catalogs/` — Từ điển và danh mục các bài kiểm tra bảo mật chuyên đề
`docs/Audit/03_catalogs/00_overview.md` — Hướng dẫn tổng quan về danh mục kiểm tra và quy tắc phân tích dòng dữ liệu Source-to-Sink
`docs/Audit/03_catalogs/01_auth_session_tenancy.md` — Danh mục kiểm tra xác thực, phân quyền, quản lý phiên, IDOR và cô lập đa người thuê (Multi-tenancy)
`docs/Audit/03_catalogs/02_injection_data_handling.md` — Danh mục kiểm tra các lỗ hổng Injection (SQLi, Command Injection, SSRF, XSS, Path Traversal)
`docs/Audit/03_catalogs/03_crypto_and_secrets.md` — Danh mục kiểm tra thuật toán mật mã học, mã hóa dữ liệu và rà soát lộ secret trong code
`docs/Audit/03_catalogs/04_logic_race_logging.md` — Danh mục kiểm tra lỗi logic nghiệp vụ, tranh chấp dữ liệu (Race Conditions/TOCTOU) và ghi log nhạy cảm
`docs/Audit/03_catalogs/05_deps_supply_cicd_iac.md` — Danh mục kiểm tra thư viện bên thứ ba (SCA), bảo mật chuỗi cung ứng, cấu hình Docker và CI/CD
`docs/Audit/03_catalogs/06_api_and_llm.md` — Danh mục kiểm tra an toàn API, phòng vệ Prompt Injection và rủi ro đặc thù hệ thống AI/LLM
`docs/Audit/04_templates/` — Mẫu cấu trúc dữ liệu đầu vào và báo cáo đầu ra của cuộc kiểm toán
`docs/Audit/04_templates/audit_config.example.yaml` — Mẫu tệp cấu hình YAML khai báo phạm vi và tham số cho cuộc kiểm toán
`docs/Audit/04_templates/audit_report_template.md` — Mẫu báo cáo kiểm toán Markdown hoàn chỉnh xuất ra sau Bước 5
`docs/Audit/04_templates/finding_artifact.json` — Mẫu JSON chuẩn hóa cấu trúc dữ liệu lưu trữ một phát hiện lỗ hổng (finding artifact)
`docs/Audit/04_templates/inventory_artifact.json` — Mẫu JSON lưu trữ danh mục tài sản và endpoint sau Bước 1 (inventory artifact)
`docs/Audit/05_references/` — Tài liệu tham chiếu, quy chuẩn định mức và ví dụ đối soát kiểm toán
`docs/Audit/05_references/failure_codes_registry.md` — Bảng đăng ký các mã lỗi chẩn đoán khi vi phạm quy chuẩn kiểm toán
`docs/Audit/05_references/requirement_id_registry.md` — Bảng đối chiếu và ma trận liên kết các mã yêu cầu bảo mật hệ thống
`docs/Audit/05_references/severity_rubric.md` — Bảng quy chuẩn phân định mức độ nghiêm trọng lỗ hổng bảo mật theo thang điểm CVSS
`docs/Audit/05_references/worked_example.md` — Ví dụ mẫu thực tế hoàn chỉnh về cách ghi nhận một finding kiểm toán đạt chuẩn
`docs/Audit/README.md` — Tài liệu tổng quan và nhạc trưởng điều phối quy trình kiểm toán bảo mật 5 bước (SOP)
`docs/Audit/results/` — Thư mục lưu trữ kết quả và báo cáo các đợt kiểm toán bảo mật
`docs/Audit/results/audit_29_9_2026.md` — Báo cáo kết quả kiểm toán an ninh bảo mật ngày 29/09/2026
`docs/OPERATIONS.md` — Sổ tay vận hành: hướng dẫn build, chạy, dừng container, quản trị DB, staging và biến môi trường
`docs/PROJECT_STRUCTURE.md` — Bản đồ cấu trúc toàn bộ dự án và hệ thống tài liệu QA (tệp này)
`docs/README.md` — AI Tester Entry Point & Router điều hướng tài liệu kiểm thử cho mọi loại tác vụ
`docs/SPRINT_2_PLAN.md` — Kế hoạch chi tiết triển khai Sprint 2 (S-06 → S-16: phân làn làm việc, kiến trúc module OCPP, timeline)
`docs/SPRINT_STATUS.md` — Báo cáo tổng hợp tình trạng tiến độ và trạng thái chi tiết của các Sprint
`docs/TESTER_STANDARD.md` — Bộ quy chuẩn kiểm thử trung tâm chi phối toàn bộ hoạt động kiểm thử của Tester
`docs/TEST_INVENTORY.md` — Bảng kê tập trung danh mục toàn bộ test case và trạng thái thực thi kiểm thử
`docs/design/` — Thư mục tài liệu thiết kế giao diện UX Redesign Level 3
`docs/design/CSMS_UX_Redesign_Level_3_Operator_Dashboard.md` — Đặc tả thiết kế giao diện UX Redesign Level 3 cho màn hình Operator Dashboard
`docs/design/README.md` — Tài liệu tổng quan về thiết kế giao diện và hiện trạng triển khai frontend
`docs/design/operator-dashboard-baseline.webp` — Ảnh chụp màn hình mốc baseline giao diện ban đầu làm đối chiếu
`docs/design/screenshots/` — Thư mục lưu trữ 30 ảnh chụp màn hình kiểm chứng giao diện thực tế của hệ thống
`docs/design/screenshots/01-dang-nhap-dark.png` — Ảnh màn hình đăng nhập giao diện tối (dark mode)
`docs/design/screenshots/01-dang-nhap-light.png` — Ảnh màn hình đăng nhập giao diện sáng (light mode)
`docs/design/screenshots/02-dang-ky.png` — Ảnh màn hình đăng ký tài khoản mới
`docs/design/screenshots/03-dang-nhap-loi-validate.png` — Ảnh màn hình đăng nhập khi hiển thị thông báo lỗi kiểm tra form
`docs/design/screenshots/10-operator-tong-quan-dark.png` — Ảnh giao diện tổng quan Operator Dashboard (chế độ tối)
`docs/design/screenshots/11-tim-kiem-ctrl-k.png` — Ảnh giao diện tìm kiếm nhanh Command Palette (Ctrl+K)
`docs/design/screenshots/12-thong-bao.png` — Ảnh giao diện bảng thông báo hệ thống
`docs/design/screenshots/13-menu-nguoi-dung.png` — Ảnh menu ngữ cảnh thông tin người dùng và tài khoản
`docs/design/screenshots/14-operator-tram-sac.png` — Ảnh giao diện danh sách trạm sạc vai trò Operator
`docs/design/screenshots/15-operator-chi-tiet-tram-drawer.png` — Ảnh ngăn kéo hiển thị chi tiết trạm sạc vai trò Operator
`docs/design/screenshots/16-operator-tru-sac.png` — Ảnh giao diện danh sách trụ sạc vai trò Operator
`docs/design/screenshots/17-operator-chi-tiet-tru-drawer.png` — Ảnh ngăn kéo hiển thị chi tiết trụ sạc vai trò Operator
`docs/design/screenshots/18-tru-sac-loc-dang-sac.png` — Ảnh bộ lọc danh sách trụ sạc theo trạng thái đang sạc
`docs/design/screenshots/19-operator-ban-do.png` — Ảnh màn hình bản đồ giám sát trạm sạc vai trò Operator
`docs/design/screenshots/20-tai-khoan.png` — Ảnh giao diện trang quản lý thông tin tài khoản cá nhân
`docs/design/screenshots/21-operator-tong-quan-light.png` — Ảnh giao diện tổng quan Operator Dashboard (chế độ sáng)
`docs/design/screenshots/22-chon-workspace-da-vai-tro.png` — Ảnh giao diện chọn và chuyển đổi không gian làm việc đa vai trò
`docs/design/screenshots/30-owner-tong-quan.png` — Ảnh giao diện tổng quan dành cho Chủ trạm (Station Owner)
`docs/design/screenshots/31-owner-tram-sac-cua-toi.png` — Ảnh danh sách các trạm sạc thuộc quyền sở hữu của Chủ trạm
`docs/design/screenshots/32-form-them-tram.png` — Ảnh form khai báo tạo mới trạm sạc
`docs/design/screenshots/33-form-them-tram-loi.png` — Ảnh hiển thị lỗi xác thực trên form tạo mới trạm sạc
`docs/design/screenshots/34-owner-chi-tiet-tram-them-tru.png` — Ảnh chi tiết trạm sạc của Chủ trạm và thao tác thêm trụ sạc
`docs/design/screenshots/35-owner-chi-tiet-tru-co-nut-sua.png` — Ảnh chi tiết trụ sạc của Chủ trạm hiển thị các nút thao tác chỉnh sửa
`docs/design/screenshots/40-admin-tong-quan.png` — Ảnh giao diện tổng quan dành cho Quản trị viên (Admin)
`docs/design/screenshots/41-admin-tao-tai-khoan.png` — Ảnh giao diện Quản trị viên tạo mới tài khoản người dùng
`docs/design/screenshots/50-ke-toan-tong-quan.png` — Ảnh giao diện tổng quan dành cho vai trò Kế toán
`docs/design/screenshots/60-tai-xe-trang-chu-mobile.png` — Ảnh giao diện trang chủ Tài xế trên màn hình thiết bị di động
`docs/design/screenshots/61-tai-xe-tai-khoan-mobile.png` — Ảnh giao diện tài khoản Tài xế trên màn hình thiết bị di động
`docs/design/screenshots/62-operator-mobile.png` — Ảnh giao diện giám sát Operator trên màn hình thiết bị di động
`docs/design/screenshots/63-operator-mobile-menu.png` — Ảnh menu điều hướng Operator trên màn hình thiết bị di động
`docs/integration/` — Thư mục tài liệu kiểm thử tích hợp giữa các hệ thống
`docs/integration/FRONTEND_BACKEND.md` — Hồ sơ kịch bản & bằng chứng kiểm thử tích hợp Frontend ↔ Backend (FB-01 đến FB-11)
`docs/spikes/` — Thư mục nghiên cứu kỹ thuật và báo cáo gửi Product Owner
`docs/spikes/K-01-ocpp-simulator.md` — Báo cáo nghiên cứu kỹ thuật Spike K-01: kết nối và mô phỏng giao thức OCPP 1.6-J
`docs/spikes/S-05-AC3-ghi-nhan-cho-PO.md` — Báo cáo gửi PO đề xuất phương án và hoãn tiêu chí S-05 AC3 sang Sprint 3
`docs/spikes/k01/` — Thư mục mã nguồn chạy lại được phục vụ nghiên cứu thử nghiệm OCPP 1.6
`docs/spikes/k01-session-log.json` — Nhật ký mẫu ghi lại phiên kết nối WebSocket và trao đổi bản tin OCPP
`docs/spikes/k01-simulator.js` — Script Node.js mô phỏng trụ sạc kết nối WebSocket và gửi các bản tin OCPP
`docs/spikes/k01/findings.json` — Tệp dữ liệu ghi nhận các phát hiện kỹ thuật từ quá trình chạy thử nghiệm OCPP
`docs/spikes/k01/frame-log.js` — Script ghi nhận log chi tiết từng khung frame tin WebSocket gửi và nhận
`docs/spikes/k01/package-lock.json` — Khóa phiên bản các package npm phụ thuộc phục vụ module thử nghiệm k01
`docs/spikes/k01/package.json` — Khai báo dependencies riêng phục vụ chạy thử nghiệm module k01 (ocpp-rpc, ws,...)
`docs/spikes/k01/reference-server.js` — Máy chủ CSMS tham chiếu tối thiểu hỗ trợ bắt tay WebSocket OCPP 1.6
`docs/spikes/k01/run-all.js` — Script tự động chạy toàn bộ quy trình thử nghiệm máy chủ và trụ ảo mô phỏng
`docs/spikes/k01/session-log.json` — Tệp nhật ký chi tiết phiên chạy thử nghiệm OCPP sinh ra tự động
`docs/spikes/k01/virtual-charge-point.js` — Trụ sạc ảo mô phỏng đầy đủ vòng đời OCPP (BootNotification, Heartbeat, StatusNotification)
`docs/stories/` — Thư mục tài liệu kiểm thử chi tiết theo từng User Story Jira
`docs/stories/S-01.md` — Hồ sơ kiểm thử Story S-01 (Khung ứng dụng chạy trên máy cá nhân & DB PostgreSQL T-01)
`docs/stories/S-02.md` — Hồ sơ kiểm thử Story S-02 (Xác thực email/mật khẩu, Argon2id, lockout 15 phút, phiên cookie HttpOnly T-04, T-05)
`docs/stories/S-03.md` — Hồ sơ kiểm thử Story S-03 (Phân quyền RBAC, Route Guard Default Deny, cô lập Station Owner, audit log T-06, T-07)
`docs/stories/S-04.md` — Hồ sơ kiểm thử Story S-04 (Chủ trạm tạo và sửa thông tin trạm sạc, toạ độ thực, idempotency key T-08, T-09)
`docs/stories/S-05.md` — Hồ sơ kiểm thử Story S-05 (Chủ trạm thêm trụ và đầu nối, chuẩn hóa mã in hoa duy nhất toàn hệ thống T-10, T-11)
`docs/testing/` — Thư mục kế hoạch và báo cáo kiểm thử tổng hợp
`docs/testing/BUG_REPORT.md` — Hồ sơ chi tiết các lỗi mã nguồn (CODE_DEFECT) và rào cản môi trường (ENVIRONMENT_BLOCKER)
`docs/testing/REGRESSION_REPORT.md` — Báo cáo đánh giá hồi quy chức năng và so sánh hành vi qua các đợt refactor
`docs/testing/TEST_PLAN.md` — Kế hoạch kiểm thử tổng thể: phạm vi, mục tiêu, môi trường và thứ tự thực thi
`docs/testing/TEST_REPORT.md` — Báo cáo tổng hợp kết quả kiểm thử tại mốc snapshot hiện tại
`eslint.config.js` — Cấu hình kiểm tra cú pháp và chất lượng mã nguồn tĩnh ESLint flat config cho cả Backend và Frontend
`frontend/` — Thư mục giao diện web tĩnh: HTML/CSS/JS thuần, chuẩn ES modules, không qua bước build
`frontend/app/` — Thư mục chứa các module điều khiển lõi ứng dụng phía client
`frontend/app.html` — Vỏ ứng dụng Single Page Application (SPA shell) dùng chung cho mọi vai trò sau khi đăng nhập thành công
`frontend/app/auth.js` — Module client quản lý đăng nhập, đăng ký, đăng xuất, lấy thông tin phiên và chuẩn hóa danh sách vai trò
`frontend/app/dom.js` — Tiện ích DOM an toàn: tạo phần tử giao diện mà không sử dụng innerHTML với dữ liệu người dùng
`frontend/app/format.js` — Tiện ích định dạng số, tiền tệ, ngày giờ và tên viết tắt
`frontend/app/permissions.js` — Bảng phân quyền client dùng để ẩn/hiện nút và thành phần giao diện theo vai trò người dùng
`frontend/app/router.js` — Hash-based router: phân tích URL hash, lazy load module trang và kiểm tra quyền tối thiểu
`frontend/app/state.js` — State store nhỏ phía client: quản lý thông tin phiên làm việc và workspace đang hoạt động
`frontend/app/status.js` — Gom 9 trạng thái chuẩn OCPP thành các nhóm hiển thị màu sắc đồng nhất trên giao diện
`frontend/app/theme-boot.js` — Script chạy sớm trước khi render để áp dụng giao diện sáng/tối từ localStorage tránh nhấp nháy
`frontend/app/theme.js` — Module chuyển đổi giao diện sáng/tối và lưu tuỳ chọn người dùng vào localStorage
`frontend/app/validate.js` — Tiện ích kiểm tra tính hợp lệ của dữ liệu biểu mẫu đăng nhập và đăng ký
`frontend/app/workspace.js` — Cấu hình 5 không gian làm việc (workspaces) và xây dựng menu điều hướng theo vai trò người dùng
`frontend/components/` — Thư mục chứa các thành phần giao diện (UI components) dùng chung
`frontend/components/badge.js` — Component hiển thị huy hiệu trạng thái (status badge)
`frontend/components/donut.js` — Component biểu đồ tròn tỷ lệ phần trăm vẽ bằng SVG thuần
`frontend/components/empty-state.js` — Component hiển thị trạng thái dữ liệu trống (empty state)
`frontend/components/hero.js` — Component phần đầu trang: lời chào, đồng hồ thời gian thực và trạng thái sức khỏe từ /api/health
`frontend/components/icons.js` — Thư viện biểu tượng SVG nội tuyến dùng chung cho toàn bộ giao diện
`frontend/components/kpi-card.js` — Component thẻ đo lường chỉ số hiệu suất (KPI card)
`frontend/components/modal.js` — Component hộp thoại tương tác và ngăn kéo trượt (modal / drawer dialog)
`frontend/components/palette.js` — Component hộp tìm kiếm lệnh nhanh toàn hệ thống (Command Palette Ctrl+K)
`frontend/components/sidebar.js` — Component thanh điều hướng bên (Sidebar) hỗ trợ chuyển đổi workspace và menu chức năng
`frontend/components/station-map.js` — Component bản đồ trạm sạc tích hợp Leaflet hỗ trợ hiển thị vị trí và chọn toạ độ
`frontend/components/table.js` — Component hiển thị bảng dữ liệu với tính năng phân trang và bộ lọc
`frontend/components/toast.js` — Component hiển thị thông báo nổi nhanh (toast notification)
`frontend/components/topbar.js` — Component thanh điều hướng trên cùng: hiển thị thông báo, trạng thái kết nối và menu người dùng
`frontend/index.html` — Trang xác thực người dùng: giao diện đăng nhập và đăng ký tài khoản mới
`frontend/main.js` — Tệp bootstrap phía client: kiểm tra phiên, dựng vỏ workspace theo vai trò và nạp trang theo URL hash
`frontend/pages/` — Thư mục chứa các module trang giao diện theo từng vai trò và chức năng
`frontend/pages/accountant/` — Thư mục trang giao diện dành cho vai trò Kế toán
`frontend/pages/accountant/overview.js` — Trang tổng quan tài chính và đối soát doanh thu dành cho Kế toán
`frontend/pages/admin/` — Thư mục trang giao diện dành cho vai trò Quản trị viên
`frontend/pages/admin/users.js` — Trang quản lý người dùng và cấp phát tài khoản mới dành cho Quản trị viên
`frontend/pages/auth/` — Thư mục trang giao diện xác thực người dùng
`frontend/pages/auth/login.js` — Logic điều khiển giao diện form đăng nhập và form đăng ký
`frontend/pages/driver/` — Thư mục trang giao diện dành cho vai trò Tài xế xe điện
`frontend/pages/driver/overview.js` — Trang tổng quan tối ưu hóa cho màn hình di động dành cho Tài xế xe điện
`frontend/pages/operator/` — Thư mục trang giao diện dành cho vai trò Vận hành viên
`frontend/pages/operator/dashboard.js` — Bảng điều khiển giám sát vận hành mạng lưới trạm sạc thời gian thực của Vận hành viên
`frontend/pages/shared/` — Thư mục chứa các trang giao diện dùng chung giữa nhiều vai trò
`frontend/pages/shared/account.js` — Trang quản lý thông tin tài khoản cá nhân dùng chung cho mọi vai trò
`frontend/pages/shared/charge-points.js` — Trang quản lý danh sách và trạng thái chi tiết các trụ sạc
`frontend/pages/shared/fleet-overview.js` — Trang tổng quan trạng thái vận hành đội xe
`frontend/pages/shared/fleet.js` — Trang quản lý và giám sát danh sách phương tiện trong đội xe
`frontend/pages/shared/map-page.js` — Trang bản đồ toàn màn hình hiển thị mạng lưới trạm sạc
`frontend/pages/shared/station-drawer.js` — Ngăn kéo hiển thị thông tin chi tiết trạm sạc, danh sách trụ và thao tác nhanh
`frontend/pages/shared/station-form.js` — Biểu mẫu tạo mới và chỉnh sửa trạm sạc kèm chọn toạ độ tương tác trên bản đồ
`frontend/pages/shared/stations.js` — Trang danh sách trạm sạc dùng chung cho Chủ trạm, Vận hành viên và Quản trị viên
`frontend/services/` — Thư mục chứa các dịch vụ giao tiếp mạng và API phía client
`frontend/services/api.js` — Wrapper hàm fetch API chuẩn hóa credentials, headers và xử lý ApiError thống nhất
`frontend/services/csms.js` — Dịch vụ gọi API nghiệp vụ CSMS (xác thực, trạm sạc, trụ sạc, tình trạng sức khỏe)
`frontend/services/realtime.js` — Dịch vụ cập nhật dữ liệu thời gian thực (hiện dùng polling định kỳ, sẵn sàng chuyển đổi sang SSE)
`frontend/styles/` — Thư mục chứa các file định kiểu CSS phân lớp theo mô hình token/theme/component
`frontend/styles/components.css` — CSS định kiểu cho các component giao diện dùng chung
`frontend/styles/layout.css` — CSS định kiểu bố cục khung ứng dụng SPA (sidebar, topbar, content viewport)
`frontend/styles/reset.css` — CSS reset chuẩn hóa hiển thị giao diện nhất quán giữa các trình duyệt
`frontend/styles/themes.css` — CSS biến chủ đề định nghĩa bảng màu cho chế độ sáng (light) và tối (dark)
`frontend/styles/tokens.css` — CSS design tokens định nghĩa các giá trị cơ bản: màu sắc, khoảng cách, font chữ, độ bo góc
`frontend/vendor/` — Thư mục chứa các thư viện bên thứ ba tự lưu trữ nội bộ (self-hosted vendor libraries)
`frontend/vendor/leaflet/` — Thư viện bản đồ tương tác mã nguồn mở Leaflet đặt cục bộ (không dùng CDN ngoài)
`frontend/vendor/leaflet/LICENSE` — Giấy phép mã nguồn mở MIT của thư viện Leaflet
`frontend/vendor/leaflet/images/` — Thư mục chứa các tệp hình ảnh tài nguyên của Leaflet
`frontend/vendor/leaflet/images/layers-2x.png` — Biểu tượng lớp bản đồ độ phân giải cao Retina (2x) của Leaflet
`frontend/vendor/leaflet/images/layers.png` — Biểu tượng lớp bản đồ độ phân giải tiêu chuẩn của Leaflet
`frontend/vendor/leaflet/images/marker-icon-2x.png` — Biểu tượng điểm đánh dấu vị trí độ phân giải cao Retina (2x) của Leaflet
`frontend/vendor/leaflet/images/marker-icon.png` — Biểu tượng điểm đánh dấu vị trí tiêu chuẩn của Leaflet
`frontend/vendor/leaflet/images/marker-shadow.png` — Hình ảnh bóng đổ của điểm đánh dấu vị trí Leaflet
`frontend/vendor/leaflet/leaflet.css` — Stylesheet CSS của thư viện bản đồ Leaflet
`frontend/vendor/leaflet/leaflet.js` — Mã nguồn JavaScript của thư viện bản đồ Leaflet
`render.yaml` — Blueprint cấu hình triển khai staging tự động trên nền tảng đám mây Render (Docker Web Service + PostgreSQL)
`run.py` — Script CLI điều khiển toàn bộ vòng đời ứng dụng trên Docker (up, down, reset, logs, status, test, admin, demo)
`test.py` — Script CLI lối tắt thực thi kiểm tra chất lượng toàn diện (ESLint + toàn bộ test suite) bên trong container Docker
`tools/` — Thư mục chứa các công cụ hỗ trợ phát triển và kiểm thử nội bộ
`tools/test_run.py` — Bộ kiểm thử đơn vị độc lập cho logic script run.py (kiểm tra phân tích tham số CLI, xử lý cấu hình mà không cần Docker daemon)

---

## 6. Important Components (Các thành phần quan trọng)

| Thành phần | Đường dẫn thực tế | Mục đích thực tế (Actual Purpose) | Sự liên quan của Tester (Tester Relevance) | Quyền hạn |
|:---|:---|:---|:---|:---:|
| **Root Compose** | `docker-compose.yml` | Điều phối cụm container gồm 3 dịch vụ: `db` (Postgres 16, 5432), `db_test` (Postgres 16, 5433), `app` (Node.js 22, 3000) | Điểm chạy kịch bản nghiệm thu container (`S01-AC-01`, `TC-S01-01`). Kiểm tra healthcheck, network isolation, port binding | Read-Only |
| **Root README** | `README.md` | Tài liệu giới thiệu dự án, hướng dẫn cài đặt môi trường, ma trận tài khoản seed và lệnh chạy | Nguồn đối chiếu Acceptance Criteria S-01, danh sách tài khoản seed mặc định và ma trận vai trò | Read-Only |
| **Contributing Guide** | `CONTRIBUTING.md` | Quy ước làm việc nhóm: đặt tên nhánh theo mã Jira, cú pháp commit, checklist PR | Đảm bảo tính nhất quán trong quy trình đóng góp và truy vết mã nguồn theo Jira | Read-Only |
| **Lint Config** | `eslint.config.js` | Cấu hình ESLint flat config cho backend và frontend JavaScript | Dùng để chạy `npm run lint`, xác minh chuẩn cú pháp và quy tắc an toàn tĩnh | Read-Only |
| **Staging Config** | `render.yaml` | Blueprint khai báo hạ tầng staging trên Render (web service Docker + database Postgres) | Điểm đối chiếu cấu hình môi trường staging và biến môi trường triển khai đám mây | Read-Only |
| **CLI Runner** | `run.py`, `test.py` | Script Python điều khiển Docker và chạy toàn bộ test suite (`python run.py test`) | Tiện ích thực thi kiểm thử nhanh và quản trị môi trường local của Tester | Read-Only |
| **CI/CD Workflow** | `.github/workflows/ci.yml` | Định nghĩa pipeline GitHub Actions tự động kiểm tra lint, test và build Docker | Giúp Tester đối chiếu môi trường CI với máy host và theo dõi trạng thái build | Read-Only |
| **Backend Environment** | `backend/src/config/env.js` | Nạp và validate các biến môi trường bằng Zod schema (`PORT`, `DATABASE_URL`, `JWT_SECRET`,...) | Trọng tâm kiểm thử `S01-NFR-01`: secrets nạp từ biến môi trường, fail-fast nếu thiếu | Read-Only |
| **Node Compatibility** | `backend/src/config/nodeVersion.js`| Kiểm tra phiên bản Node.js máy host (yêu cầu tối thiểu >= 22.7.0) | Điểm kiểm thử `UT-NODE-01` xác minh tính tương thích môi trường thực thi | Read-Only |
| **Database Pool & Tx** | `backend/src/db/pool.js`, `tx.js` | Quản lý kết nối PostgreSQL qua `pg.Pool` và hỗ trợ bọc database transaction | Đối tượng kiểm thử `TC-T01-04`: kết nối cơ sở dữ liệu an toàn, giải phóng connection đúng chuẩn | Read-Only |
| **Ownership Scope** | `backend/src/db/scope.js` | Chứa hàm dùng chung `scopeByOwner` áp đặt điều kiện `WHERE s.owner_id = ?` cho vai trò `STATION_OWNER` | Trọng tâm kiểm thử `S-03 / T-07` và `S03-NFR-01`: cô lập dữ liệu tại tầng truy vấn DB | Read-Only |
| **Database Migrations** | `backend/migrations/*.sql` | Chứa 5 cặp tệp SQL DDL migration forward/rollback (001 baseline, 002 throttle, 003 stations owner, 004 station management, 005 charge point code upper) | Đối tượng kiểm thử `T-01`, `T-04`, `T-07`, `T-08`, `T-10`: migration up/down trên DB test 5433 | Read-Only |
| **Password Security** | `backend/src/lib/password.js` | Cung cấp hàm băm và xác thực mật khẩu sử dụng duy nhất thuật toán **Argon2id** | Trọng tâm kiểm thử `S02-NFR-01`: loại bỏ hoàn toàn bcrypt, băm mật khẩu chuẩn Argon2id | Read-Only |
| **Role Matrix** | `backend/src/lib/roles.js`, `backend/src/security/permissions.js` | Định nghĩa 5 vai trò hệ thống và ma trận phân quyền chi tiết cho từng vai trò | Đối tượng kiểm thử `T-04-04` (đúng 5 roles) và `S03-AC-03` (phân quyền vai trò) | Read-Only |
| **Route Guard** | `backend/src/security/routeGuard.js` | Middleware bảo vệ route kiểm tra quyền hạn theo ma trận và cơ chế **Default Deny** (403 cho route chưa khai quyền) | Trọng tâm kiểm thử `S-03 / T-06`: chặn 403 khi thiếu quyền hoặc route chưa đăng ký | Read-Only |
| **Auth & Throttle** | `backend/src/modules/auth/` | Cung cấp router, service, schema đăng nhập và repository `login-throttle.repository.js` | Trọng tâm kiểm thử `S-02 / T-05`: khóa tạm thời 15 phút sau 5 lần sai, cấp cookie HttpOnly | Read-Only |
| **Audit Logging** | `backend/src/modules/audit/audit.repository.js` | Ghi nhận nhật ký an ninh vào bảng `audit_logs` khi có sự kiện vi phạm (`ACCESS_DENIED`) | Điểm kiểm thử `S03-AC-02` và `T07-02`: xác minh vết kiểm toán trong database | Read-Only |
| **Station & Charge Modules**| `backend/src/modules/stations/`, `charge-points/` | Cung cấp API quản lý trạm sạc (CRUD, toạ độ, idempotency), trụ sạc (mã duy nhất, 1-4 connectors) và `connection-registry.js` socket OCPP | Điểm kiểm thử quản lý trạm sạc S-04, trụ sạc S-05 (T-10, T-11), phân quyền RBAC và Ownership Isolation | Read-Only |
| **Error Handling** | `backend/src/middlewares/errorHandler.js` | Bắt lỗi tập trung và chuẩn hóa cấu trúc JSON response `{ error: { code, message, details } }` | Điểm kiểm thử tích hợp `TC-FB-04` và `UT-ERR-01` | Read-Only |
| **CSRF / Origin Guard** | `backend/src/middlewares/requireJson.js` | Bắt buộc `Content-Type: application/json` và kiểm tra header `Origin` khớp với `APP_ORIGIN` | Điểm kiểm thử tích hợp `TC-FB-11` phòng vệ tấn công CSRF | Read-Only |
| **Dev Test Suites** | `backend/tests/` | Toàn bộ bộ test tự động của Developer (acceptance, integration, unit) | Nguồn cung cấp bằng chứng tự động (Automated Evidence) khách quan cho Tester | Read-Only |
| **Frontend Core JS** | `frontend/services/api.js`, `frontend/app/{auth,router,workspace,validate}.js` | Mã nguồn điều hướng client, wrapper gọi fetch API, quản lý phiên cookie và kiểm tra form | Đối tượng kiểm thử tích hợp Frontend ↔ Backend `FB-01` đến `FB-11` | Read-Only |
| **Frontend Shell & Pages** | `frontend/index.html`, `frontend/app.html`, `frontend/main.js`, `frontend/pages/**` | Giao diện SPA theo vai trò, quản lý trạm Leaflet và điều khiển logic client | Đối tượng kiểm thử giao diện UI, chuyển hướng vai trò, CRUD trạm và Idempotency-Key | Read-Only |
| **Security Audit Framework** | `docs/Audit/` | Khung tiêu chuẩn kiểm toán bảo mật 5 bước module hóa độc lập AI Security Audit v3.0 | Tiêu chuẩn đánh giá bảo mật, runbook quét lỗ hổng và hồ sơ kết quả kiểm toán | **Tester Quản Lý** |
| **QA Documentation** | `docs/` | Toàn bộ hệ thống hồ sơ và tài liệu kiểm thử của dự án CSMS | Nơi Tester làm việc, thiết kế test, ghi nhận bằng chứng và báo cáo hiện trạng | **Tester Quản Lý** |

---

## 7. QA Documentation Map (Bản đồ tài liệu QA)

Hệ thống tài liệu kiểm định chất lượng của dự án được cấu trúc rõ ràng theo phân vùng chức năng:

| Tệp / Thư mục | Mục đích thực tế (Actual Purpose) | Khi nào cập nhật (Trigger) | Quan hệ với các tài liệu QA khác |
|:---|:---|:---|:---|
| **[`docs/README.md`](./README.md)** | **AI Tester Entry Point & Router**: Điểm tiếp nhận nhiệm vụ đầu vào, hướng dẫn thứ tự đọc tài liệu và routing logic cho từng loại lệnh kiểm thử. | Khi có thay đổi về quy trình tiếp nhận nhiệm vụ hoặc bổ sung router mới. | Điều hướng AI Tester tra cứu đúng tài liệu nghiệp vụ; không chứa nội dung luật chi tiết. |
| **[`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md)** | **Central Rulebook & Standards**: Bộ quy chuẩn trung tâm chứa toàn bộ nguyên tắc kiểm thử, luồng Requirement Testing vs General Review, mô hình E→S→T, đồ thị phụ thuộc đa cấp, Canonical Enums, tiêu chuẩn bằng chứng và an toàn. | Khi có sự thay đổi về chính sách kiểm thử hoặc cập nhật phiên bản quy chuẩn. | Là nguồn luật pháp lý cao nhất chi phối toàn bộ hoạt động của Tester. |
| **[`docs/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md)** | **Verified Project Map (Project Facts)**: Bản đồ cấu trúc 298 mục trên filesystem đã xác minh, component mapping, đồ thị phụ thuộc thực tế, ánh xạ lịch sử kiểm thử và metadata snapshot. | Trước mỗi task kiểm thử mới (đồng bộ nếu filesystem thay đổi) hoặc khi có file/module mới. | Cung cấp sự thật cấu trúc (Project Facts) cho mọi tác vụ QA. |
| **[`docs/TEST_INVENTORY.md`](./TEST_INVENTORY.md)** | **Verified Test Index (Test Facts)**: Danh mục toàn bộ 92 Test Case thực tế của dự án, tình trạng PASS/FAIL/BLOCKED, bằng chứng liên kết và mức độ xác minh. | Bắt buộc cập nhật ngay sau khi thực thi bất kỳ ca kiểm thử nào. | Cung cấp dữ liệu sự thật kiểm thử (Test Facts) cho báo cáo chất lượng. |
| **[`docs/OPERATIONS.md`](./OPERATIONS.md)** | **Sổ tay vận hành hệ thống**: Chi tiết hướng dẫn Docker, cấu hình cổng mạng, lệnh reset DB, seed demo và biến môi trường staging. | Khi thay đổi cấu hình runtime, cổng mạng hoặc quy trình triển khai. | Hỗ trợ Tester thiết lập đúng môi trường trước khi chạy test. |
| **[`docs/SPRINT_STATUS.md`](./SPRINT_STATUS.md)** | **Báo cáo tiến độ Sprint**: Bảng tổng kết trạng thái thực hiện các User Story theo từng Sprint. | Khi kết thúc sprint hoặc có thay đổi trạng thái story. | Đối chiếu phạm vi hoàn thành của team với yêu cầu PO. |
| **[`docs/SPRINT_2_PLAN.md`](./SPRINT_2_PLAN.md)** | **Kế hoạch chi tiết Sprint 2**: Đề xuất phân làn kỹ thuật, thiết kế module OCPP, WebSocket server, simulator và lịch trình thực hiện. | Khi lập kế hoạch và điều chỉnh tiến độ Sprint 2. | Cung cấp bối cảnh kiến trúc cho các kiểm thử OCPP tiếp theo. |
| **`docs/Audit/`** | **Khung kiểm toán an ninh AI Security Audit v3.0**: Bộ tiêu chuẩn 15 nguyên tắc, runbook 5 bước, từ điển catalog bài test, templates và kết quả kiểm toán an ninh. | Sau mỗi chu kỳ kiểm toán bảo mật định kỳ. | Cung cấp bằng chứng an ninh chuyên sâu bổ trợ cho QA. |
| **`docs/stories/`** | **Hồ sơ kiểm thử User Stories**: Chứa chi tiết kiểm thử cho từng Story từ `S-01.md` đến `S-05.md` (*vị trí thực tế nằm tại `docs/stories/`*). | Khi Story hoặc Task kỹ thuật liên quan có sự cập nhật hoặc chạy lại kiểm thử. | Phản ánh chi tiết kết quả cụm bài test baseline/story vào `TEST_INVENTORY.md`. |
| **`docs/spikes/`** | **Tài liệu nghiên cứu kỹ thuật & Báo cáo PO**: Chứa tài liệu spike OCPP (`K-01-ocpp-simulator.md`), mã thử nghiệm `k01/`, session log và báo cáo gửi PO (`S-05-AC3-ghi-nhan-cho-PO.md`). | Khi hoàn thành đợt nghiên cứu spike kỹ thuật hoặc gửi kiến nghị/báo cáo lên PO. | Cung cấp luận cứ kỹ thuật và bối cảnh kiến trúc cho các quyết định nghiệp vụ của PO. |
| **`docs/integration/`** | **Hồ sơ kiểm thử tích hợp**: Kịch bản và bằng chứng kiểm thử giao tiếp toàn trình giữa Frontend Client và Backend API (`FRONTEND_BACKEND.md` từ FB-01 đến FB-11). | Khi hợp đồng API, cấu hình fetch client hoặc chuỗi middleware Express thay đổi. | Tổng hợp kết quả tích hợp đa tầng giữa S-01, S-02 và S-03. |
| **`docs/testing/TEST_PLAN.md`** | **Kế hoạch kiểm thử tổng thể**: Chiến lược kiểm thử đa tầng, môi trường yêu cầu, tiêu chí Entry/Exit và phạm vi các đợt phát hành. | Khi bắt đầu sprint mới hoặc thay đổi phạm vi kiểm thử. | Định nghĩa phạm vi tổng thể cho các tài liệu kiểm thử chi tiết. |
| **`docs/testing/TEST_REPORT.md`** | **Báo cáo kết quả snapshot**: Báo cáo tổng hợp chất lượng tại mốc snapshot hiện tại, tỷ lệ PASS/FAIL, các rào cản môi trường. | Khi hoàn thành chu kỳ kiểm thử snapshot hoặc trước các mốc release. | Tổng hợp số liệu từ `TEST_INVENTORY.md`. |
| **`docs/testing/BUG_REPORT.md`** | **Hồ sơ lỗi & rào cản**: Lưu trữ chi tiết các lỗi mã nguồn (`CODE_DEFECT`) và rào cản môi trường/cấu hình (`ENVIRONMENT_BLOCKER`, `CONFIGURATION_PROBLEM`). | Ngay khi phát hiện lỗi hoặc khi lỗi được giải quyết. | Kết nối trực tiếp với các Test Case bị FAIL/BLOCKED trong `TEST_INVENTORY.md`. |
| **`docs/testing/REGRESSION_REPORT.md`** | **Báo cáo kiểm thử hồi quy**: Ghi nhận kết quả chạy lại test cũ sau các đợt refactor và bảng so sánh hành vi giữa các phiên bản. | Sau mỗi đợt refactor mã nguồn hoặc sửa bug của Developer. | Nhận đầu vào từ bản đồ tác động `Impact / Regression Map`. |

---

## 8. Requirement → Task → Source Mapping

Ma trận liên kết từ Yêu cầu nghiệp vụ đến Mã nguồn thực tế và Bộ kiểm thử tương ứng:

| Epic cha | Jira Story | Task kỹ thuật | Tiêu chí chính (AC / NFR) | Thành phần mã nguồn thực tế (Source Mapping) | Dev Automated Tests (Evidence) | QA Test Document & Test IDs |
|:---:|:---|:---|:---|:---|:---|:---|
| **E-01** | **S-01** | **T-01** | `S01-AC-01`<br>`S01-NFR-01`<br>`S01-NFR-02`<br>`T01-01`..`05`<br>`T01-NFR-01` | • `docker-compose.yml`<br>• `backend/Dockerfile`<br>• `backend/src/config/env.js`<br>• `backend/src/config/nodeVersion.js`<br>• `backend/src/modules/health/health.routes.js`<br>• `backend/migrations/001_baseline.sql`<br>• `backend/src/db/migrate.js`, `pool.js`<br>• `frontend/index.html`<br>• `backend/scripts/create-admin.js` | • `backend/tests/acceptance/S-01.baseline.test.js`<br>• `backend/tests/integration/migrate.test.js`<br>• `backend/tests/integration/create-admin.test.js`<br>• `backend/tests/unit/env.test.js`<br>• `backend/tests/unit/nodeVersion.test.js`<br>• `backend/tests/unit/no-backdoor.test.js` | [`docs/stories/S-01.md`](./stories/S-01.md)<br>(`TC-S01-01`..`03`, `TC-T01-01`..`04`, `UT-NODE-01`, `UT-BACKDOOR-01`, `UT-ENV-01`, `UT-ERR-01`, `IT-MIGRATE-01`, `IT-ADMIN-01`, `ACC-S01-01`, `MAN-S01-01`..`02`) |
| **E-02** | **S-02** | **T-04** | `T04-01`..`04`<br>`T04-NFR` | • `backend/migrations/001_baseline.sql`<br>• `backend/src/lib/roles.js`<br>• `backend/src/lib/password.js`<br>• `backend/src/modules/users/users.repository.js` | • `backend/tests/acceptance/S-02.login.test.js`<br>• `backend/tests/integration/auth.regression.test.js` | [`docs/stories/S-02.md`](./stories/S-02.md)<br>(`TC-T04-01`..`05`) |
| **E-02** | **S-02** | **T-05** | `S02-AC-01`..`04`<br>`S02-NFR-01`<br>`S02-NFR-02`<br>`T05-01`..`03`<br>`T05-NFR-01`..`03` | • `backend/src/modules/auth/auth.routes.js`<br>• `backend/src/modules/auth/auth.service.js`<br>• `backend/src/modules/auth/auth.schema.js`<br>• `backend/src/modules/auth/login-throttle.repository.js`<br>• `backend/migrations/002_login_throttle_drop_user_lockout.sql`<br>• `backend/src/middlewares/authenticate.js`<br>• `frontend/app/auth.js`<br>• `frontend/pages/auth/login.js`<br>• `frontend/index.html` | • `backend/tests/acceptance/S-02.login.test.js`<br>• `backend/tests/acceptance/S-02.login-ip.test.js`<br>• `backend/tests/acceptance/S-02.frontend.test.js`<br>• `backend/tests/integration/auth.regression.test.js` | [`docs/stories/S-02.md`](./stories/S-02.md)<br>(`TC-S02-01`..`04`, `TC-T05-01`..`04`, `ACC-S02-01`..`04`, `IT-AUTH-01`) |
| **E-02** | **S-03** | **T-06** | `S03-AC-03`<br>`S03-AC-04`<br>`T06-01`<br>`T06-02` | • `backend/src/security/permissions.js`<br>• `backend/src/security/routeGuard.js`<br>• `backend/src/app.js`<br>• `frontend/app/router.js` | • `backend/tests/acceptance/S-03.rbac.test.js`<br>• `backend/tests/acceptance/S-03.rbac-matrix.test.js`<br>• `backend/tests/acceptance/S-03.route-guard.test.js`<br>• `backend/tests/acceptance/S-03.accounts.test.js` | [`docs/stories/S-03.md`](./stories/S-03.md)<br>(`TC-S03-03`, `TC-S03-04`, `TC-T06-01`, `TC-T06-02`) |
| **E-02** | **S-03** | **T-07** | `S03-AC-01`<br>`S03-AC-02`<br>`S03-NFR-01`<br>`T07-01`..`03`<br>`T07-NFR` | • `backend/src/db/scope.js` (`scopeByOwner`)<br>• `backend/src/modules/stations/`<br>• `backend/src/modules/charge-points/`<br>• `backend/src/modules/audit/audit.repository.js`<br>• `backend/migrations/003_stations_owner.sql`<br>• `frontend/pages/shared/stations.js` | • `backend/tests/unit/scope.test.js`<br>• `backend/tests/acceptance/S-03.rbac.test.js`<br>• `backend/tests/acceptance/S-03.accounts.test.js` | [`docs/stories/S-03.md`](./stories/S-03.md)<br>(`TC-S03-01`, `TC-S03-02`, `TC-T07-01`..`03`) |
| **E-03** | **S-04** | **T-08, T-09** | `S04-AC-01`..`04`<br>`S04-NFR-01`<br>`T08-01`<br>`T08-NFR-01`<br>`T09-01`<br>`T09-NFR-01` | • `backend/migrations/004_station_management.sql`<br>• `backend/src/modules/stations/stations.routes.js`<br>• `backend/src/modules/stations/stations.service.js`<br>• `backend/src/modules/stations/stations.schema.js`<br>• `backend/src/modules/stations/stations.repository.js`<br>• `frontend/pages/shared/stations.js`<br>• `frontend/pages/shared/station-form.js` | • `backend/tests/acceptance/S-04.station-management.test.js`<br>• `backend/tests/unit/station-schema.test.js`<br>• `backend/tests/integration/migrate.test.js` | [`docs/stories/S-04.md`](./stories/S-04.md)<br>(`TC-S04-01`..`07`, `TC-T08-01`..`03`, `TC-T09-01`..`03`) |
| **E-03** | **S-05** | **T-10, T-11** | `S05-AC-01`..`03`<br>`S05-NFR-01`<br>`T10-01`<br>`T11-01` | • `backend/migrations/005_charge_point_code_upper.sql`<br>• `backend/src/modules/charge-points/charge-points.repository.js`<br>• `backend/src/modules/charge-points/charge-points.service.js`<br>• `backend/src/modules/charge-points/charge-points.schema.js`<br>• `backend/src/modules/charge-points/charge-points.routes.js`<br>• `backend/src/modules/charge-points/connection-registry.js`<br>• `frontend/pages/shared/charge-points.js`<br>• `frontend/pages/shared/station-drawer.js` | • `backend/tests/acceptance/S-05.charge-point-code.test.js`<br>• `backend/tests/unit/connection-registry.test.js`<br>• `backend/tests/integration/migrate.test.js` | [`docs/stories/S-05.md`](./stories/S-05.md)<br>(`TC-S05-01`..`03`, `TC-T10-01`, `TC-T11-01`, `ACC-S05-01`..`02`) |
| **Cross-Epic** | **Integration** | **FB-01 .. FB-11** | Hợp đồng API, Cookie credentials, Error envelope, CSRF guard | • `frontend/services/api.js`<br>• `frontend/app/auth.js`<br>• `frontend/app/router.js`<br>• `frontend/app/validate.js`<br>• `backend/src/app.js`<br>• `backend/src/middlewares/errorHandler.js`<br>• `backend/src/middlewares/requireJson.js` | • `backend/tests/unit/frontend.test.js`<br>• `backend/tests/acceptance/S-02.frontend.test.js`<br>• `backend/tests/acceptance/S-03.csrf.test.js` | [`docs/integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)<br>(`TC-FB-01` đến `TC-FB-11`) |

---

## 9. Dependency Map (Bản đồ phụ thuộc hệ thống)

> **Lưu ý quy chuẩn**: Quan hệ phụ thuộc (Dependency) là quan hệ điều kiện tiên quyết (Prerequisite), hoàn toàn tách biệt với quan hệ phân cấp (Hierarchy). Quy tắc phân tích phụ thuộc được quy định tại [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md#6-quy-tắc-phân-tích-phụ-thuộc-dependency-rules).

### 9.1. Story → Story Dependency
- **`S-01`**: Cột mốc khởi nguyên (Root Baseline). Không phụ thuộc Story nào khác.
- **`S-02`**: Phụ thuộc trực tiếp vào **`S-01`** (Cần cụm container app + database và migration schema baseline hoạt động để lưu bảng users).
- **`S-03`**: Phụ thuộc trực tiếp vào **`S-02`** (Cần phiên làm việc và danh tính đã xác thực của người dùng để kiểm tra phân quyền RBAC và quyền sở hữu).
- **`S-04`**: Phụ thuộc trực tiếp vào **`S-03`** (Cần vai trò `STATION_OWNER` và cơ chế cô lập dữ liệu đã xác thực để tạo và sửa trạm của chính mình).
- **`S-05`**: Phụ thuộc trực tiếp vào **`S-04`** (Khai báo trụ sạc và đầu nối phụ thuộc vào trạm sạc đã được tạo trước).
- **`S-47`** *(Downstream)*: Phụ thuộc vào **`S-04`** (Tìm trạm sạc gần phụ thuộc vào toạ độ số thực hợp lệ được lưu trữ tại S-04).
- **`K-01`** *(Downstream)*: Phụ thuộc vào **`S-05`** (Kết nối mô phỏng OCPP yêu cầu trụ sạc và mã định danh duy nhất đã được khai báo).
- **`Integration (FB-01..11)`**: Phụ thuộc đồng thời vào **`S-01`**, **`S-02`**, **`S-03`**, **`S-04`** và **`S-05`** (Đòi hỏi runtime sẵn sàng, xác thực cookie hoạt động, route guard áp dụng, API trạm sạc và trụ sạc sẵn sàng).

### 9.2. Task → Task Dependency
- **`T-01`** (Khởi tạo DB & Container) $\longrightarrow$ **Độc lập ban đầu**.
- **`T-04`** (Bảng users, roles & seed) $\longrightarrow$ Phụ thuộc vào **`T-01`** (yêu cầu PostgreSQL connection pool và runner migration `migrate.js`).
- **`T-05`** (Login, session cookie & throttle) $\longrightarrow$ Phụ thuộc vào **`T-04`** (yêu cầu có bảng `users`, 5 vai trò trong `roles`, và mật khẩu băm Argon2id).
- **`T-06`** (Route Guard & Default Deny) $\longrightarrow$ Phụ thuộc vào **`T-05`** (yêu cầu middleware `authenticate.js` trích xuất thông tin `req.user`).
- **`T-07`** (Ownership Scope & Audit Log) $\longrightarrow$ Phụ thuộc vào **`T-06`** (yêu cầu vượt qua bước kiểm tra vai trò tại route guard trước khi áp đặt điều kiện lọc sở hữu `scopeByOwner`).
- **`T-08`** (Khai báo trạm, toạ độ & schema) $\longrightarrow$ Phụ thuộc vào **`T-07`** (yêu cầu bảng `stations` và cột `owner_id` kết hợp với `scopeByOwner`).
- **`T-09`** (Sửa trạm, danh sách trạm & chống double-click) $\longrightarrow$ Phụ thuộc vào **`T-08`** (yêu cầu endpoint tạo trạm và bảng `station_idempotency_keys` hoạt động).
- **`T-10`** (Bảng `charge_points`, `connectors` kèm migration 005 và ràng buộc) $\longrightarrow$ Phụ thuộc vào **`T-08`** (yêu cầu bảng `stations` và khoá ngoại `station_id`).
- **`T-11`** (API khai báo trụ và đầu nối, kiểm tra mã duy nhất) $\longrightarrow$ Phụ thuộc vào **`T-10`** (yêu cầu schema và ràng buộc cơ sở dữ liệu sẵn sàng).

### 9.3. Test → Prerequisite Dependency
- **`TC-S01-01`** $\longrightarrow$ Tiền đề: Docker Desktop đang chạy, cổng 3000 và 5432 chưa bị chiếm dụng.
- **`TC-S02-01`..`03`** $\longrightarrow$ Tiền đề: Container `app` và `db` ở trạng thái healthy; database đã seed tài khoản test (`admin@csms.local`,...).
- **`TC-S03-01`..`02`** $\longrightarrow$ Tiền đề: Đã chạy migration 003, phiên đăng nhập hợp lệ của Station Owner được nạp (qua cookie header).
- **`TC-S04-01`..`04`** $\longrightarrow$ Tiền đề: Đã chạy migration 004, đăng nhập vai trò `STATION_OWNER`, có header `Idempotency-Key` khi tạo trạm.
- **`TC-S05-01`..`03`** $\longrightarrow$ Tiền đề: Đã chạy migration 005, đăng nhập vai trò `STATION_OWNER`, đã có trạm sạc thuộc sở hữu của chủ trạm.
- **`TC-FB-01`..`11`** $\longrightarrow$ Tiền đề: Express server lắng nghe trên port 3000, serve thư mục tĩnh `frontend/`.

### 9.4. Source → Dependent Component
- `backend/src/config/env.js` $\longrightarrow$ Ảnh hưởng toàn bộ ứng dụng: `pool.js`, `app.js`, `server.js`.
- `backend/src/lib/password.js` $\longrightarrow$ Ảnh hưởng trực tiếp: `create-admin.js`, `auth.service.js`, `users.service.js`.
- `backend/src/middlewares/authenticate.js` $\longrightarrow$ Ảnh hưởng trực tiếp: mọi route được bảo vệ trong `app.js`.
- `backend/src/db/scope.js` $\longrightarrow$ Ảnh hưởng trực tiếp: `stations.repository.js`, `charge-points.repository.js`.
- `backend/src/modules/stations/stations.service.js` $\longrightarrow$ Ảnh hưởng trực tiếp: API CRUD trạm sạc, phân quyền owner.
- `backend/src/modules/charge-points/charge-points.service.js` $\longrightarrow$ Ảnh hưởng trực tiếp: API CRUD trụ sạc, validation mã duy nhất và sinh tự động connectors.

---

## 10. Source → Historical Test Mapping (Bản đồ ánh xạ lịch sử kiểm thử)

Bảng đối chiếu phục vụ tra cứu nhanh các bài test lịch sử bị ảnh hưởng khi một thành phần mã nguồn có sự thay đổi:

| Thành phần mã nguồn (Source Component) | Test Case ID | Story liên kết | Task liên kết | Tiêu chí yêu cầu | Trạng thái lịch sử | Snapshot xác minh |
|:---|:---|:---:|:---:|:---|:---:|:---:|
| `backend/src/config/env.js` | `TC-S01-02`<br>`UT-ENV-01` | S-01 | T-01 | `S01-NFR-01`<br>`T01-NFR-01` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/config/nodeVersion.js` | `UT-NODE-01` | S-01 | T-01 | Node >= 22.7 | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/migrations/001_baseline.sql` | `TC-T01-01`<br>`TC-T01-03`<br>`TC-T04-01`..`05`<br>`IT-MIGRATE-01` | S-01<br>S-02 | T-01<br>T-04 | `T01-01`..`05`<br>`T04-01`..`05` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/migrations/002_login_throttle_...` | `TC-S02-03`<br>`TC-T05-02`..`03` | S-02 | T-05 | `S02-AC-03`<br>`T05-02`..`03` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/migrations/003_stations_owner.sql` | `TC-S03-01`<br>`TC-T07-01` | S-03 | T-07 | `S03-AC-01`<br>`T07-01` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/lib/password.js` | `TC-S02-01`<br>`TC-T04-NFR` | S-02 | T-04 | `S02-NFR-01`<br>`T04-NFR` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/modules/auth/auth.service.js` | `TC-S02-01`..`02`<br>`ACC-S02-01`<br>`IT-AUTH-01` | S-02 | T-05 | `S02-AC-01`..`02`<br>`T05-01` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/modules/auth/login-throttle.repository.js` | `TC-S02-03`<br>`ACC-S02-02`<br>`TC-T05-02` | S-02 | T-05 | `S02-AC-03`<br>`S02-NFR-02` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/security/routeGuard.js` | `TC-S03-03`<br>`TC-T06-02`<br>`TC-S03-04` | S-03 | T-06 | `S03-AC-03`<br>`T06-02`<br>`S03-AC-04` | **PASS**<br>**PASS**<br>**NOT VERIFIED** | 24/09/2026 (`4bc5758`) |
| `backend/src/db/scope.js` | `TC-S03-01`<br>`TC-T07-01`<br>`TC-T07-03` | S-03 | T-07 | `S03-AC-01`<br>`S03-NFR-01`<br>`T07-NFR` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/modules/audit/audit.repository.js` | `TC-S03-02`<br>`TC-T07-02` | S-03 | T-07 | `S03-AC-02`<br>`T07-02` | **PASS** | 24/09/2026 (`4bc5758`) |
| `frontend/services/api.js` | `TC-FB-01`<br>`TC-S02-04` | Integration<br>S-02 | FB-01<br>S-02 | `FB-01`<br>`S02-AC-04` | **PASS** | 24/09/2026 (`4bc5758`) |
| `frontend/app/router.js` | `TC-FB-06`<br>`TC-S02-04` | Integration<br>S-02 | FB-06<br>S-02 | `FB-06`<br>`S02-AC-04` | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/middlewares/errorHandler.js` | `TC-FB-04`<br>`UT-ERR-01` | Integration<br>S-01 | FB-04<br>T-01 | `FB-04`<br>Standard Error | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/src/middlewares/requireJson.js` | `TC-FB-11` | Integration | FB-11 | `FB-11`<br>CSRF Defense | **PASS** | 24/09/2026 (`4bc5758`) |
| `backend/migrations/004_station_management.sql` | `TC-S04-01`<br>`TC-T08-01`<br>`IT-MIGRATE-01` | S-04 | T-08 | `S04-AC-01`<br>`T08-01` | **PASS** | 27/09/2026 (`4ab9f0f`) |
| `backend/src/modules/stations/stations.service.js` | `TC-S04-01`..`04`<br>`TC-T08-01`..`03`<br>`TC-T09-01`..`03` | S-04 | T-08<br>T-09 | `S04-AC-01`..`04`<br>`S04-NFR-01` | **PASS** | 27/09/2026 (`4ab9f0f`) |
| `backend/src/modules/stations/stations.schema.js` | `TC-S04-02`<br>`TC-T08-02`<br>`TC-T08-NFR-01` | S-04 | T-08 | `S04-AC-02`<br>`S04-NFR-01` | **PASS** | 27/09/2026 (`4ab9f0f`) |
| `backend/src/modules/charge-points/connection-registry.js` | `UT-CP-01` | S-05 (Prep) | K-01 | OCPP Socket Registry | **PASS** | 27/09/2026 (`4ab9f0f`) |
| `frontend/pages/shared/stations.js` | `TC-S04-03`<br>`TC-S04-04`<br>`TC-T08-03`<br>`TC-T09-02` | S-04 | T-08<br>T-09 | `S04-AC-03`<br>`S04-AC-04` | **PASS** | 27/09/2026 (`4ab9f0f`) |
| `backend/migrations/005_charge_point_code_upper.sql` | `TC-S05-01`<br>`TC-T10-01`<br>`IT-MIGRATE-01` | S-05 | T-10 | `S05-AC-01`<br>`T10-01` | **PASS** | 28/09/2026 (`8676994`) |
| `backend/src/modules/charge-points/charge-points.service.js` | `TC-S05-01`..`02`<br>`TC-S05-03` | S-05 | T-10<br>T-11 | `S05-AC-01`..`02`<br>`S05-AC-03` | **PASS**<br>**NOT VERIFIED** | 28/09/2026 (`8676994`) |
| `backend/src/modules/charge-points/charge-points.schema.js` | `TC-S05-01`<br>`TC-T11-01` | S-05 | T-11 | `S05-AC-01`<br>Connector range 1-4 | **PASS** | 28/09/2026 (`8676994`) |

---

## 11. Project-Specific Hierarchy & Traceability Facts (Phân cấp nhiệm vụ & Thực tế truy vết dự án)

> **Lưu ý quy chuẩn**: Toàn bộ quy tắc chuẩn mực về Mô hình truy vết 4 tầng, Canonical Enums và cơ chế State Transition được quản lý tập trung tại [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md#7-mô-hình-truy-vết-chuẩn-canonical-traceability-model). Phần này chỉ lưu trữ các sự thật cấu trúc (Project Facts) của dự án CSMS.

### 11.1. Project Hierarchy Facts (Cây phân cấp nhiệm vụ thực tế của dự án CSMS)
Thực tế mã nguồn và hồ sơ Jira chính thức từ Product Backlog của PO (Mentor Lê Đình Tuấn) được phân cấp theo mô hình 3 tầng chuẩn $E \rightarrow S \rightarrow T$:

```text
CSMS-CORE (Khối nền tảng hạ tầng, bảo mật và quản lý trạm sạc CSMS)
├── E-01: Hạ tầng, CI/CD và môi trường [Must]
│   │   (Mục tiêu: Mọi thành viên chạy được dự án và 20 trụ ảo bằng 1 lệnh; CI chặn merge kịch bản thất bại)
│   └── S-01: Khung ứng dụng chạy được trên máy cá nhân [Must | 3 SP]
│       └── T-01: Dựng khung dự án và kết nối cơ sở dữ liệu (docker-compose, postgres, migration 001)
├── E-02: Tài khoản, đối tác và phân quyền [Must]
│   │   (Mục tiêu: 5 vai trò; Chủ trạm A không xem được trạm Chủ trạm B; Route chưa khai quyền bị chặn mặc định)
│   ├── S-02: Đăng nhập bằng email và mật khẩu, khoá tạm khi sai nhiều lần [Must | 2 SP]
│   │   ├── T-04: Bảng users, roles kèm migration 001, seed 5 vai trò và mật khẩu argon2id
│   │   └── T-05: Form đăng nhập, tạo phiên cookie httpOnly, đếm lần sai và khoá tạm 15 phút
│   └── S-03: Mỗi vai trò chỉ thấy và thao tác được phần việc của mình [Must | 2 SP]
│       ├── T-06: Middleware kiểm vai trò routeGuard, mặc định từ chối route chưa khai quyền
│       └── T-07: Lọc theo quyền sở hữu ở tầng truy vấn (scopeByOwner) và test 403 bằng curl
└── E-03: Trạm sạc, trụ và đầu nối [Must]
    │   (Mục tiêu: Cây dữ liệu 3 tầng trạm/trụ/đầu nối; mã trụ duy nhất; trạm tạm ngừng không nhận phiên mới)
    ├── S-04: Chủ trạm tạo và sửa thông tin trạm sạc [Must | 2 SP]
    │   ├── T-08: Bảng stations kèm migration 004 và liên kết chủ sở hữu (toạ độ số thực, index owner_id)
    │   └── T-09: Màn hình tạo, sửa và danh sách trạm của chủ trạm (idempotency key chống double-click)
    └── S-05: Chủ trạm thêm trụ và đầu nối vào trạm, mã trụ là duy nhất [Must | 1 SP]
        ├── T-10: Bảng charge_points, connectors kèm migration 005 và ràng buộc (unique code, upper, connector count 1-4)
        └── T-11: Form thêm trụ, kiểm tra mã duy nhất và API server
```

### 11.2. Project Traceability Facts (Thực tế liên kết truy vết hai chiều)
- **Chiều thuận (Forward Traceability)**: Toàn bộ 5 Story (`S-01` đến `S-05`) và 9 Technical Task (`T-01`, `T-04`..`T-11`) đều đã được ánh xạ chính xác đến từng file mã nguồn hiện thực tại [Mục 8 (Requirement → Task → Source Mapping)](#8-requirement--task--source-mapping) và chỉ mục chi tiết 92 Test Case tại [`docs/TEST_INVENTORY.md`](./TEST_INVENTORY.md).
- **Chiều nghịch (Reverse Traceability)**: Khi có lỗi phát sinh hoặc mã nguồn thay đổi, Tester tra cứu ngược từ component bị ảnh hưởng tại [Mục 10 (Source → Historical Test Mapping)](#10-source--historical-test-mapping-bản-đồ-ánh-xạ-lịch-sử-kiểm-thử) và [Mục 12 (Impact / Regression Map)](#12-impact--regression-map-bản-đồ-phân-tích-tác-động--hồi-quy) để xác định danh sách bài test lịch sử cần chạy lại.

---

## 12. Impact / Regression Map (Bản đồ phân tích tác động & hồi quy)

Khi một thành phần mã nguồn dùng chung bị sửa đổi, Tester tra cứu bảng sau để xác định vùng bị ảnh hưởng và kịch bản hồi quy cần chạy lại:

| Thành phần sửa đổi | Vùng ảnh hưởng trực tiếp (Direct Impact) | Các Story / Task bị tác động | Bộ kiểm thử cần chạy lại (Regression Suite) |
|:---|:---|:---:|:---|
| **`backend/src/config/env.js`** | Khởi động server, kết nối DB, JWT secret, CORS | S-01, S-02, S-03, Integration | `backend/tests/unit/env.test.js`<br>`backend/tests/acceptance/S-01.baseline.test.js`<br>`curl http://localhost:3000/api/health` |
| **`backend/src/lib/password.js`** | Mã hóa Argon2id, kiểm tra mật khẩu khi login | S-02 (T-04, T-05) | `backend/tests/acceptance/S-02.login.test.js`<br>`backend/tests/integration/auth.regression.test.js`<br>`backend/tests/integration/create-admin.test.js` |
| **`backend/src/middlewares/authenticate.js`** | Giải mã cookie token, nạp `req.user` | S-02, S-03, Integration | `backend/tests/acceptance/S-02.frontend.test.js`<br>`backend/tests/acceptance/S-03.rbac.test.js`<br>`TC-FB-03`, `TC-FB-05` |
| **`backend/src/security/routeGuard.js`** | Kiểm soát route, chặn 403 Default Deny | S-03 (T-06) | `backend/tests/acceptance/S-03.route-guard.test.js`<br>`backend/tests/acceptance/S-03.rbac-matrix.test.js` |
| **`backend/src/db/scope.js`** | Lọc dữ liệu `WHERE s.owner_id = ?` cho Owner | S-03 (T-07) | `backend/tests/unit/scope.test.js`<br>`backend/tests/acceptance/S-03.rbac.test.js`<br>Live curl giữa Owner A và Owner B |
| **`backend/migrations/*.sql`** | Cấu trúc bảng, ràng buộc khóa ngoại, index, bảng idempotency | S-01, S-02, S-03, S-04, S-05 | `backend/tests/integration/migrate.test.js`<br>Chạy lại migration up và rollback trên DB test 5433 |
| **`backend/src/modules/stations/stations.service.js`** | Nghiệp vụ trạm sạc, toạ độ, gán owner_id, kiểm tra idempotency | S-03, S-04 (T-08, T-09) | `backend/tests/acceptance/S-04.station-management.test.js`<br>`backend/tests/acceptance/S-03.rbac.test.js` |
| **`backend/src/modules/charge-points/charge-points.service.js`** | Nghiệp vụ trụ sạc, sinh connector, kiểm tra mã duy nhất UPPERCASE | S-05 (T-10, T-11), K-01 | `backend/tests/acceptance/S-05.charge-point-code.test.js`<br>`backend/tests/unit/connection-registry.test.js` |
| **`frontend/services/api.js`** | Fetch API wrapper, headers, credentials | Toàn bộ Frontend Integration | `backend/tests/unit/frontend.test.js`<br>`TC-FB-01`, `TC-FB-04`, `TC-FB-11` |
| **`frontend/app/router.js`** | Điều hướng theo vai trò, redirect 401 | S-02, S-03, Integration | `backend/tests/unit/frontend.test.js`<br>`TC-FB-06`, `TC-S02-04` |
| **`frontend/pages/shared/stations.js`** | Form khai báo/sửa trạm, bản đồ Leaflet, Idempotency-Key header | S-04 (T-08, T-09) | `backend/tests/acceptance/S-04.station-management.test.js`<br>Kiểm tra form submit và render danh sách trạm |

> **Nguyên tắc an toàn**: Không kết luận nguyên nhân gốc rễ (Root Cause) chỉ dựa trên bản đồ tác động này. Mọi kết luận đều phải được chứng minh qua bằng chứng kiểm thử thực tế.

---

## 13. Current Structure Gaps (Các khoảng trống cấu trúc hiện tại)

Các thành phần mã nguồn hoặc chức năng hiện tại chưa được hiện thực hóa đầy đủ hoặc chưa đủ điều kiện để xác minh:

1. **`S03-AC-04` / `TC-T06-01` (Route chưa khai báo quyền trả về HTTP 403 cho Admin)**:
   - *Hiện trạng*: Trong mã nguồn hiện tại, 100% các route nghiệp vụ đều đã được khai báo quyền hạn tường minh trong `permissions.js`. Không có route nào bị bỏ quên.
   - *Đánh giá an toàn*: **NOT VERIFIED**. Tuân thủ nghiêm ngặt quy tắc Tester: Không tự ý thêm route rác vào mã nguồn để kiểm thử tính năng này.
2. **Kịch bản chặn sửa mã trụ khi đã phát sinh phiên sạc (`S05-AC-03` / `TC-S05-03`)**:
   - *Hiện trạng*: Trong Sprint 1, cơ sở dữ liệu chưa có bảng lưu trữ phiên sạc (`charging_sessions`). Cơ chế kiểm tra hiện tại mới dừng ở mức kiểm tra kết nối WebSocket trong RAM qua `connection-registry.js`.
   - *Đánh giá an toàn*: **NOT VERIFIED / DEFERRED TO SPRINT 3**. Đã lập báo cáo kỹ thuật gửi PO tại [`docs/spikes/S-05-AC3-ghi-nhan-cho-PO.md`](./spikes/S-05-AC3-ghi-nhan-cho-PO.md) đề xuất chính thức hoàn thiện kịch bản này khi có bảng phiên sạc ở Sprint 3.
3. **Môi trường máy host không có sẵn `supertest` toàn cục**:
   - *Hiện trạng*: `supertest` được khai báo trong `backend/package.json` devDependencies. Một số test case acceptance cần chạy trong môi trường đã `npm install` đầy đủ hoặc bên trong container.
   - *Đánh giá*: Đã có bằng chứng thực thi thành công từ snapshot ngày 24/09/2026, 27/09/2026, 28/09/2026 và 30/09/2026.

---

## 14. Structure Verification Metadata (Thông tin kiểm chứng cấu trúc)

- **Structure Status**: **VERIFIED** (Đã đối chiếu 100% khớp với filesystem thực tế).
- **Snapshot Date**: 30/09/2026.
- **Git Commit Hash**: `7fe1e7a0d22111f672d167b6967ebfa7b7575845`.
- **Git Branch**: `main`.
- **Operating System Environment**: Windows 11 x64, Node.js v24.19.0, npm 11.17.0, Python 3.11.9.
- **Container Environment**: Docker Desktop (PostgreSQL 16 alpine trên ports 5432, 5433; App container trên port 3000).
- **Filesystem Scan Scope**: 54 thư mục, 244 tệp tin (tổng cộng 298 mục cấu trúc được xác minh).
- **Ignored Patterns Applied**: `.git/`, `node_modules/`, `__pycache__/`, `*.pyc`, `.run/`, `*.cookie`, `.env`.
- **Verification Methodology**: Quét đệ quy filesystem bằng Python script, kiểm tra chéo hai chiều (Filesystem $\longleftrightarrow$ Document), xác minh mục đích từng tệp từ mã nguồn và cấu hình.
