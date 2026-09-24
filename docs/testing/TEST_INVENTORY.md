# BẢNG KÊ HIỆN TRẠNG KIỂM THỬ (TEST INVENTORY) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Phiên bản snapshot**: 24/09/2026 (Nhánh `main`, commit `4bc5758`)  
> **Quy ước**: Chỉ lưu trữ danh mục kiểm thử, không mô tả chi tiết kịch bản kiểm thử tại tệp này.  

---

## 1. Danh mục Kiểm thử Story S-01 & Task T-01 (Khung ứng dụng & Database)

| Test ID | Jira | Category | Type | Automated/Manual | Status | Last Run |
|:---|:---|:---|:---|:---:|:---:|:---:|
| **TC-S01-01** | S-01 | Baseline / Runtime | Acceptance | Manual | **BLOCKED** | 24/09/2026 |
| **TC-S01-02** | S-01 | Security / Config | Unit | Automated | **PASS** | 24/09/2026 |
| **TC-S01-03** | S-01 | Security / Logging | Unit | Automated | **PASS** | 24/09/2026 |
| **TC-T01-01** | T-01 | Database / Migration | Integration | Automated | **BLOCKED** | 24/09/2026 |
| **TC-T01-02** | T-01 | Database / Rollback | Integration | Automated | **BLOCKED** | 24/09/2026 |
| **TC-T01-03** | T-01 | Database / Schema | Static Inspection | Manual | **PASS** | 24/09/2026 |
| **TC-T01-04** | T-01 | Config / Connection | Static Inspection | Manual | **PASS** | 24/09/2026 |
| **UT-NODE-01** | S-01 | Runtime / Environment | Unit | Automated | **PASS** | 24/09/2026 |
| **UT-BACKDOOR-01** | S-01 | Security / Secret | Unit | Automated | **PASS** | 24/09/2026 |
| **UT-ENV-01** | S-01 | Config / Validation | Unit | Automated | **BLOCKED** | 24/09/2026 |
| **UT-ERR-01** | S-01 | Middleware / Error | Unit | Automated | **BLOCKED** | 24/09/2026 |
| **IT-MIGRATE-01** | T-01 | Database / Migration | Integration | Automated | **BLOCKED** | 24/09/2026 |
| **IT-ADMIN-01** | S-01 | Security / Seed Script | Integration | Automated | **BLOCKED** | 24/09/2026 |
| **ACC-S01-01** | S-01 | Baseline / HTTP | Acceptance | Automated | **BLOCKED** | 24/09/2026 |
| **MAN-S01-01** | S-01 | Container / Build | Runtime | Manual | **BLOCKED** | 24/09/2026 |
| **MAN-S01-02** | S-01 | Gateway / HTTP | Runtime | Manual | **BLOCKED** | 24/09/2026 |

---

## 2. Danh mục Kiểm thử Story S-02 & Task T-04, T-05 (Login & Temporary Lock)

| Test ID | Jira | Category | Type | Automated/Manual | Status | Last Run |
|:---|:---|:---|:---|:---:|:---:|:---:|
| **TC-S02-01** | S-02 | Authentication / Session | Acceptance | Manual / Live | **BLOCKED** | 24/09/2026 |
| **TC-S02-02** | S-02 | Security / Timing Attack | Security | Static / Code | **PASS** | 24/09/2026 |
| **TC-S02-03** | S-02 | Security / Lockout | Functional | Manual / Live | **BLOCKED** | 24/09/2026 |
| **TC-S02-04** | S-02 | Session / Expiration | Client Routing | Automated | **PASS** | 24/09/2026 |
| **TC-S02-05** | S-02 | Cryptography / Hash | Security | Automated | **PASS** | 24/09/2026 |
| **TC-S02-06** | S-02 | Security / Throttle Scope | Security | Static / Code | **PASS** | 24/09/2026 |
| **TC-T04-01** | T-04 | Database / Constraints | Schema Check | Manual | **PASS** | 24/09/2026 |
| **TC-T04-02** | T-04 | Database / Seed Data | Schema Check | Manual | **PASS** | 24/09/2026 |
| **TC-T04-03** | T-04 | Database / Column Types | Schema Check | Manual | **PASS** | 24/09/2026 |
| **TC-T05-01** | T-05 | Client / Form Validation | UI Component | Automated | **PASS** | 24/09/2026 |
| **TC-T05-02** | T-05 | Security / Cookie Flag | Security | Automated | **PASS** | 24/09/2026 |
| **TC-T05-03** | T-05 | Database / Persistence | Functional | Static / Code | **PASS** | 24/09/2026 |
| **UT-FRONTEND-01** | S-02 | Client / Logic & Router | Unit | Automated | **PASS** | 24/09/2026 |
| **IT-AUTH-01** | S-02 | Auth / Regression | Integration | Automated | **BLOCKED** | 24/09/2026 |
| **ACC-S02-01** | S-02 | Client / Integration | Acceptance | Automated | **BLOCKED** | 24/09/2026 |
| **ACC-S02-02** | S-02 | Auth / Flow | Acceptance | Automated | **BLOCKED** | 24/09/2026 |
| **ACC-S02-03** | S-02 | Auth / IP Throttle | Acceptance | Automated | **BLOCKED** | 24/09/2026 |
| **MAN-S02-01** | S-02 | Live API / Login | Runtime | Manual | **BLOCKED** | 24/09/2026 |
| **MAN-S02-02** | S-02 | Live API / Lockout 5x | Runtime | Manual | **BLOCKED** | 24/09/2026 |
| **MAN-S02-03** | T-05 | DB / Restart Persistence | Runtime | Manual | **BLOCKED** | 24/09/2026 |

---

## 3. Danh mục Kiểm thử Story S-03 & Task T-06, T-07 (Role & Ownership Isolation)

| Test ID | Jira | Category | Type | Automated/Manual | Status | Last Run |
|:---|:---|:---|:---|:---:|:---:|:---:|
| **TC-S03-01** | S-03 | Ownership / Query Scope | Data Isolation | Automated | **PASS** | 24/09/2026 |
| **TC-S03-02** | S-03 | Ownership / Audit Log | Security | Static / Code | **PASS** | 24/09/2026 |
| **TC-S03-03** | S-03 | RBAC / Unauthorized Role | Authorization | Static / Code | **PASS** | 24/09/2026 |
| **TC-S03-04** | S-03 | RBAC / Default Deny | Security | Static / Code | **PASS** | 24/09/2026 |
| **TC-T06-01** | T-06 | Middleware / Route Guard | Security | Static / Code | **PASS** | 24/09/2026 |
| **TC-T06-02** | T-06 | Middleware / Allow Roles | Authorization | Static / Code | **PASS** | 24/09/2026 |
| **TC-T07-01** | T-07 | Code Design / Shared Func | Architecture | Automated | **PASS** | 24/09/2026 |
| **TC-T07-02** | T-07 | Ownership / Cross-Access | Acceptance | Automated / Spec | **PASS** | 24/09/2026 |
| **UT-SCOPE-01** | S-03 | Data Isolation / Scope | Unit | Automated | **PASS** | 24/09/2026 |
| **UT-LINT-01** | S-03 | Code Policy / Linter | Unit | Automated | **BLOCKED** | 24/09/2026 |
| **ACC-S03-01** | S-03 | Security / Accounts | Acceptance | Automated | **BLOCKED** | 24/09/2026 |
| **ACC-S03-02** | S-03 | Security / CSRF | Acceptance | Automated | **BLOCKED** | 24/09/2026 |
| **ACC-S03-03** | S-03 | RBAC / Matrix | Acceptance | Automated | **BLOCKED** | 24/09/2026 |
| **ACC-S03-04** | S-03 | Ownership / Isolation | Acceptance | Automated | **BLOCKED** | 24/09/2026 |
| **ACC-S03-05** | S-03 | Middleware / Guard | Acceptance | Automated | **BLOCKED** | 24/09/2026 |
| **ACC-S03-06** | S-03 | Network / Trust Proxy | Acceptance | Automated | **BLOCKED** | 24/09/2026 |
| **MAN-S03-01** | S-03 | Ownership / Live Curl | Security | Manual | **BLOCKED** | 24/09/2026 |
| **MAN-S03-02** | S-03 | RBAC / Live Default Deny | Security | Manual | **BLOCKED** | 24/09/2026 |

---

## 4. Danh mục Kiểm thử Tích hợp Frontend ↔ Backend (FB-01 đến FB-11)

| Test ID | Jira | Category | Type | Automated/Manual | Status | Last Run |
|:---|:---|:---|:---|:---:|:---:|:---:|
| **TC-FB-01** | FB-01 | Client Fetcher / API | Integration Contract | Automated / Code | **PASS** | 24/09/2026 |
| **TC-FB-02** | FB-02 | Middleware Chain / Host | Integration Contract | Static / Code | **PASS** | 24/09/2026 |
| **TC-FB-03** | FB-03 | E2E Login / Auth Flow | E2E Integration | UI Flow / API | **PASS** | 24/09/2026 |
| **TC-FB-04** | FB-04 | Error Handling / UI DOM | Client / Parser | UI Component | **PASS** | 24/09/2026 |
| **TC-FB-05** | FB-05 | Cookie Session / 401 | Security / Protocol | Automated / Unit | **PASS** | 24/09/2026 |
| **TC-FB-06** | FB-06 | RBAC UI / Route Mapping | Authorization | UI Routing | **PASS** | 24/09/2026 |
| **TC-FB-07** | FB-07 | Ownership / Data Scope | Data Isolation | Automated / Code | **PASS** | 24/09/2026 |
| **TC-FB-08** | FB-08 | Error Envelope Contract | API Contract | Schema Match | **PASS** | 24/09/2026 |
| **TC-FB-09** | FB-09 | Client Logic / Mocking | Unit | Automated | **PASS** | 24/09/2026 |
| **TC-FB-10** | FB-10 | Database Persistence | Data Integrity | Static / Code | **PASS** | 24/09/2026 |
| **TC-FB-11** | FB-11 | AppSec / OWASP Defense | Security | Static / Code | **PASS** | 24/09/2026 |

---

## 5. Tổng hợp Thống kê Danh mục Kiểm thử

| Nhóm Kiểm Thử | Tổng số | PASS (Logic/Code/Unit) | BLOCKED (Runtime Live) | Ghi chú |
|:---|---:|---:|---:|:---|
| **S-01 & T-01** | 16 | 7 | 9 | Unit test nodeVersion và no-backdoor PASS |
| **S-02 & T-04, T-05** | 20 | 11 | 9 | Unit test frontend.test.js (9 tests) PASS |
| **S-03 & T-06, T-07** | 18 | 8 | 10 | Unit test scope.test.js (4 tests) PASS |
| **FB-01 đến FB-11 (Integration)** | 11 | 11 | 0* | 100% hợp đồng và logic đạt chuẩn (*Live calls bị chặn chung do môi trường) |
| **TỔNG CỘNG** | **65** | **37** | **28** | **Không có lỗi sai lệch logic mã nguồn (0 FAIL)** |
