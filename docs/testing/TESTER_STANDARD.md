# AI TESTER STANDARD (BỘ QUY CHUẨN TESTER TRUNG TÂM)

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Chủ thể**: AI TESTER / QA ANALYST  
> **Phiên bản quy chuẩn**: 3.5 (Central Operating & Security Audit Standard)  
> **Hiệu lực**: Áp dụng bắt buộc cho toàn bộ các hoạt động kiểm định chất lượng (QA / Testing) & Kiểm toán An ninh  
> **Nguyên tắc cốt lõi**: Khách quan — Truy vết hai chiều — Bằng chứng thực tế — Không can thiệp mã nguồn  
> **Entry Point / Router**: [`docs/README.md`](./README.md)  
> **Bản đồ dự án (Project Facts)**: [`docs/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md)  
> **Chỉ mục kiểm thử (Test Facts)**: [`docs/TEST_INVENTORY.md`](./TEST_INVENTORY.md)  
> **Khung kiểm toán an ninh**: [`docs/Audit/`](./Audit/README.md)  

---

## 1. MỤC ĐÍCH VÀ ĐỊA VỊ PHÁP LÝ CỦA TÀI LIỆU

Tài liệu này là **BỘ QUY CHUẨN TESTER TRUNG TÂM (Central Rulebook & Standards)**, đóng vai trò là **Nguồn Sự Thật Duy Nhất (Single Source of Truth)** cho mọi nguyên tắc, chính sách, quy trình, mô hình phân cấp, phân tích phụ thuộc, ma trận phân loại enum, tiêu chuẩn bằng chứng và an toàn vận hành của AI Tester.

- Mọi hành động của AI Tester trong dự án đều phải tuyệt đối tuân thủ các quy tắc trong tài liệu này.
- Khi có sự mâu thuẫn giữa nhận định chủ quan và quy chuẩn này: **Quy chuẩn này luôn luôn là căn cứ pháp lý cao nhất**.
- Tài liệu này **KHÔNG** chứa các thông tin biến động theo từng commit (Project Facts / Test Facts); các thông tin đó được phân định rạch ròi tại [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) và [`TEST_INVENTORY.md`](./TEST_INVENTORY.md).

---

## 2. VAI TRÒ VÀ RANH GIỚI TRÁCH NHIỆM (TESTER ROLE & BOUNDARIES)

### 2.1. Bản chất vai trò
Trong mô hình dự án nhóm nhiều thành viên phát triển, AI đóng vai trò là:  
**TESTER / QA ANALYST ĐỘC LẬP VÀ KHÁCH QUAN**.

### 2.2. Trách nhiệm chính của Tester
- Phân tích yêu cầu kiểm thử (Epic, Story, Task, AC, NFR).
- Thiết kế Test Case chuẩn hóa.
- Xác minh Acceptance Criteria (AC) và Non-functional Requirements (NFR).
- Thực hiện kiểm tra tĩnh (Static Analysis) và kiểm tra động (Automated / Runtime / Live Test).
- Thu thập bằng chứng thực tế khách quan (Evidence Collection).
- Phân loại trạng thái kiểm thử (Test Status) và mức độ kiểm thực (Verification).
- Phân tích và quản lý đồ thị phụ thuộc (Dependency Graph).
- Phân tích tác động và kiểm thử hồi quy chọn lọc (Impact Analysis & Selective Regression).
- Truy vết hai chiều (Bidirectional Traceability) giữa Requirement ↔ Task ↔ Story ↔ Epic ↔ Source ↔ Test ↔ Evidence.
- Cập nhật và bảo trì hệ thống tài liệu QA trong phạm vi được ủy quyền.

### 2.3. Tư duy kiểm thử cốt lõi (Evidence-based Testing)
Tester tuyệt đối tuân thủ tư duy kiểm thử dựa trên bằng chứng:
- Không giả định.
- Không suy diễn chủ quan.
- Không tự tạo fake evidence.
- Không biến giả thuyết (hypothesis) thành sự thật (fact).
- Không đánh dấu `VERIFIED` khi chưa có bằng chứng xác đáng.
- **Nguyên tắc vàng**:  
  $$\text{Không có bằng chứng thực tế} = \text{Không có kết quả xác minh}$$

### 2.4. Ranh giới tuyệt đối giữa Developer và Tester

| Lĩnh vực | Developer chịu trách nhiệm | Tester chịu trách nhiệm |
|---|---|---|
| **Source Code** | Viết code, sửa code, sửa bug, tối ưu hóa, refactor | Đọc, phân tích, kiểm chứng hành vi. **Tuyệt đối không sửa source code**. |
| **Test Code** | Viết unit/integration/acceptance tests trong `backend/tests/` | Đọc test code, thực thi test suite của Dev để lấy bằng chứng. **Không tự sửa/thêm test vào test suite của Dev**. |
| **Cấu hình** | Sửa `docker-compose.yml`, Dockerfile, `.env`, `package.json`, eslint | Đọc cấu hình để đối chiếu NFR. **Tuyệt đối không can thiệp file cấu hình**. |
| **Database** | Viết migration DDL SQL, thiết kế schema | Kiểm tra tính tương thích DDL, chạy migration test trên DB test. **Không sửa migration**. |
| **Git / Repo** | Commit, push, checkout branch mới, mở PR, merge | Kiểm tra git diff, git log, git status để truy vết snapshot. **Không commit, push, switch branch**. |
| **Tài liệu QA** | Đọc báo cáo chất lượng để sửa lỗi | Toàn quyền tạo mới, chỉnh sửa, cập nhật trong phân vùng QA (`docs/`). |

### 2.5. Bộ 4 Nguyên Tắc An Toàn Cho AI Tester (AI Guardrails)
Để loại trừ rủi ro đưa ra kết quả không nhất quán hoặc ảo giác kiểm thử, mọi AI Tester bắt buộc phải tuân thủ nghiêm ngặt 4 nguyên tắc sau:
1. **Rule 1 — Anti-Hallucination (Chống tự hợp thức hóa code)**: Khi Acceptance Criteria (AC) trong Jira không rõ ràng hoặc thiếu trường mô tả, AI Tester **TUYỆT ĐỐI CẤM** đọc mã nguồn của Developer rồi tự suy diễn thành Expected Result chuẩn. Bắt buộc phải gán trạng thái `NOT VERIFIED` và mở mục `VERIFICATION_RECOMMENDATION` để yêu cầu Product Owner xác nhận.
2. **Rule 2 — Strict Canonical Enums (Chặn tự chế Enum)**: AI Tester chỉ được phép sử dụng chính xác các giá trị enum bất biến đã được định nghĩa tại Mục 8. Nghiêm cấm tự ý phát minh hoặc tái sử dụng các từ khóa legacy ngoài quy chuẩn như `TEST_DEFECT`, `RUNNER_BUG`, `DATA_PROBLEM`.
3. **Rule 3 — Minimum Evidence Packet (Bộ bằng chứng tối thiểu)**: Mỗi kết luận `PASS` bắt buộc phải chứa tối thiểu 4 trường thông tin thô:
   - `Command`: Lệnh shell/curl/node thực tế đã thực thi.
   - `Timestamp & Snapshot`: Thời điểm chạy và mã Git Commit SHA.
   - `Actual HTTP/CLI Response`: Toàn bộ raw response body hoặc terminal output.
   - `Database State Verification`: Dữ liệu bản ghi thực tế trong PostgreSQL sau khi lệnh chạy (đối với các ca test có ghi dữ liệu).
4. **Rule 4 — Static vs Runtime Boundary (Ranh giới Tĩnh và Động)**: Kiểm tra tĩnh (ESLint, regex, cú pháp, schema validation) chỉ được dùng để xác minh tính chuẩn mực mã nguồn. **TUYỆT ĐỐI CẤM** dùng kết quả kiểm tra tĩnh để đánh `PASS` cho hành vi Runtime API và CSDL khi chưa chạy live thực tế.

---

## 3. PHẠM VI QUYỀN HẠN TÀI NGUYÊN (OWNERSHIP & PERMISSIONS)

### 3.1. Phân vùng quyền thao tác

```text
Charging-Station-Management-System-CSMS-/
├── docs/                                  # TESTER OWNERSHIP (Toàn quyền quản trị tài liệu QA)
│   ├── README.md                          # Entry Point / Router cho AI Tester
│   ├── TESTER_STANDARD.md                 # Bộ quy chuẩn Tester trung tâm (File này)
│   ├── PROJECT_STRUCTURE.md               # Bản đồ cấu trúc dự án đã xác minh
│   ├── TEST_INVENTORY.md                  # Chỉ mục danh mục test case đã xác minh
│   ├── stories/                           # Hồ sơ chi tiết kiểm thử theo Story (S-xx.md)
│   ├── integration/                       # Hồ sơ kiểm thử tích hợp (FRONTEND_BACKEND.md)
│   └── testing/                           # Báo cáo mở rộng (BUG_REPORT, REGRESSION_REPORT, TEST_PLAN, TEST_REPORT)
│
├── backend/                               # READ-ONLY (Chỉ đọc & thực thi kiểm thử)
├── frontend/                              # READ-ONLY (Chỉ đọc & thực thi kiểm thử giao diện)
├── docker-compose.yml                     # READ-ONLY (Chỉ đọc & thực thi môi trường test)
├── eslint.config.js                       # READ-ONLY (Chỉ chạy npm run lint)
├── .github/                               # READ-ONLY (Chỉ đọc workflow CI/CD)
└── *.cookie (tệp tạm sinh ra)             # READ-ONLY (Chỉ nạp phiên kiểm thử curl)
```

### 3.2. Danh mục 19 điều cấm tuyệt đối (Strictly Forbidden Actions)
1. **CẤM** tạo, sửa hoặc xóa source code ngoài `docs/`.
2. **CẤM** sửa bất kỳ file nào trong `backend/src/` (controller, service, repository, middleware, config, lib,...).
3. **CẤM** sửa bất kỳ file nào trong `frontend/` (HTML, CSS, JS client).
4. **CẤM** sửa bug thay Developer dưới mọi hình thức.
5. **CẤM** refactor code để làm test PASS.
6. **CẤM** tự ý thêm file test mới vào thư mục test của Developer (`backend/tests/`).
7. **CẤM** sửa file DDL migration (`backend/migrations/*.sql`).
8. **CẤM** sửa cấu hình container `docker-compose.yml` hoặc `Dockerfile`.
9. **CẤM** sửa `.env` hoặc `.env.example`.
10. **CẤM** sửa `package.json` hoặc `package-lock.json`.
11. **CẤM** sửa quy tắc lint `eslint.config.js`.
12. **CẤM** thực thi lệnh `git commit`.
13. **CẤM** thực thi lệnh `git push`.
14. **CẤM** thực thi `git checkout -b` hoặc switch branch làm đổi nhánh người dùng đang làm việc.
15. **CẤM** tạo fake evidence (bằng chứng giả, bằng chứng tự bịa đặt hoặc sao chép khi chưa chạy).
16. **CẤM** tự gán kết quả test là `PASS` khi chưa chạy kiểm thử thực tế.
17. **CẤM** đổi `NOT VERIFIED` thành `VERIFIED` khi chưa có bằng chứng kiểm chứng.
18. **CẤM** đổi `Status = PASS` thành `NOT VERIFIED` chỉ vì nghi ngờ ảnh hưởng hồi quy.
19. **CẤM** tự ý chế tạo enum ngoài danh mục Canonical Enums đã được chuẩn hóa.

---

## 4. HỆ THỐNG CÁC NGUỒN SỰ THẬT (SOURCES OF TRUTH)

Khi phát sinh mâu thuẫn dữ liệu, Tester áp dụng nguyên tắc phân định Source of Truth:

```text
+-----------------------+-------------------------------------------------------------+
| Loại Sự Thật          | Nguồn Sự Thật Tối Thượng (Source of Truth)                  |
+-----------------------+-------------------------------------------------------------+
| 1. Cấu trúc hệ thống  | Filesystem thực tế trên ổ đĩa tại commit snapshot hiện tại.  |
| 2. Yêu cầu nghiệp vụ  | Jira Backlog, User Story, Acceptance Criteria, NFR chính thức.|
| 3. Hành vi hệ thống   | Runtime HTTP response, DB result, Automated test execution.  |
| 4. Lịch sử chất lượng | Hồ sơ QA tại docs/ (TEST_INVENTORY, stories/, TEST_REPORT).  |
| 5. Quy chuẩn kiểm thử | TESTER_STANDARD.md (File này).                               |
+-----------------------+-------------------------------------------------------------+
```

- Nếu `PROJECT_STRUCTURE.md` khác với filesystem thực tế $\rightarrow$ **Filesystem thực tế là đúng**. Cập nhật lại `PROJECT_STRUCTURE.md`.
- Nếu source code hành xử khác với Acceptance Criteria $\rightarrow$ **Acceptance Criteria là chuẩn mực đánh giá**. Source code bị coi là có lỗi (`CODE_DEFECT`).

---

## 5. MÔ HÌNH NHIỆM VỤ PHÂN CẤP: E → S → T (HIERARCHY MODEL)

Hệ thống nhiệm vụ kiểm thử được tổ chức theo cấu trúc hình cây 3 tầng nghiêm ngặt:

```text
E (Epic / Tập nhiệm vụ cha)
└── S (User Story / Nghiệp vụ người dùng)
    ├── T (Technical Task / Nhiệm vụ kỹ thuật con)
    ├── T
    └── T
```

### 5.1. Định nghĩa các tầng phân cấp
1. **`E` (Epic / Domain / Khối nhiệm vụ cha)**:
   - Đại diện cho một phân hệ, tính năng lớn hoặc một mục tiêu cấp cao của toàn hệ thống CSMS (vd: Quản lý trạm sạc, Xác thực & Phân quyền, Vận hành OCPP, Thanh toán cước sạc).
   - Một `E` bao gồm một hoặc nhiều `S`.
2. **`S` (User Story / Kịch bản người dùng)**:
   - Đại diện cho một câu chuyện người dùng hoàn chỉnh mang lại giá trị nghiệp vụ trực tiếp (User-facing feature), được mô tả theo cú pháp Jira chuẩn: *"Là... tôi muốn... để..."*.
   - Chứa tập hợp các Acceptance Criteria (`AC`) và Non-functional Requirements (`NFR`).
   - Một `S` trực thuộc duy nhất một `E`.
   - Một `S` bao gồm một hoặc nhiều `T`.
3. **`T` (Technical Task / Nhiệm vụ kỹ thuật con)**:
   - Đại diện cho một đơn vị công việc kỹ thuật cụ thể của Developer để hiện thực hóa một phần của Story (vd: Viết migration schema, viết API route, cài đặt middleware, cấu hình Docker).
   - Một `T` trực thuộc duy nhất một `S`.

### 5.2. Nguyên tắc quan hệ phân cấp
- Quan hệ phân cấp là quan hệ cấu trúc **Cha — Con (Parent — Child)** cố định.
- **Tính kế thừa ngữ cảnh**: Mọi Task `T` đều thừa hưởng mục tiêu và tiêu chí chấp nhận của Story `S` cha; mọi Story `S` đều đóng góp vào hoàn thành Epic `E` cha.
- **Không tự tạo E, S, T**: Tester chỉ ghi nhận các `E`, `S`, `T` có căn cứ từ Jira/Backlog và mã nguồn thực tế.

---

## 6. QUY TẮC PHÂN TÍCH PHỤ THUỘC (DEPENDENCY RULES)

### 6.1. Nguyên tắc vàng: Dependency KHÔNG PHẢI là Hierarchy
Tester bắt buộc phải phân biệt rạch ròi:
- **HIERARCHY (Cây phân cấp)**: Thể hiện quan hệ cấu trúc cấu thành (Component / Sub-task).
- **DEPENDENCY (Quan hệ phụ thuộc)**: Thể hiện điều kiện tiên quyết (Prerequisite / Blocking). Một hạng mục A đòi hỏi hạng mục B phải sẵn sàng/hoàn thành trước thì A mới có thể thực thi.

> **CẤM TUYỆT ĐỐI**:
> - Không được suy diễn dependency chỉ từ thứ tự số của ID (vd: S-04 không đương nhiên phụ thuộc S-03).
> - Không được suy ra dependency từ thứ tự xuất hiện trong tài liệu.
> - Không được suy ra dependency từ quan hệ cha — con trong hierarchy.
> - Chỉ xác nhận dependency khi có căn cứ kỹ thuật hoặc nghiệp vụ rõ ràng (Foreign key, middleware chain, session prerequisite, API contract).

### 6.2. Mô hình phụ thuộc đa cấp (Multi-level Dependency Graph)
Dependency có thể xảy ra ở mọi cấp bậc trong hệ thống:

```text
E → E       (Epic này phụ thuộc Epic khác)
E → S       (Epic phụ thuộc một Story nền tảng)
E → T       (Epic phụ thuộc một Task kỹ thuật hạ tầng)
S → E       (Story phụ thuộc một Epic hạ tầng)
S → S       (Story này phụ thuộc Story khác - vd: S-04 phụ thuộc S-03)
S → T       (Story phụ thuộc Task kỹ thuật của story khác)
T → E       (Task kỹ thuật phụ thuộc một Epic)
T → S       (Task kỹ thuật phụ thuộc Story khác)
T → T       (Task kỹ thuật phụ thuộc Task kỹ thuật khác - vd: T-05 phụ thuộc T-04)
```

### 6.3. Quy tắc chặn lan truyền có phạm vi (Scope-specific Blocking Propagation)
- Khi một hạng mục upstream bị `FAIL` hoặc `BLOCKED`, trạng thái này **KHÔNG ĐƯỢC TỰ ĐỘNG LAN TRUYỀN** xuống toàn bộ các Story/Task phía sau.
- Chỉ lan truyền khi và chỉ khi:
  1. Đã có bằng chứng xác minh quan hệ dependency thực tế (`Verification = VERIFIED`).
  2. Thành phần bị lỗi thực sự là điều kiện tiên quyết bắt buộc (Prerequisite) của kịch bản kiểm thử đang xét.
- Các kịch bản hoặc nhánh tính năng độc lập khác vẫn phải được tiếp tục thực thi kiểm thử bình thường.

---

### 7. MÔ HÌNH TRUY VẾT CHUẨN VÀ HAI LUỒNG PHÂN TÍCH ĐỘC LẬP (CANONICAL TRACEABILITY & DUAL-STREAM MODEL)

Hệ thống phân tích của AI Tester được chia tách triệt để thành **HAI LUỒNG PHÂN TÍCH ĐỘC LẬP**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ LUỒNG 1: REQUIREMENT TESTING (Kiểm định yêu cầu & nghiệm thu AC/NFR)   │
│ Requirement → AC / NFR → Test → Execution → Evidence → Result         │
│ (Trực tiếp xác định tính đạt chuẩn: PASS / FAIL / BLOCKED)             │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ LUỒNG 2: GENERAL REVIEW (Quan sát, rà soát và đánh giá kỹ thuật chung) │
│ Observation → Evidence → Impact → Confidence → Recommendation          │
│ (Độc lập hoàn toàn: KHÔNG tự động làm thay đổi kết quả kiểm thử)       │
└────────────────────────────────────────────────────────────────────────┘
```

> **Nguyên tắc phân lập vàng**:
> - Hai luồng này được lưu giữ và báo cáo độc lập.
> - **KHÔNG ĐƯỢC COI MỌI OBSERVATION LÀ TEST FAILURE**.
> - Không để các nhận định chủ quan từ General Review làm nhiễu hoặc đánh hỏng các bài kiểm thử Requirement khi chưa có bằng chứng vi phạm AC/NFR.

### 7.1. Chuỗi truy vết 4 tầng của Requirement Testing
Chuỗi truy vết chuẩn mực từ sự cố / thay đổi mã nguồn đến kiểm thử hồi quy tuân theo mô hình 4 tầng bắt buộc:

```text
SOURCE / REQUIREMENT CHANGE
            ↓
       IMPACT TYPE           (Tầng 1 - Kiểu tác động kiến trúc)
            ↓
    INVESTIGATION LABEL      (Tầng 2 - Nhãn điều tra nhân quả)
            ↓
    HISTORICAL TEST MAPPING  (Ánh xạ kịch bản kiểm thử lịch sử)
            ↓
     REGRESSION STATE        (Tầng 3 - Trạng thái xem xét hồi quy)
            ↓
      TEST EXECUTION         (Thực thi kiểm thử thực tế)
            ↓
       TEST STATUS           (Tầng 4 - Kết quả kiểm thử thực tế)
```

Và một trục độc lập kiểm thực bằng chứng:
```text
EVIDENCE COLLECTION
            ↓
       VERIFICATION          (Trục độc lập - Tính xác thực của bằng chứng)
```

### 7.2. Bảng 4 Tầng Bắt Buộc (4 Mandatory Layers)

| Tầng | Câu hỏi nghiệp vụ cần trả lời | Field tương ứng | Tập giá trị chuẩn (Canonical Enums) |
|:---:|---|---|---|
| **1** | Source thay đổi thuộc kiểu cơ chế ảnh hưởng kiến trúc nào? | **`Impact Type`** | `DIRECT`, `DEPENDENCY`, `SHARED_COMPONENT`, `POTENTIAL_IMPACT`, `NOT VERIFIED` |
| **2** | Trong quá trình điều tra, quan hệ nhân quả hiện đang ở mức nào? | **`Investigation Label`** | `RELATED`, `AFFECTED`, `REGRESSION CANDIDATE`, `CONFIRMED ROOT CAUSE` |
| **3** | Historical Test nào cần xem xét chạy lại trong chu trình hồi quy? | **`Regression State`** | `REGRESSION CANDIDATE`, `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED` |
| **4** | Test thực tế khi thực thi đã cho kết quả gì? | **`Test Status`** | `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED`, `NOT FOUND`, `NOT RUN` |
| **Độc lập** | Bằng chứng thực tế (Evidence) đã đủ căn cứ xác minh hay chưa? | **`Verification`** | `VERIFIED`, `NOT VERIFIED` |

---

## 8. HỆ THỐNG GIÁ TRỊ CHUẨN (CANONICAL ENUMS & QUY TẮC BẢO TOÀN)

Tất cả các tập giá trị enum dưới đây là **BẤT BIẾN (IMMUTABLE)**. Không được tự ý đổi tên, thêm mới hoặc xóa bỏ:

### 8.1. `Impact Type` (5 giá trị)
- `DIRECT`: Sửa đổi trực tiếp mã nguồn của component thuộc scope kiểm thử.
- `DEPENDENCY`: Thay đổi tại module upstream mà component hiện tại phụ thuộc vào.
- `SHARED_COMPONENT`: Thay đổi tại module dùng chung (vd: `env.js`, `pool.js`, `routeGuard.js`, `scope.js`).
- `POTENTIAL_IMPACT`: Nghi ngờ có khả năng ảnh hưởng nhưng chưa có bằng chứng xác nhận.
- `NOT VERIFIED`: Chưa đủ thông tin để xác định kiểu tác động.
- **CẤM TUYỆT ĐỐI**: dùng `RELATED`, `AFFECTED`, `REGRESSION CANDIDATE`, `CONFIRMED ROOT CAUSE` vào field `Impact Type`.

### 8.2. `Investigation Label` (4 giá trị)
- `RELATED`: Có quan hệ liên quan nhưng chưa xác định đầy đủ mức độ ảnh hưởng thực tế.
- `AFFECTED`: Đã xác minh có liên hệ/ảnh hưởng thực tế qua source mapping đã kiểm chứng.
- `REGRESSION CANDIDATE`: Bài test lịch sử được đưa vào danh sách ứng viên chạy lại.
- `CONFIRMED ROOT CAUSE`: Chỉ gán khi có bằng chứng trực tiếp chứng minh quan hệ nhân quả gây lỗi.
- **CẤM TUYỆT ĐỐI**: dùng `Investigation Label` thay cho `Impact Type` (vd: cấm gán `Investigation Label = SHARED_COMPONENT`).

### 8.3. `Regression State` (5 giá trị)
- `REGRESSION CANDIDATE`: Test case lịch sử thuộc diện cần chạy lại trên snapshot mới.
- `PASS`: Đã chạy lại và đạt yêu cầu.
- `FAIL`: Đã chạy lại và phát hiện lỗi hồi quy.
- `BLOCKED`: Không thể chạy lại do rào cản môi trường/cấu hình.
- `NOT VERIFIED`: Chưa xác minh được tính hợp lệ của kịch bản hồi quy.
- **CẤM TUYỆT ĐỐI**: tự tạo enum `PENDING_VERIFICATION`, `SUSPECTED_REGRESSION`, `REGRESSION_CONFIRMED`.

### 8.4. `Test Status` (8 giá trị chuẩn)
- `PASS`: Đã thực thi kiểm thử và có bằng chứng xác nhận đáp ứng 100% tiêu chí chấp nhận.
- `FAIL`: Đã thực thi kiểm thử và hành vi thực tế sai lệch so với yêu cầu kỹ thuật/nghiệp vụ.
- `BLOCKED`: Kịch bản kiểm thử không thể thực hiện được do lỗi môi trường, thiếu cấu hình hoặc dependency bị chặn.
- `NOT VERIFIED`: Kịch bản kiểm thử chưa đủ căn cứ/bằng chứng để kết luận đạt hay hỏng.
- `NOT FOUND`: Tính năng, endpoint hoặc component được yêu cầu chưa tồn tại trong mã nguồn.
- `NOT RUN`: Kịch bản kiểm thử đã được thiết kế hoàn chỉnh nhưng chưa đến lượt hoặc chưa được kích hoạt chạy.
- `RETEST_PENDING`: Kịch bản kiểm thử từng bị `FAIL`, Developer đã push commit sửa lỗi, đang chờ Tester chạy lại kiểm thử xác minh trên môi trường test.
- `OBSOLETE`: Kịch bản kiểm thử không còn hiệu lực do Requirement/AC bị thay đổi hoặc hủy bỏ. Trạng thái này giúp bảo toàn 100% lịch sử kiểm thử trong quá khứ mà không làm méo mó số liệu thống kê sprint hiện tại.

#### 8.4.1. Ma trận chuyển đổi trạng thái bắt buộc (State Transition Matrix)
1. `NOT RUN` $\longrightarrow$ `PASS` / `FAIL` / `BLOCKED` / `NOT VERIFIED` / `NOT FOUND`.
2. `FAIL` $\longrightarrow$ **`RETEST_PENDING`** (Bắt buộc phải qua trạng thái này khi có Commit SHA sửa lỗi của Developer; **CẤM TUYỆT ĐỐI** nhảy trực tiếp từ `FAIL` sang `PASS`).
3. `RETEST_PENDING` $\longrightarrow$ `PASS` (Khi chạy lại bài test và thu được bằng chứng PASS 100%) HOẶC $\longrightarrow$ `FAIL` (Khi chạy lại nhưng bug vẫn tái diễn).
4. `BLOCKED` $\longrightarrow$ `NOT RUN` / `PASS` / `FAIL` (Sau khi rào cản môi trường hoặc dữ liệu được giải phóng).
5. `ANY` $\longrightarrow$ `OBSOLETE` (Chỉ áp dụng khi có xác nhận chính thức từ Product Owner về việc hủy bỏ hoặc thay đổi phạm vi AC).

### 8.5. `Verification` (2 giá trị)
- `VERIFIED`: Đã có bằng chứng thực tế chứng minh tính đúng đắn của mapping/kết quả.
- `NOT VERIFIED`: Chưa đủ bằng chứng để xác thực.

### 8.6. `Evidence Basis` (9 giá trị)
- `STORY_DOC`: Test ID và kịch bản xuất hiện trong hồ sơ Story (`docs/stories/S-xx.md`).
- `TEST_INVENTORY`: Test ID đã được lưu trữ và lập chỉ mục trong `docs/TEST_INVENTORY.md`.
- `TEST_REPORT`: Test ID được ghi nhận trong báo cáo tổng hợp `docs/testing/TEST_REPORT.md`.
- `SOURCE_LINK`: Source component liên kết rõ ràng với test trong mã nguồn.
- `REQUIREMENT_LINK`: Test liên kết rõ với Acceptance Criteria hoặc Task Scope.
- `GIT_DIFF`: Git diff / commit log xác nhận sự thay đổi cụ thể của mã nguồn.
- `DEPENDENCY`: Liên kết qua chuỗi phụ thuộc phân tầng đã được xác minh.
- `COMBINED`: Kết hợp nhiều loại bằng chứng thực tế trên.
- `NONE`: Hoàn toàn chưa có bằng chứng xác minh.

### 8.7. `Defect Classification` (3 giá trị)
- `CODE_DEFECT`: Lỗi logic mã nguồn, vi phạm AC/NFR hoặc crash do code của Developer.
- `ENVIRONMENT_BLOCKER`: Trở ngại do máy host, thiếu công cụ, daemon container chưa bật.
- `CONFIGURATION_PROBLEM`: Lỗi biến môi trường `.env`, sai port binding, thiếu quyền hệ điều hành.
- **CẤM TUYỆT ĐỐI**: Tự ý sử dụng các nhãn phân loại legacy đã bãi bỏ (như `TEST_DEFECT`, `DATA_PROBLEM`, `DOCUMENTATION_DEFECT`).
- **Nguyên tắc phân định lỗi trong Test Code của Developer**: Nếu lỗi phát sinh bên trong mã nguồn kiểm thử tự động của Developer (`backend/tests/`) mà không phải do logic ứng dụng Production sai:
  - **KHÔNG ĐƯỢC COI LÀ DEFECT** của hệ thống (vì không có `CODE_DEFECT` trong mã nguồn Production).
  - **BẮT BUỘC** chuyển sang luồng **General Review** theo phân loại `CODE_OBSERVATION` với phạm vi `Scope = OUT-OF-SCOPE` (xem chi tiết quy chuẩn tại Mục 9.10).

### 8.7.1. Vòng đời Defect & Quyền hạn đóng lỗi (Defect Lifecycle & Governance)

Mọi Defect khi được ghi nhận vào `docs/testing/BUG_REPORT.md` phải tuân thủ nghiêm ngặt vòng đời chuyển trạng thái:

```text
       [Phát hiện lỗi]
              ↓
           [ OPEN ]  (Ghi nhận bởi QA / Tester kèm Evidence & Test ID)
              ↓
         [ RESOLVED ] (Developer fix code, cung cấp Commit Hash sửa lỗi)
              ↓
      [ RETEST_PENDING ] (Chuyển sang hàng đợi kiểm thử xác minh)
         ↙          ↘
[ CLOSED ]          [ REOPENED ]
(QA xác minh PASS)    (Lỗi vẫn tái diễn / phát sinh regression)
```

1. **Các trạng thái hợp lệ của Defect**:
   - `OPEN`: Bug mới được phát hiện, có bước tái hiện (repro steps) và Test ID liên kết.
   - `RESOLVED`: Developer đã xử lý xong mã nguồn và push commit sửa lỗi. Developer KHÔNG có quyền đóng bug.
   - `RETEST_PENDING`: Bug đã có bản vá, đang chờ Tester thực thi kịch bản retest trên snapshot mới.
   - `CLOSED`: QA Tester đã thực thi retest thực tế, có bằng chứng curl/log PASS 100%, chính thức đóng bug.
   - `REOPENED`: Quá trình retest thất bại hoặc phát hiện bug chưa được giải quyết triệt để.

2. **Quyền hạn duy nhất (Sole Authority)**:
   - **CHỈ CÓ TESTER / QA LEAD** mới có thẩm quyền chuyển trạng thái Defect sang `CLOSED`.
   - Developer tuyệt đối không được tự ý đổi trạng thái bug từ `OPEN` / `RESOLVED` sang `CLOSED`.

3. **Ràng buộc khóa ngoại bắt buộc (Mandatory Defect Binding)**:
   - Mọi bug trong `docs/testing/BUG_REPORT.md` bắt buộc phải có thuộc tính `AFFECTED_TEST_IDS` trỏ đến ít nhất một `Test ID` hợp lệ trong `docs/TEST_INVENTORY.md`.
   - Ngược lại, mọi Test Case có kết quả `FAIL` hoặc `BLOCKED` trong `docs/TEST_INVENTORY.md` bắt buộc phải có cột `Defect ID` chứa mã bug tương ứng (`BUG-xx`). Nếu test PASS, cột `Defect ID` ghi `NONE`.

### 8.8. `General Review Categories` (12 danh mục chuẩn)
Chỉ cho phép sử dụng đúng 12 phân loại sau cho các quan sát kỹ thuật:
- `CODE_OBSERVATION`: Phát hiện về phong cách viết mã, cú pháp hoặc cách trình bày mã nguồn.
- `LOGIC_OBSERVATION`: Phát hiện về luồng điều kiện, nhánh rẽ, hoặc thuật toán xử lý dữ liệu.
- `ARCHITECTURE_OBSERVATION`: Phát hiện về cấu trúc module, phân tầng trách nhiệm hoặc tính đóng gói.
- `INTEGRATION_OBSERVATION`: Phát hiện về giao diện giao tiếp giữa các thành phần (API contract, headers, envelope).
- `DATA_SCHEMA_OBSERVATION`: Phát hiện về kiểu dữ liệu, ràng buộc DDL SQL, hoặc schema validation.
- `CONFIGURATION_OBSERVATION`: Phát hiện về biến môi trường, cấu hình Docker, script khởi động.
- `DOCUMENTATION_OBSERVATION`: Phát hiện về tính đầy đủ, chính xác của docstrings, README, tài liệu API.
- `MAINTAINABILITY_OBSERVATION`: Phát hiện về độ phức tạp mã nguồn, tính dễ đọc và chi phí bảo trì.
- `DUPLICATION_OBSERVATION`: Phát hiện về sự lặp lại mã nguồn hoặc logic dùng chung chưa được tối ưu.
- `POTENTIAL_EDGE_CASE`: Phát hiện về trường hợp biên tiềm ẩn rủi ro nhưng chưa nằm trong AC kiểm thử.
- `VERIFICATION_RECOMMENDATION`: Khuyến nghị thiết lập thêm bài kiểm tra/chạy thử khi chưa đủ bằng chứng kết luận.
- `RECOMMENDATION`: Đề xuất cải thiện kỹ thuật chung không thuộc các phân loại chuyên biệt trên.
- **CẤM TUYỆT ĐỐI**: tự tạo category ngoài danh mục 12 canonical categories trên.

### 8.9. `General Review Confidence` (4 mức độ chắc chắn)
- `CONFIRMED`: Có bằng chứng trực tiếp khách quan chứng minh tính xác thực của quan sát.
- `LIKELY`: Có bằng chứng đáng kể nhưng chưa đủ để khẳng định hoàn toàn 100%.
- `POTENTIAL`: Chỉ phát hiện dấu hiệu rủi ro hoặc khả năng xảy ra trên lý thuyết.
- `UNKNOWN`: Chưa đủ dữ liệu để xác định mức độ chắc chắn.
- **CẤM TUYỆT ĐỐI**: biến `LIKELY`, `POTENTIAL`, `UNKNOWN` thành `CONFIRMED` bằng suy luận chủ quan.

### 8.10. `General Review Scope` (2 phạm vi)
- `IN-SCOPE`: Vấn đề nằm trong phạm vi của Story / Task / Requirement đang kiểm thử.
- `OUT-OF-SCOPE`: Vấn đề nằm ngoài phạm vi Story / Task đang kiểm thử.
- **CẤM TUYỆT ĐỐI**: Dùng phát hiện `OUT-OF-SCOPE` để đánh `FAIL` Requirement đang kiểm thử.

### 8.11. `General Review 5-Dimension Impact` (Đánh giá tác động 5 chiều)
Mỗi quan sát phải được đánh giá độc lập trên 5 chiều tác động, mỗi chiều chỉ nhận một trong 3 giá trị: `YES`, `NO`, `UNKNOWN`:
1. `Requirement Impact`: Có ảnh hưởng trực tiếp đến việc đạt hay hỏng của AC/NFR không? (`YES` / `NO` / `UNKNOWN`)
2. `Runtime Impact`: Có gây lỗi/crash/treo khi ứng dụng đang chạy không? (`YES` / `NO` / `UNKNOWN`)
3. `Data Impact`: Có làm sai lệch, thất thoát hoặc hỏng tính toàn vẹn dữ liệu không? (`YES` / `NO` / `UNKNOWN`)
4. `Integration Impact`: Có phá vỡ giao thức, API contract giữa Frontend và Backend không? (`YES` / `NO` / `UNKNOWN`)
5. `Maintainability Impact`: Có làm tăng chi phí bảo trì, gây khó khăn cho việc đọc hiểu mã nguồn không? (`YES` / `NO` / `UNKNOWN`)
   - **Tiêu chuẩn định lượng kích hoạt `YES`**:
     - Độ phức tạp Cyclomatic (Cyclomatic Complexity) > 10 trong một hàm.
     - Độ dài hàm (Function Length) > 50 dòng code thực thi (không tính comment và dòng trống).
     - Trùng lặp mã nguồn (Code Duplication) > 15 dòng logic giống hệt nhau hoặc lặp lại cấu trúc không cần thiết.
     - Độ sâu lồng khối điều kiện (Nesting Depth) > 4 cấp (`if`/`for`/`try`).
   - Nếu không thỏa mãn các ngưỡng định lượng trên hoặc không có nguy cơ bảo trì cụ thể chứng minh được, bắt buộc đánh giá là `NO`.
- **Quy tắc bảo vệ**: Nếu chưa có bằng chứng thực tế chứng minh, bắt buộc phải ghi `UNKNOWN`. Tuyệt đối không tự suy đoán `YES`.

---

## 9. QUY CHUẨN ĐÁNH GIÁ TỔNG QUÁT (GENERAL REVIEW STANDARD & OPERATING RULES)

### 9.1. Ranh giới cốt lõi: Observation ≠ Defect
Tester bắt buộc phải phân biệt rạch ròi giữa quan sát kỹ thuật và lỗi nghiệp vụ:
- **Observation (Quan sát kỹ thuật)**: Ghi nhận một điểm đáng chú ý về cấu trúc, phong cách mã, luồng điều kiện, bảo trì hoặc rủi ro tiềm ẩn.
- **Defect (Lỗi phần mềm)**: Hành vi thực tế sai lệch rõ ràng so với Requirement, Acceptance Criteria (`AC`), Non-functional Requirements (`NFR`) hoặc hợp đồng hệ thống đã được xác lập, **và đã có bằng chứng khách quan chứng minh**.
- **Recommendation (Khuyến nghị)**: Đề xuất phương án cải thiện chất lượng kỹ thuật, **không phải là nhiệm vụ bắt buộc (Required Fix)** và không được tự động chuyển thành bug.
- **Potential Issue (Vấn đề tiềm ẩn)**: Phát hiện dấu hiệu rủi ro nhưng chưa đủ bằng chứng thực tế để khẳng định.
- **CẤM TUYỆT ĐỐI**: Sử dụng các từ `BUG`, `DEFECT`, `FAIL`, `BROKEN` để mô tả một quan sát kỹ thuật nếu chưa có bằng chứng thực tế chứng minh vi phạm.
- **5 Cặp Phân Biệt Bắt Buộc**:
  $$\begin{aligned}
  \text{"Code có thể tốt hơn"} &\neq \text{"Code sai"} \\
  \text{"Logic khó hiểu"} &\neq \text{"Logic sai"} \\
  \text{"Potential issue"} &\neq \text{"Confirmed defect"} \\
  \text{"Recommendation"} &\neq \text{"Required fix"} \\
  \text{"Observation"} &\neq \text{"Test Failure"}
  \end{aligned}$$

### 9.2. Nguyên tắc bất di bất dịch: NO AUTO-FIX
Trong luồng General Review, vai trò của AI Tester chỉ giới hạn trong chuỗi hành động:
$$\text{DETECT} \longrightarrow \text{DOCUMENT} \longrightarrow \text{CLASSIFY} \longrightarrow \text{PROVIDE EVIDENCE} \longrightarrow \text{ASSESS IMPACT} \longrightarrow \text{RECOMMEND}$$
- **CẤM TUYỆT ĐỐI**:
  - Tự ý sửa mã nguồn backend/frontend.
  - Tự ý sửa test suite của Developer hoặc thêm test vào `backend/tests/`.
  - Tự ý refactor mã nguồn.
  - Tự ý thay đổi kiến trúc hoặc cấu hình hệ thống.
  - Tự ý thay đổi yêu cầu hoặc tiêu chí chấp nhận AC/NFR.
  - Tự ý đổi trạng thái kiểm thử (`Test Status = PASS`) thành `FAIL` chỉ dựa trên quan sát kỹ thuật.

### 9.3. Tiêu chuẩn xác định vị trí mã nguồn (Source Location Standard)
Mỗi quan sát kỹ thuật phải xác định đầy đủ tọa độ mã nguồn thực tế:
- `File`: Đường dẫn tương đối từ thư mục gốc dự án (vd: `backend/src/modules/stations/stations.service.js`).
- `Module`: Tên module chức năng (vd: `stations`, `auth`, `router`).
- `Function / Class`: Tên hàm, phương thức hoặc lớp chứa điểm quan sát (vd: `createStation`, `loginThrottle`).
- `Line / Range`: Số dòng hoặc dải dòng cụ thể trong snapshot hiện tại (vd: `L45-L52`).
- `Source Component`: Tên component tương ứng trong `PROJECT_STRUCTURE.md`.
- `Evidence`: Trích đoạn mã nguồn thực tế tại vị trí đó.
- **Quy tắc an toàn**: Nếu không thể định vị chính xác, bắt buộc ghi `UNKNOWN`. Tuyệt đối không tự bịa đặt location.

### 9.4. Tiêu chuẩn bằng chứng thực tế cho General Review (Evidence Rules)
- Bằng chứng của General Review phải tách biệt hoàn toàn với **Expected Result**:
  - **Expected Result**: Là kỳ vọng lý thuyết của người kiểm thử.
  - **Evidence**: Là sự thật khách quan trích xuất từ: mã nguồn thực tế, output dòng lệnh thực tế, HTTP response thực tế, query kết quả DB thực tế, hoặc file cấu hình thực tế.
- **CẤM TUYỆT ĐỐI**: Sử dụng giả định, suy luận chủ quan, kết quả kỳ vọng, hoặc comment trong mã nguồn làm evidence chứng minh hành vi runtime nếu chưa được kiểm chứng thực tế.

### 9.5. Ma trận đánh giá tác động 5 chiều (5-Dimension Impact Assessment)
Mọi quan sát kỹ thuật phải được đánh giá khách quan trên 5 trục độc lập (`YES` / `NO` / `UNKNOWN`):
1. **`Requirement Impact`**: Có ảnh hưởng trực tiếp đến việc đạt hay hỏng của AC/NFR nào không?
2. **`Runtime Impact`**: Có khả năng gây sập ứng dụng, unhandled rejection hoặc deadlock lúc runtime không?
3. **`Data Impact`**: Có nguy cơ làm sai lệch, thất thoát hoặc hỏng tính toàn vẹn cơ sở dữ liệu không?
4. **`Integration Impact`**: Có làm gãy vỡ giao tiếp giữa Frontend Client và Backend API không?
5. **`Maintainability Impact`**: Có làm tăng độ phức tạp mã nguồn, gây khó khăn cho việc bảo trì tương lai không?
- **Nguyên tắc an toàn**: Khi chưa có bằng chứng thực tế chứng minh ảnh hưởng, bắt buộc ghi nhận `UNKNOWN`. Tuyệt đối không tự suy diễn `YES`.

### 9.6. Quy tắc cách ly kết quả kiểm thử (Test Result Isolation)
General Review **TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ ĐỘNG THAY ĐỔI**:
- `Test Status` (`PASS`, `FAIL`, `BLOCKED`,...)
- `Verification` (`VERIFIED`, `NOT VERIFIED`)
- `Regression State` (`REGRESSION CANDIDATE`, `PASS`,...)
- `Requirement Result`
- **Ví dụ chuẩn mực**:
  $$\begin{aligned}
  \text{Requirement Test:} \quad &\text{PASS (đã có curl output đáp ứng AC)} \\
  \text{General Review:} \quad &\text{LOGIC_OBSERVATION (phát hiện cấu trúc if/else lồng nhau phức tạp)} \\
  \Longrightarrow \quad &\textbf{Kết quả kiểm thử Requirement VẪN LÀ PASS.}
  \end{aligned}$$
- **Cơ chế chuyển đổi (Observation → Defect Transition)**:
  Chỉ khi quá trình điều tra tiếp theo thu thập được bằng chứng khách quan chứng minh quan sát đó trực tiếp làm sai lệch kết quả runtime so với AC/NFR:
  $$\text{Observation} \longrightarrow \text{Requirement Impact = YES} \longrightarrow \text{REQUIREMENT DEFECT} \longrightarrow \text{Mở lại luồng Requirement Testing}$$

### 9.7. Cấu trúc Khuyến nghị xác minh (Verification Recommendation Standard)
Khi phát hiện một điểm nghi vấn hoặc rủi ro nhưng chưa đủ bằng chứng kết luận, Tester tạo một hạng mục thuộc phân loại `VERIFICATION_RECOMMENDATION` với cấu trúc bắt buộc:
1. **What to verify**: Cần kiểm chứng hành vi/dữ liệu gì cụ thể?
2. **Why it may matter**: Tại sao điều này có thể gây rủi ro cho hệ thống?
3. **Suggested verification method**: Phương pháp kiểm chứng đề xuất (chạy test suite nào, curl endpoint nào, cấu hình DB ra sao).
4. **Expected evidence**: Loại bằng chứng cần thu thập để kết luận.
5. **Current confidence**: Mức độ chắc chắn hiện tại (`POTENTIAL` hoặc `UNKNOWN`).

### 9.8. Kiểm soát trùng lặp (Duplication Control) & Xử lý ngoài phạm vi (Out-of-Scope)
- **Kiểm soát trùng lặp**: Nếu cùng một vấn đề xuất hiện ở nhiều file/vị trí (ví dụ: cùng thiếu validate trim string ở 5 controllers), gom thành **một Observation duy nhất** và liệt kê toàn bộ các location bị ảnh hưởng. Chỉ tách riêng khi có bằng chứng cho thấy nguyên nhân gốc rễ (Root Cause) khác nhau.
- **Xử lý ngoài phạm vi**: Khi phát hiện vấn đề ngoài Story/Task đang kiểm thử, đánh dấu rõ `Scope = OUT-OF-SCOPE`.
  - **CẤM TUYỆT ĐỐI**: Sử dụng một quan sát `OUT-OF-SCOPE` để đánh `FAIL` cho Requirement đang kiểm thử hiện tại.

### 9.9. Phân tách kết quả cuối cùng (Final Separation)
Mọi báo cáo kết quả kiểm thử bắt buộc phải trình bày thành **HAI KHU VỰC TÁCH BIỆT HOÀN TOÀN**:
- **KHU VỰC A — REQUIREMENT TEST RESULTS**:
  - Bảng kê danh mục Test Cases, trạng thái `PASS` / `FAIL` / `BLOCKED`, mức độ `VERIFIED`, và bằng chứng thực tế tương ứng.
- **KHU VỰC B — GENERAL REVIEW FINDINGS**:
  - Bảng kê các quan sát kỹ thuật, phân loại category, tọa độ location, đánh giá 5 chiều impact, mức độ confidence, và khuyến nghị cải thiện.
  - Khu vực này hoàn toàn không làm thay đổi trạng thái tổng kết của Khu vực A nếu chưa chứng minh vi phạm AC/NFR.

### 9.10. Quy chuẩn xử lý khi Bộ kiểm thử của Developer bị FAIL & Nguyên tắc hiển thị Bảng Tổng kết

Khi thực thi bộ kiểm thử tự động của Developer (`npm test` hoặc `backend/tests/**`) và phát hiện có test case bị `FAIL`:

1. **Quy trình điều tra 3 bước (3-Step Root Cause Investigation)**:
   - **Bước 1**: Phân tích stack trace, error log và vị trí file bị fail để xác định lỗi xuất phát từ mã nguồn Production (`backend/src/`) hay do chính mã test của Developer (`backend/tests/`).
   - **Bước 2**: Thực hiện kiểm chứng độc lập (Live Verification qua curl/HTTP request trực tiếp trên môi trường chạy thực tế) đối với các AC/NFR nghiệp vụ tương ứng.
   - **Bước 3**: 
     - *Nếu lỗi do mã nguồn Production sai lệch AC*: Ghi nhận `Test Status = FAIL`, phân loại `CODE_DEFECT`, và mở quy trình báo cáo lỗi phần mềm.
     - *Nếu mã nguồn Production hoạt động hoàn toàn đúng chuẩn qua Live Verification, nhưng test của Dev bị FAIL do lỗi trong test runner/test code* (ví dụ: đóng database pool giữa suite làm đứt kết nối, thiếu mock, lỗi timing hook `after()`): **TUYỆT ĐỐI KHÔNG TỰ SỬA TEST CỦA DEV** (vi phạm ranh giới Tester), **KHÔNG TỰ TẠO ENUM `TEST_DEFECT`** (vi phạm quy chuẩn Canonical Enum), mà **BẮT BUỘC ghi nhận vào Luồng B (General Review) dưới dạng `CODE_OBSERVATION` với phạm vi `Scope = OUT-OF-SCOPE`**.

2. **Nguyên tắc đánh giá tác động 5 chiều cho lỗi trong Test Suite của Developer**:
   - `Requirement Impact`: **`NO`** (Các AC/NFR đã được xác minh PASS qua kiểm thử độc lập).
   - `Runtime Impact`: **`NO`** (Ứng dụng production và container không bị ảnh hưởng).
   - `Data Impact`: **`NO`** (Không làm hỏng tính toàn vẹn cơ sở dữ liệu thực tế).
   - `Integration Impact`: **`NO`** (Hợp đồng API không bị phá vỡ).
   - `Maintainability / Regression Impact`: **`YES`** (Làm gián đoạn test runner CI/CD của Developer team).

3. **Mẫu chuẩn bắt buộc tại Bảng Tổng kết (Summary Dashboard Standard)**:
   - Nghiêm cấm việc chỉ ghi một dòng duy nhất `Overall Story: PASS` mà không giải trình khi có test case của Developer bị FAIL (tránh gây hiểu lầm là Tester bao che hoặc bỏ qua lỗi test).
   - Bắt buộc phải trình bày phân định minh bạch thành 2 dòng độc lập:
     ```markdown
     ### Overall Story & Task Status
     - **S-xx (Requirement Verification)**: **PASS** (100% AC đã được kiểm chứng độc lập qua live test)
     - **T-xx**: **PASS**
     - **Developer Acceptance Suite (`filename.test.js`)**: **FAIL (x/y tests)** — Lỗi xuất phát từ test harness của Dev [mô tả ngắn gọn nguyên nhân, mã tham chiếu OBS-xxx (OUT-OF-SCOPE)]; theo quy chuẩn TESTER_STANDARD.md, lỗi ngoài phạm vi không dùng để đánh fail Story.
     ```
---

### 9.11. Cây quyết định 10 giây cho Tester (10-Second Decision Tree)

Để loại trừ hoàn toàn các điểm xám (grey areas) và bảo đảm tính nhất quán 100% giữa các Tester và AI Tester, áp dụng cây quyết định nhanh dưới đây khi gặp các tình huống mơ hồ:

| Tình huống thực tế gặp phải | Câu hỏi kiểm tra cốt lõi | Hành động và Phân loại bắt buộc | Trạng thái Test gán |
|---|---|---|:---:|
| **1. Endpoint không gọi được** | Request có tới được tầng logic của ứng dụng không? | **Không tới được** (Container tắt, DB connection sập, sai PORT, network timeout): Ghi nhận `ENVIRONMENT_BLOCKER` hoặc `CONFIGURATION_PROBLEM`.<br>**Tới được nhưng sập** (Unhandled 500 crash trong code): Ghi nhận `CODE_DEFECT`. | `BLOCKED`<br>hoặc<br>`FAIL` |
| **2. Thiếu dữ liệu Seed / Preconditions** | Tester có thể tự tạo dữ liệu hợp lệ qua API công khai không? | **Có**: Tạo data và tiếp tục test.<br>**Không** (Thiếu migration, thiếu quyền superadmin, DB rỗng): Ghi nhận `CONFIGURATION_PROBLEM`, tạm dừng kịch bản. | `BLOCKED` |
| **3. Test của Dev bị FAIL** | Live curl endpoint thực tế có đáp ứng đúng 100% AC không? | **Có**: Lỗi do test harness Dev $\longrightarrow$ Ghi nhận `CODE_OBSERVATION (OUT-OF-SCOPE)` vào Khu vực B. Không đánh fail Story.<br>**Không**: Lỗi do backend code sai thật $\longrightarrow$ Ghi nhận `CODE_DEFECT`. | Khu vực A: `PASS`<br>Khu vực B: `OBS`<br>hoặc `FAIL` |
| **4. Code smell, hàm quá dài, lặp code** | Hành vi runtime có chạy sai lệch so với AC/NFR không? | **Không sai**: Bắt buộc ghi nhận vào Khu vực B (`MAINTAINABILITY_OBSERVATION` hoặc `DUPLICATION_OBSERVATION`). CẤM coi là Defect.<br>**Có sai**: Ghi nhận `CODE_DEFECT`. | `PASS`<br>(Khu vực A) |
| **5. Phát hiện bug ở ngoài Story đang test** | Tính năng bị lỗi có nằm trong Task Scope / AC của Story này không? | **Nằm ngoài**: Ghi nhận `Scope = OUT-OF-SCOPE`, mở ticket Defect độc lập hoặc ghi vào General Review. Tuyệt đối KHÔNG đánh FAIL Story hiện tại.<br>**Nằm trong**: Đánh `FAIL` Story. | Giữ nguyên trạng thái Story |
| **6. Endpoint chưa được viết code (HTTP 404)** | Story / Task đã được Developer bàn giao để nghiệm thu chưa? | **Đã bàn giao**: Developer chưa hoàn thành cam kết $\longrightarrow$ `CODE_DEFECT` / `FAIL`.<br>**Chưa bàn giao / Sprint chưa tới**: Đánh `NOT FOUND` hoặc `NOT RUN`. | `FAIL` hoặc `NOT FOUND` |
| **7. Requirement mơ hồ / Thiếu AC** | Tài liệu Story có chỉ rõ hành vi kỳ vọng không? | **Không**: Đánh `NOT VERIFIED`, phân loại `DOCUMENTATION_OBSERVATION`, gửi khuyến nghị làm rõ đến PO. CẤM tự bịa ra kỳ vọng để phán PASS/FAIL. | `NOT VERIFIED` |
| **8. Dependency Upstream lỗi** | Module hiện tại có lỗi nội tại không? | **Không**, chỉ lỗi vì service upstream trả về lỗi: Đánh `BLOCKED` do dependency. Ghi rõ mã upstream blocker. | `BLOCKED` |
| **9. Dev push commit fix bug** | Tester đã chạy lại bài test trên snapshot mới chưa? | **Chưa chạy**: Chuyển trạng thái test sang `RETEST_PENDING`. CẤM nhảy trực tiếp sang `PASS`.<br>**Đã chạy PASS**: Chuyển sang `PASS`, QA đóng bug sang `CLOSED`. | `RETEST_PENDING` $\rightarrow$ `PASS` |
| **10. Kết quả test chập chờn (Flaky Test)** | Chạy lặp lại 3 lần có cùng kết quả không? | **Không đồng nhất**: Kiểm tra race condition, async timing. Ghi nhận `POTENTIAL_EDGE_CASE` hoặc `CODE_DEFECT` nếu là lỗi production logic. Không được bỏ qua khi thấy 1 lần pass. | `FAIL` hoặc `NOT VERIFIED` |

---

## 10. QUY TẮC THIẾT KẾ VÀ THỰC THI KIỂM THỬ (TEST EXECUTION 6-LAYERS)

Mọi kịch bản kiểm thử phải được thực thi theo chiến lược 6 tầng tăng dần:

1. **Layer 1 — Static Analysis (Kiểm tra tĩnh)**:
   - Rà soát cú pháp, kiểu dữ liệu, linting (`npm run lint`), quy chuẩn bảo mật (không hardcode secrets, không backdoor, Argon2id, Zod schemas, quy tắc cấm `express.Router()` trực tiếp).
2. **Layer 2 — Unit Test Verification (Kiểm thử đơn vị)**:
   - Thực thi các test suite đơn vị độc lập của Developer (`backend/tests/unit/`: `connection-registry`, `frontend-permissions`, `frontend`, `station-schema`, `scope`, `errorHandler`, `env`).
3. **Layer 3 — Integration Verification (Kiểm thử tích hợp)**:
   - Kiểm tra tương tác giữa các module: database migrations up/down/up sạch, transaction nguyên tử, seed demo (`scripts/seed-demo.js`), create admin CLI, và hợp đồng tích hợp Frontend ↔ Backend (`FB-01..11`).
4. **Layer 4 — Acceptance Live Test (Kiểm thử nghiệm thu trực tiếp)**:
   - Gửi HTTP request thực tế qua curl/postman/supertest trên ứng dụng đang chạy thật trên cổng 3000 và DB 5432/5433 để nghiệm thu từng tiêu chí AC (S-01 đến S-05).
5. **Layer 5 — Realtime WebSocket & Concurrency Verification (Kiểm thử WebSocket OCPP & Đồng thời)**:
   - Kiểm thử kết nối WebSocket hai chiều `/ocpp/:code`, bắt tay HTTP Upgrade, định dạng gói tin JSON-RPC OCPP 1.6-J (`BootNotification`, `Heartbeat`, `StatusNotification`, `Authorize`).
   - Kiểm tra bộ đăng ký kết nối in-memory `connection-registry.js`, đếm kết nối đồng thời và kiểm chứng cơ chế chặn đổi mã trụ khi trụ đang kết nối (`ConflictError 409`).
6. **Layer 6 — AI Security Audit & Taint Assurance (Kiểm toán An ninh & Luồng Dữ liệu Source-to-Sink)**:
   - Vận hành theo Khung kiểm toán an ninh chuẩn tại [`docs/Audit/README.md`](./Audit/README.md) qua Pipeline 5 bước (Cartographer $\rightarrow$ Hunter $\rightarrow$ Verifier $\rightarrow$ Synthesizer $\rightarrow$ Auditor).
   - Rà soát 21 danh mục kiểm tra an ninh trong `docs/Audit/03_catalogs/` (Auth, IDOR, Session, SQLi, CSRF, CORS, Crypto, Race Conditions, DoS, Supply Chain).
   - Thiết kế kịch bản xác minh an toàn Canary (non-destructive) và kiểm thử phủ định (Negative Testing).
   - Tuân thủ thứ bậc Quality Gate: $\text{BLOCK} > \text{UNKNOWN} > \text{HOLD} > \text{PASS\_WITH\_CONDITIONS} > \text{PASS}$ và xuất báo cáo lưu trữ tại `docs/Audit/results/`.

---

### 10.1. Quy chuẩn kiểm thử Giao diện Frontend Modular SPA
Khi kiểm định chất lượng ứng dụng web frontend tái cấu trúc (`frontend/`):
1. **Kiểm tra tính an toàn chống XSS tuyệt đối (Zero innerHTML Rule)**:
   - Mọi phần tử UI trong `frontend/app/dom.js` bắt buộc phải tạo thông qua hàm `h()` hoặc `svg()`, sử dụng `document.createElement()` và gán giá trị thuần qua `document.createTextNode()` / `textContent`.
   - **CẤM TUYỆT ĐỐI**: `innerHTML`, `outerHTML`, `document.write` hoặc `eval()` trong toàn bộ mã nguồn ứng dụng phía client.
2. **Kiểm thử bộ điều hướng URL Hash Routing**:
   - Kiểm tra router client-side phân tích đúng cấu trúc `#/<workspace>/<page>/<id>?<query>`.
   - Xác minh bảo vệ quyền truy cập: Khi chưa có phiên hoặc phiên hết hạn (401), tự động chuyển hướng về `#login` / `/index.html`.
   - Xác minh ẩn/hiện menu điều hướng (`sidebar.js`, `workspace.js`) theo đúng quyền hạn vai trò của user (`frontend/app/permissions.js` khớp 100% với `backend/src/security/permissions.js`).
3. **Kiểm thử tích hợp bản đồ tương tác Leaflet**:
   - Đảm bảo tài nguyên Leaflet nạp từ vendor nội bộ (`frontend/vendor/leaflet/`), không phụ thuộc CDN bên ngoài.
   - Kiểm tra render marker trạm sạc, toạ độ địa lý (vĩ độ -90..90, kinh độ -180..180) và popup thông tin chi tiết.

---

### 10.2. Quy chuẩn kiểm thử Giao thức WebSocket OCPP 1.6
Khi kiểm thử kết nối cổng sạc ngoại vi:
1. **Bắt tay kết nối (Handshake Upgrade)**:
   - Endpoint: `ws://<host>:<port>/ocpp/<charge_point_code>`.
   - Kiểm tra gói tin phản hồi chào mừng ban đầu: `[3, "<messageId>", {"chargePoint": "...", "status": "Connected"}]`.
2. **Xử lý gói tin rác (FormatViolation)**:
   - Gửi payload không đúng JSON hoặc sai định dạng mảng RPC $\rightarrow$ Máy chủ phải phản hồi mã lỗi `[4, null, "FormatViolation", {}]`, không làm sập tiến trình Node.js.
3. **Xác minh an ninh và quản trị trạng thái**:
   - Kiểm tra rào cản kết nối ẩn danh (Security Defect `SEC-WS-001`): Kẻ tấn công mở kết nối không chứng thực làm treo trạng thái trụ.
   - Ngắt kết nối socket $\rightarrow$ Bộ đếm `connections.disconnect(code)` phải giải phóng kết nối tức thì.

## 11. QUY TẮC BẰNG CHỨNG THỰC TẾ (EVIDENCE RULES)

1. **Tính xác thực (Authenticity)**:
   - Mọi trạng thái `PASS` bắt buộc phải kèm theo bằng chứng thực tế trích xuất trực tiếp từ terminal, curl output, HTTP status code, response payload, DB query log, hoặc kết quả pass của automated test.
2. **Khả năng truy xuất (Traceability)**:
   - Bằng chứng phải nêu rõ: Lệnh đã chạy, thời điểm chạy, đầu vào gửi đi, đầu ra nhận về.
3. **Phân biệt Status và Verification**:
   - `Status = PASS` thể hiện kết quả test.
   - `Verification = VERIFIED` thể hiện tính đầy đủ của bằng chứng.
   - Một test có thể có `Status = PASS` trong quá khứ nhưng hiện tại đang có `Verification = NOT VERIFIED` nếu chưa kiểm chứng lại trên snapshot mới.

---

## 12. QUY TẮC PHÂN TÍCH TÁC ĐỘNG VÀ HỒI QUY CHỌN LỌC (SELECTIVE REGRESSION)

Khi một thành phần mã nguồn dùng chung bị sửa đổi, Tester áp dụng **4 Case chuyển trạng thái chuẩn**:

- **Case 1 — Nghi ngờ có ảnh hưởng (Suspicion only)**:
  - `Impact Type = POTENTIAL_IMPACT` | `Investigation Label = RELATED` | `Regression State = NOT VERIFIED` | `Test Status = NOT RUN` | `Verification = NOT VERIFIED`.
- **Case 2 — Đã xác minh Shared Component**:
  - `Impact Type = SHARED_COMPONENT` | `Investigation Label = AFFECTED` | `Regression State = REGRESSION CANDIDATE` | `Verification = VERIFIED`.
- **Case 3 — Regression đã thực thi thực tế (Actual Execution)**:
  - Sau khi chạy lại bài test lịch sử: `Regression State` chuyển thành `PASS`, `FAIL`, hoặc `BLOCKED`. `Test Status` phản ánh kết quả đo được.
- **Case 4 — Xác nhận nguyên nhân gốc rễ (Confirmed Root Cause)**:
  - CHỈ gán `Investigation Label = CONFIRMED ROOT CAUSE` khi có evidence trực tiếp chứng minh sai lệch logic tại điểm sửa đổi là nguyên nhân trực tiếp gây lỗi.

---

## 13. QUY CHUẨN ĐỊNH DẠNG TÀI LIỆU ĐẦU RA (OUTPUT DOCUMENT SCHEMAS)

### 13.1. Schema hồ sơ kiểm thử Story chuẩn mực (`docs/stories/S-xx.md`)
Mọi hồ sơ kiểm thử Story mới bắt buộc phải tuân theo cấu trúc 11 mục phân tách chuẩn mực:

```markdown
# S-xx — [Story Title]

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Jira**: `S-xx`  
> **Epic liên kết**: `E-xx` (nếu có)  
> **Task kỹ thuật**: `T-xx`  
> **Test Date**: DD/MM/YYYY  
> **Tester**: TESTER / QA ANALYST  
> **Snapshot Commit**: `<commit_hash>`  

---

## 1. Requirement & Acceptance Criteria
### Story Requirement
### Acceptance Criteria (Sxx-AC-01, ...)
### Non-functional Requirements (Sxx-NFR-01, ...)

## 2. Task Scope (T-xx, ...)

## 3. Dependency Graph & Verification
| Upstream | Current Item | Downstream | Dependency Basis | Scope Impact | Verification |
|---|---|---|---|---|---|

## 4. Test Execution & Evidence (KHU VỰC A: REQUIREMENT TEST RESULTS)
### TC-Sxx-01
- **Test ID**: `TC-Sxx-01`
- **Requirement**: `Sxx-AC-01`
- **Execution Type**: Automated / Live curl
- **Status**: `PASS` / `FAIL` / `BLOCKED`
- **Evidence**:
```text
[Terminal / Log output thực tế]
```

## 5. Test Cases Summary (Bảng kê test case)
## 6. Bidirectional Traceability Matrix
## 7. Current Status Summary (Bảng đếm PASS/FAIL/BLOCKED)
## 8. Defects & Blockers (Nếu có lỗi vi phạm AC/NFR)
## 9. Impact & Regression Analysis
## 10. Final Story Status (KẾT LUẬN NGHIỆM THU REQUIREMENT)

---

## 11. General Review Findings (KHU VỰC B: ĐÁNH GIÁ KỸ THUẬT ĐỘC LẬP)
| ID | Category | Scope | Location | Observation | Confidence | Req Impact | Runtime Impact | Data Impact | Int Impact | Maint Impact | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **GR-01** | `LOGIC_OBSERVATION` | `IN-SCOPE` | `src/service.js:L45` | Chi tiết quan sát... | `CONFIRMED` | `NO` | `NO` | `NO` | `NO` | `YES` | Khuyến nghị cải thiện... |
```

### 13.2. Schema bản ghi General Review chi tiết
Khi lập báo cáo General Review độc lập, mỗi quan sát phải tuân theo cấu trúc:
```markdown
### [GR-xx] [Category] - [Tiêu đề quan sát ngắn gọn]
- **ID**: `GR-xx`
- **Category**: `CODE_OBSERVATION` / `LOGIC_OBSERVATION` / ... (12 canonical categories)
- **Scope**: `IN-SCOPE` / `OUT-OF-SCOPE`
- **Location**:
  - File: `backend/src/...`
  - Module: `...`
  - Function / Class: `...`
  - Lines: `L...-L...`
- **Observation**: [Mô tả chi tiết điểm quan sát]
- **Evidence**:
```javascript
// Trích đoạn mã nguồn hoặc actual command output thực tế
```
- **Confidence**: `CONFIRMED` / `LIKELY` / `POTENTIAL` / `UNKNOWN`
- **5-Dimension Impact**:
  - Requirement Impact: `YES` / `NO` / `UNKNOWN`
  - Runtime Impact: `YES` / `NO` / `UNKNOWN`
  - Data Impact: `YES` / `NO` / `UNKNOWN`
  - Integration Impact: `YES` / `NO` / `UNKNOWN`
  - Maintainability Impact: `YES` / `NO` / `UNKNOWN`
- **Recommendation**: [Đề xuất hướng xử lý kỹ thuật]
- **Verification Needed**: [Kế hoạch hoặc bước xác minh thêm nếu confidence chưa phải CONFIRMED]
- **Related Requirement**: `Sxx-AC-xx` (nếu có liên hệ)
```

---

## 14. DANH MỤC KIỂM TRA AN TOÀN TRƯỚC KHI KẾT THÚC (FINAL SAFETY CHECK)

Trước khi kết thúc bất kỳ lượt kiểm thử hay đánh giá nào, Tester phải tự kiểm tra 18 điều kiện bắt buộc:

- [ ] 1. Không sửa đổi bất kỳ tệp mã nguồn nào ngoài thư mục `docs/`.
- [ ] 2. Không sửa test code của Developer trong `backend/tests/`.
- [ ] 3. Không sửa database schema hoặc các file SQL migration.
- [ ] 4. Không sửa Docker configuration, `.env`, hoặc package dependencies.
- [ ] 5. Không thực hiện lệnh `git commit` hoặc `git push`.
- [ ] 6. Không tạo bằng chứng giả (Fake evidence).
- [ ] 7. Không đổi `Status` của test khi chưa chạy kiểm thử thực tế.
- [ ] 8. Không đổi `NOT VERIFIED` thành `VERIFIED` khi thiếu bằng chứng xác thực.
- [ ] 9. Đã phân biệt rạch ròi giữa Hierarchy (E → S → T) và Dependency Graph.
- [ ] 10. Toàn bộ các enum sử dụng đều thuộc tập hợp Canonical Enums chuẩn mực; không sử dụng enum legacy (`TEST_DEFECT`,...).
- [ ] 11. Đã phân lập triệt để giữa Requirement Testing (Khu vực A) và General Review (Khu vực B).
- [ ] 12. Không sử dụng General Review Observation để đánh `FAIL` Requirement khi chưa có bằng chứng vi phạm AC/NFR.
- [ ] 13. Đã cập nhật đồng bộ các tài liệu QA liên quan (`PROJECT_STRUCTURE.md`, `TEST_INVENTORY.md`, `stories/`).
- [ ] 14. Mọi kết luận báo cáo đều có bằng chứng truy vết hai chiều đầy đủ.
- [ ] 15. **Toàn vẹn phạm vi Story (Scope Integrity)**: Đã đối soát tất cả các chức năng/động từ trong Tiêu đề Story với danh sách AC và Test Cases, bảo đảm không bỏ sót chức năng nào (ví dụ: tiêu đề "Tạo và Sửa" phải có đầy đủ kịch bản cho cả Tạo và Sửa).
- [ ] 16. **Đồng nhất mã Commit Snapshot**: 100% tài liệu trong `docs/` đều sử dụng chung một mã Git Commit Snapshot và ngày kiểm thử hợp lệ của snapshot hiện tại.
- [ ] 17. **Toàn vẹn liên kết tương đối (Link Integrity)**: Không có liên kết markdown nào bị gãy (HTTP 404), đặc biệt là giữa các thư mục con trong `docs/` (`docs/testing/` ↔ `docs/stories/`).
- [ ] 18. **Không kết luận vượt quá bằng chứng thực tế**: Bằng chứng đến đâu kết luận đến đó; tuyệt đối không phán đoán PASS cho migration/DB khi chỉ mới chạy unit test schema JS.
