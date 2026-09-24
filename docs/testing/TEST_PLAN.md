# KẾ HOẠCH KIỂM THỬ (TEST PLAN) — CSMS

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Phiên bản snapshot**: 24/09/2026 (Nhánh `main`, commit `4bc5758`)  
> **Người thực hiện**: TESTER / QA ANALYST  

---

## 1. Scope (Phạm vi kiểm thử)
Kế hoạch kiểm thử tổng thể bao quát toàn bộ chức năng cốt lõi của hệ thống Quản lý Trạm Sạc Xe Điện (CSMS) Sprint 1:
- Khung ứng dụng đa môi trường (Container Docker & Local Node.js).
- Cơ sở dữ liệu quan hệ PostgreSQL (Schema migration, naming convention, connection pooling).
- Hệ thống xác thực và quản lý phiên người dùng (Authentication, Argon2id, Session Cookie HttpOnly, Login Throttle Lockout).
- Phân quyền theo vai trò (RBAC matrix) và nguyên tắc phòng thủ Default Deny (Route Guard).
- Cô lập dữ liệu theo quyền sở hữu (Ownership Isolation) tại tầng truy vấn cơ sở dữ liệu và ghi nhật ký an ninh.
- Tích hợp toàn trình Frontend Client ↔ Backend API ↔ Cơ sở dữ liệu.

*Lưu ý*: Chi tiết từng Story được tách biệt và lưu trữ độc lập tại:
- [`stories/S-01.md`](./stories/S-01.md)
- [`stories/S-02.md`](./stories/S-02.md)
- [`stories/S-03.md`](./stories/S-03.md)
- [`integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md)

---

## 2. Test Objectives (Mục tiêu kiểm thử)
1. Xác minh hệ thống đáp ứng đầy đủ các Tiêu chí Chấp nhận (Acceptance Criteria) và Yêu cầu Phi chức năng (NFR).
2. Phát hiện sớm các rủi ro bảo mật (XSS, SQL Injection, CSRF, User Enumeration, Timing Attack).
3. Đảm bảo tính nhất quán của các hợp đồng giao tiếp API và cơ chế xử lý lỗi.
4. Đánh giá tính khả thi khi triển khai và vận hành trên môi trường thực tế.

---

## 3. Test Strategy (Chiến lược kiểm thử)
Áp dụng mô hình kim tự tháp kiểm thử nhiều tầng:
- **Tầng 1 — Static Code Analysis & Linting**: Rà soát cú pháp, kiểm tra biến môi trường, bảo mật secret, cấu hình linter.
- **Tầng 2 — Unit Testing**: Kiểm thử độc lập logic nghiệp vụ các module (`scopeByOwner`, `verifyPassword`, router helper, form validator).
- **Tầng 3 — Integration Testing**: Kiểm thử tương tác giữa các thành phần (Migration DB, scripts CLI, chuỗi middleware Express, Client Fetcher ↔ API Handler).
- **Tầng 4 — Acceptance Testing**: Kiểm thử kịch bản người dùng toàn diện theo từng Story Jira.
- **Tầng 5 — Security & Regression Testing**: Kiểm thử phòng thủ các lỗ hổng OWASP và kiểm tra hồi quy sau mỗi đợt cập nhật.

---

## 4. Test Environment Requirements (Yêu cầu môi trường kiểm thử)
- **Node.js**: Phiên bản LTS >= 22.7.0 (Môi trường máy host hiện tại: Node v24.19.0, npm 11.17.0).
- **Containerization**: Docker Engine & Docker Compose có sẵn trong PATH để chạy các service đóng gói.
- **Cơ sở dữ liệu**: PostgreSQL 16 lắng nghe trên cổng 5432 (phát triển) và 5433 (kiểm thử tự động).
- **Dependencies**: Được cài đặt đầy đủ theo `package.json` (`express`, `pg`, `zod`, `argon2`, `jsonwebtoken`, `cookie-parser`).

---

## 5. Test Types (Phân loại kiểm thử)
- **Unit Test (UT)**: Kiểm tra các hàm logic độc lập không phụ thuộc I/O mạng hoặc cơ sở dữ liệu.
- **Integration Test (IT)**: Kiểm tra sự phối hợp giữa 2 hoặc nhiều thành phần phần mềm.
- **Acceptance Test (ACC)**: Kiểm thử kịch bản chấp nhận yêu cầu của người dùng đầu cuối.
- **Manual Live Test (MAN)**: Kiểm thử thủ công qua CLI (curl), browser và giám sát network log.
- **Security Test (SEC)**: Rà soát các tiêu chí an ninh ứng dụng web.

---

## 6. Dependency Order (Thứ tự thực thi phụ thuộc)
Để kết quả kiểm thử có giá trị và không bị gãy chuỗi phụ thuộc, quy trình kiểm thử bắt buộc tuân theo thứ tự:
```text
S-01 (Khung ứng dụng & Database)
  └── T-01 (Migration & Kết nối DB)
        └── S-02 (Authentication & Lockout)
              ├── T-04 (Bảng users, roles)
              └── T-05 (Form login, Session, Throttle)
                    └── S-03 (RBAC & Ownership Isolation)
                          ├── T-06 (Route Guard Default Deny)
                          └── T-07 (Ownership Query & Scope)
                                └── Integration (Frontend ↔ Backend FB-01 đến FB-11)
```

---

## 7. Entry Criteria (Tiêu chí bắt đầu kiểm thử)
- Mã nguồn và tài liệu kỹ thuật được bàn giao đầy đủ trên nhánh kiểm thử.
- Môi trường thực thi (Node.js, Docker, Database) được cấu hình theo yêu cầu.
- Các biến môi trường kiểm thử (`.env`) đã được thiết lập hợp lệ.

---

## 8. Exit Criteria (Tiêu chí kết thúc kiểm thử)
- 100% các Test Case trong `TEST_INVENTORY.md` được thực thi và có bằng chứng xác minh.
- 100% các Acceptance Criteria và NFR của các Story được rà soát và ghi nhận trạng thái.
- Không còn lỗi mức độ `CRITICAL` hoặc `HIGH` chưa được lập hồ sơ trong `BUG_REPORT.md`.
- Báo cáo kiểm thử `TEST_REPORT.md` được hoàn thiện và phê duyệt.

---

## 9. PASS / FAIL / BLOCKED Rules (Quy tắc đánh giá trạng thái)
- **PASS**: Hành vi thực tế khớp hoàn toàn với kết quả kỳ vọng, có bằng chứng (terminal log, output test) xác minh.
- **FAIL**: Hành vi thực tế sai lệch với kỳ vọng do lỗi trong mã nguồn (`CODE_DEFECT`) khi môi trường đã sẵn sàng.
- **BLOCKED**: Không thể thực thi hoặc hoàn thành kiểm thử do rào cản môi trường máy test, dịch vụ bên ngoài bị tắt, hoặc thiếu dependency (`ENVIRONMENT_BLOCKER`, `CONFIGURATION_PROBLEM`).
- **NOT VERIFIED**: Chưa đủ căn cứ hoặc bằng chứng xác minh mới nhất tính đến thời điểm snapshot.
- **NOT FOUND**: Chức năng hoặc giao diện chưa tồn tại trong mã nguồn.
- **NOT RUN**: Test case đã được thiết kế nhưng chưa đến lượt chạy.

---

## 10. Tester Restrictions (Quy tắc bắt buộc đối với Tester/QA)
1. **Chế độ kiểm thử**: Read + Analyze + Test Only.
2. **Tuyệt đối không can thiệp mã nguồn**: Không sửa code, không sửa bug, không refactor, không tối ưu hóa, không cài đặt package ngoài luồng.
3. **Tuyệt đối không thay đổi cấu hình**: Không sửa đổi `.env`, `docker-compose.yml`, migration SQL hoặc mã kiểm thử của dev.
4. **Báo cáo trung thực**: Phân định rạch ròi giữa lỗi code (`CODE_DEFECT`) và rào cản môi trường (`ENVIRONMENT_BLOCKER`).
