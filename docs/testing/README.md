# CSMS TESTING DOCUMENTATION

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Người thực hiện**: TESTER / QA ANALYST  
> **Current Baseline Date**: 24/09/2026  
> **Commit snapshot**: `4bc5758` (Nhánh `main`)  

---

## 1. Mục đích Thư mục (Purpose)
Thư mục `docs/testing/` là nguồn sự thật duy nhất (Single Source of Truth) lưu trữ toàn bộ hồ sơ kiểm thử, chiến lược kiểm thử, danh mục các bài test, báo cáo lỗi và tình trạng tích hợp của dự án CSMS tính đến ngày 24/09/2026.

---

## 2. Cấu trúc Tài liệu (Documentation Structure)

```text
docs/testing/
│
├── README.md                 # Hướng dẫn tổng quan & cấu trúc thư mục kiểm thử
│
├── stories/                  # Chi tiết kiểm thử theo từng Jira Story
│   ├── S-01.md               # S-01: Khung ứng dụng & Database (T-01)
│   ├── S-02.md               # S-02: Authentication & Temporary Lockout (T-04, T-05)
│   └── S-03.md               # S-03: Role Matrix & Ownership Isolation (T-06, T-07)
│
├── integration/              # Kiểm thử tích hợp toàn trình giữa các hệ thống
│   └── FRONTEND_BACKEND.md   # Kiểm thử tích hợp Frontend ↔ Backend (FB-01 đến FB-11)
│
├── TEST_PLAN.md              # Chiến lược, tiêu chí chấp nhận & quy tắc kiểm thử
├── TEST_INVENTORY.md         # Bảng kê toàn bộ danh mục kiểm thử và trạng thái thực thi
├── TEST_REPORT.md            # Báo cáo tổng hợp kết quả kiểm thử hiện tại
├── BUG_REPORT.md             # Hồ sơ chi tiết các lỗi và rào cản môi trường
└── REGRESSION_REPORT.md      # Đánh giá tính toàn vẹn và nguy cơ hồi quy chức năng
```

---

## 3. Hướng dẫn Sử dụng Hồ sơ Kiểm thử (File Directory Guide)

| Thư mục / Tệp | Mục đích sử dụng | Khi nào cần xem? |
|:---|:---|:---|
| **[`stories/`](./stories/)** | Chứa chi tiết yêu cầu, AC, NFR, test cases, expected/actual của từng Story Jira (`S-01.md`, `S-02.md`, `S-03.md`) | Khi cần kiểm tra sâu logic, kịch bản test và bằng chứng của một tính năng cụ thể |
| **[`integration/`](./integration/)** | Chứa chi tiết toàn bộ các kịch bản kiểm thử tích hợp Frontend ↔ Backend (`FRONTEND_BACKEND.md`) | Khi cần xác minh hợp đồng API, chuỗi middleware, session cookie, xử lý lỗi, bảo mật |
| **[`TEST_PLAN.md`](./TEST_PLAN.md)** | Định nghĩa phạm vi, mục tiêu, môi trường, thứ tự thực thi phụ thuộc, và nguyên tắc kiểm thử | Khi cần nắm bắt chiến lược kiểm thử cấp cao và điều kiện nghiệm thu |
| **[`TEST_INVENTORY.md`](./TEST_INVENTORY.md)** | Bảng kê danh mục toàn bộ test case (ID, Jira, Category, Type, Status, Last Run) | Khi cần tra cứu nhanh danh mục bài test mà không cần đọc chi tiết từng bước |
| **[`TEST_REPORT.md`](./TEST_REPORT.md)** | Báo cáo tóm tắt hiện trạng kiểm thử mới nhất, tỷ lệ đạt, thống kê, và điểm nghẽn | Khi Developer hoặc Project Manager cần báo cáo tóm tắt trạng thái dự án |
| **[`BUG_REPORT.md`](./BUG_REPORT.md)** | Danh sách chi tiết các lỗi đang mở, phân loại rạch ròi theo mức độ nghiêm trọng và nguyên nhân | Khi đội ngũ Dev cần fix lỗi hoặc setup môi trường (Docker, PostgreSQL, Zod) |
| **[`REGRESSION_REPORT.md`](./REGRESSION_REPORT.md)** | Ghi nhận kết quả chạy lại các bài test cũ và so sánh hành vi trước - sau refactor | Khi chuẩn bị release hoặc kiểm tra xem tính năng cũ có bị ảnh hưởng không |

---

## 4. Quy ước Trạng thái Kiểm thử (Status Conventions)

- **PASS**: Yêu cầu kiểm thử được xác nhận đạt 100% qua bằng chứng thực thi tự động hoặc kiểm tra logic mã nguồn.
- **FAIL**: Hành vi thực tế sai lệch với yêu cầu do lỗi trong mã nguồn (`CODE_DEFECT`) khi môi trường đã sẵn sàng.
- **BLOCKED**: Kịch bản kiểm thử không thể thực thi trực tiếp do rào cản từ môi trường máy test (`ENVIRONMENT_BLOCKER`, `CONFIGURATION_PROBLEM`).
- **NOT VERIFIED**: Chưa đủ căn cứ hoặc bằng chứng xác minh mới nhất tính đến thời điểm snapshot.
- **NOT FOUND**: Chức năng, biểu mẫu UI hoặc endpoint chưa được khởi tạo trong mã nguồn.
- **NOT RUN**: Kịch bản kiểm thử đã được thiết kế nhưng chưa đến lượt thực thi theo thứ tự phụ thuộc.
