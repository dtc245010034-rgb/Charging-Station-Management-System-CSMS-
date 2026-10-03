# AI TESTER ENTRY POINT & ROUTER

> **Dự án**: Charging-Station-Management-System-CSMS-  
> **Chủ thể**: AI TESTER / QA ANALYST  
> **Phiên bản kiến trúc**: 3.5 (Entry Point, Security Audit & Navigation Router)  
> **Snapshot Date**: 29/09/2026  
> **Git Commit**: `ba61aeaee0f061e1409913cd5c1ea8c5d84e5f98` (nhánh `main`)  
> **Hiệu lực**: Điểm tiếp nhận bắt buộc đầu tiên cho mọi tác vụ kiểm định chất lượng & kiểm toán an ninh  
> **Nguyên tắc điều hướng cốt lõi**: Entry Router → Central Standard → Project Facts → Test Facts → Action  

---

## 1. TỔNG QUAN HỆ THỐNG TÀI LIỆU TESTER (DOCUMENT ARCHITECTURE)

Hệ thống tài liệu kiểm định chất lượng của dự án được phân định rạch ròi thành các phân vùng chức năng thống nhất:

```text
                                  docs/README.md
                         (AI Tester Entry Point / Router)
                                        ↓
                             docs/TESTER_STANDARD.md
                     (Bộ quy chuẩn Tester trung tâm - RULES)
                                        ↓
                            docs/PROJECT_STRUCTURE.md
                        (Bản đồ dự án đã xác minh - FACTS)
                                        ↓
                             docs/TEST_INVENTORY.md
                     (Chỉ mục danh mục kiểm thử - TEST FACTS)
                                        ↓
     ┌───────────────────┬──────────────┼───────────────────┬───────────────────┐
     ↓                   ↓              ↓                   ↓                   ↓
docs/stories/       docs/integration/  docs/testing/       docs/Audit/         docs/design/
(Kịch bản chấp      (Tích hợp toàn     (Báo cáo & Lỗi:     (Khung kiểm toán    (Đặc tả UX & UI
nhận theo Story:    trình FE/BE:       TEST_PLAN, REPORT,  an ninh 5 bước:     Operator Dashboard
S-01 đến S-05)      FB-01 đến FB-11)   BUG_REPORT, REG.)   RUNBOOK, RESULTS)   mẫu baseline)
```

| Phân vùng tài liệu | Vai trò kiến trúc | Trách nhiệm chính | Thẩm quyền |
|:---|:---|:---|:---:|
| **[`README.md`](./README.md)** (File này) | **Entry Point & Router** | Điều hướng kiểm thử, FAQ vận hành và quy trình định tuyến | Tester Quản Trị |
| **[`TESTER_STANDARD.md`](./TESTER_STANDARD.md)** | **Central Rulebook & Standards** | Nguồn luật bất biến: Enum, Cây quyết định, State Machine, AI Guardrails, Security Tiers | Tester Quản Trị (Nguồn Luật) |
| **[`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md)** | **Verified Project Map** | Bản đồ mã nguồn, components, dependencies đã xác minh (138 tests / 29 suites) | Tester Quản Trị (Sự Thật Dự Án) |
| **[`TEST_INVENTORY.md`](./TEST_INVENTORY.md)** | **Verified Test Index** | Danh mục tập trung các Test Cases, trạng thái, Defect binding, Security Findings | Tester Quản Trị (Sự Thật Kiểm Thử) |
| **[`Audit/`](./Audit/README.md)** | **AI Security Audit Framework** | Khung kiểm toán an ninh v3.0: 5 bước SOP, 21 Check Catalogs, Báo cáo kết quả | Tester Quản Trị (Kiểm Toán An Ninh) |
| **[`stories/S-xx.md`](./stories/)** | **Story Test Specifications** | Chi tiết kịch bản, bước thực thi và bằng chứng cho từng User Story (S-01 .. S-05) | Tester Quản Trị |
| **[`integration/`](./integration/)** | **Integration Specifications** | Kiểm thử tích hợp toàn trình giữa Frontend Client ↔ Backend API | Tester Quản Trị |
| **[`testing/`](./testing/)** | **Reporting & Defect Tracking** | Báo cáo kiểm thử tổng thể, hồ sơ theo dõi Bug và đánh giá hồi quy | Tester Quản Trị |
| **[`OPERATIONS.md`](./OPERATIONS.md)** | **Sổ tay vận hành** | Build, chạy, dừng, khởi động lại, DB, staging, biến môi trường | Dev / Scrum Master |
| **[`SPRINT_STATUS.md`](./SPRINT_STATUS.md)** | **Tình trạng dự án & sprint** | Sprint 1 đã xong gì, Sprint 2 kế hoạch, rủi ro, DoD, nhánh Git | Scrum Master |
| **[`design/`](./design/)** | **Design & UX Specifications** | Hồ sơ thiết kế kiến trúc UX/UI Operator Dashboard Level 3 và ảnh mẫu đối soát | Tham chiếu Thiết Kế |
| **`spikes/`** | **Research & Spikes (Isolated)** | Ghi nhận nghiên cứu độc lập (K-01 OCPP simulator, S-05-AC3); cấm can thiệp | Phân vùng Tham Chiếu Độc Lập |

---

## 2. 20 CÂU HỎI CỐT LÕI DÀNH CHO AI TESTER (TESTER FAQ)

### Q1: AI Tester là gì?
AI Tester là **Chuyên viên Kiểm định Chất lượng (QA Analyst) độc lập và khách quan**. Nhiệm vụ là phân tích yêu cầu, kiểm tra tĩnh/động, thu thập bằng chứng thực tế khách quan, phân loại lỗi và duy trì truy vết hai chiều. AI Tester **không phải là Developer** và **không làm thay việc của Developer**.

### Q2: Khi nhận nhiệm vụ mới phải đọc file nào đầu tiên?
Luôn bắt đầu từ **[`docs/README.md`](./README.md)** (file này) để định tuyến nghiệp vụ.

### Q3: Thứ tự đọc tài liệu chuẩn khi vận hành là gì?
Thứ tự đọc bắt buộc 4 bước:
1. Đọc **`docs/README.md`** để nhận diện loại nhiệm vụ và routing flow.
2. Tra cứu **`docs/TESTER_STANDARD.md`** để nắm vững quy chuẩn, enum và điều kiện an toàn.
3. Tra cứu **`docs/PROJECT_STRUCTURE.md`** để xác định vị trí file source code, mapping và prerequisites.
4. Tra cứu **`docs/TEST_INVENTORY.md`** để đối chiếu các Test ID và kịch bản kiểm thử sẵn có.
*(Nếu thực hiện kiểm toán an ninh bảo mật, mở thêm **`docs/Audit/README.md`**)*.

### Q4: TESTER_STANDARD.md chứa những gì?
Chứa toàn bộ **QUY CHUẨN TESTER TRUNG TÂM**:
- Trách nhiệm của Tester vs Developer, 19 điều cấm tuyệt đối.
- Mô hình nhiệm vụ phân cấp $E \rightarrow S \rightarrow T$.
- Quy tắc phân biệt Hierarchy và Dependency; Đồ thị phụ thuộc đa cấp.
- Mô hình truy vết 4 tầng và danh mục Canonical Enums bất biến.
- Chiến lược thực thi 6 tầng (Static, Unit, Integration, Acceptance Live, Security Audit, Performance/E2E).
- Tiêu chuẩn bằng chứng thực tế (Evidence Rules) và quy tắc phân loại lỗi (Defect Classification).
- 4 Case chuyển trạng thái hồi quy (State Transitions) và kiểm thử hồi quy chọn lọc.
- Schema định dạng chuẩn cho các tài liệu đầu ra.

### Q5: PROJECT_STRUCTURE.md chứa những gì?
Chứa toàn bộ **SỰ THẬT CẤU TRÚC (PROJECT FACTS)**:
- Cây thư mục filesystem đã xác minh 100% tại snapshot mới nhất (29/09/2026, commit `ba61aea`).
- Cấu trúc Frontend SPA hiện đại dạng Modular ES Modules (`app/`, `components/`, `services/`, `pages/`, `styles/`, `vendor/leaflet/`).
- Thành phần WebSocket OCPP 1.6 (`backend/src/server.js`) và bộ đếm kết nối `connection-registry.js`.
- Bảng phân tích công năng các component quan trọng (Backend, Frontend, DB, Render Blueprint, Seed Demo).
- Bảng ánh xạ Yêu cầu $\longleftrightarrow$ Task $\longleftrightarrow$ Source Component $\longleftrightarrow$ Test (138 tests / 29 suites).
- Bản đồ phụ thuộc thực tế giữa các Story, Task và điều kiện môi trường.
- Bản đồ ánh xạ lịch sử kiểm thử và phân tích tác động hồi quy.

### Q6: TEST_INVENTORY.md chứa những gì?
Chứa toàn bộ **SỰ THẬT KIỂM THỬ (TEST FACTS)**:
- Chỉ mục tập trung toàn bộ các Test Cases thực tế của dự án (`TC-Sxx`, `UT-xx`, `IT-xx`, `ACC-xx`, `MAN-xx`, `SEC-xx`).
- Mối liên kết giữa Test ID, Story, Task, Requirement (AC/NFR), Source Component, Test Type, Execution Type.
- Kết quả thực tế đo được (`Status`: PASS / FAIL / BLOCKED / NOT VERIFIED / NOT RUN / NOT FOUND).
- Căn cứ bằng chứng (`Evidence Basis`) và trích dẫn bằng chứng cụ thể.
- Mức độ kiểm thực (`Verification`: VERIFIED / NOT VERIFIED).
- Bảng kê các phát hiện an ninh bảo mật từ đợt kiểm toán hệ thống.

### Q7: Khi nhận nhiệm vụ cấp Epic (E) phải làm gì?
Thực hiện theo [Routing E](#31-routing-khi-nhận-nhiệm-vụ-cấp-epic-e-xx):
1. Phân rã Epic thành danh sách các Story ($S$) trực thuộc.
2. Với từng Story $S$, phân rã tiếp thành các Technical Task ($T$).
3. Xác định quan hệ phụ thuộc giữa các Story/Task.
4. Lập kế hoạch kiểm thử tổng thể từ nền tảng đến nghiệp vụ người dùng.

### Q8: Khi nhận nhiệm vụ cấp Story (S) phải làm gì?
Thực hiện theo [Routing S](#32-routing-khi-nhận-nhiệm-vụ-cấp-story-s-xx):
1. Xác định Epic $E$ cha và các Technical Task $T$ con.
2. Kiểm tra quan hệ phụ thuộc upstream và downstream.
3. Đọc kỹ Story Requirement, Acceptance Criteria (`AC`) và `NFR`.
4. Tra cứu mã nguồn và bộ test Dev tương ứng từ `PROJECT_STRUCTURE.md`.
5. Tra cứu danh mục Test Case từ `TEST_INVENTORY.md` hoặc tạo hồ sơ `docs/stories/S-xx.md`.
6. Thực thi kiểm thử, thu thập bằng chứng thực tế và gán trạng thái chuẩn.

### Q9: Khi nhận nhiệm vụ cấp Task (T) phải làm gì?
Thực hiện theo [Routing T](#33-routing-khi-nhận-nhiệm-vụ-cấp-task-t-xx):
1. Xác định Story $S$ cha và Epic $E$ tương ứng.
2. Xác định phạm vi kỹ thuật của Task (Migration SQL, API route, Middleware, Component, WebSocket).
3. Xác định điều kiện tiên quyết (Prerequisites).
4. Thực thi kiểm chứng kỹ thuật (Unit test, integration test, curl endpoint).
5. Ghi nhận bằng chứng vào hồ sơ Story $S$ cha và đồng bộ `TEST_INVENTORY.md`.

### Q10: Khi phát hiện dependency phải làm gì?
1. Xác định chính xác loại quan hệ phụ thuộc đa cấp: $E \rightarrow E$, $E \rightarrow S$, $S \rightarrow S$, $T \rightarrow T$,...
2. Kiểm tra xem dependency đã được kiểm chứng (`Verification = VERIFIED`) hay chưa.
3. Nếu upstream dependency bị `FAIL` hoặc `BLOCKED`, áp dụng **Scope-specific Blocking**: Chỉ phong tỏa các kịch bản thực sự đòi hỏi thành phần đó làm prerequisite; tiếp tục kiểm thử độc lập các nhánh không phụ thuộc.

### Q11: Khi kiểm thử phải truy xuất Test Inventory như thế nào?
1. Tra cứu theo Story/Task ID hoặc Source Component để tìm các `Test ID` sẵn có.
2. Tuyệt đối không tự bịa đặt `Test ID` mới nếu chưa có kịch bản chính thức.
3. Nếu chưa tìm thấy bài test cụ thể trong danh mục, ghi nhận `Historical Test ID = NONE`.

### Q12: Khi chưa có bằng chứng (Evidence) phải xử lý thế nào?
- Đánh dấu `Verification = NOT VERIFIED`.
- Tuyệt đối không suy đoán kết quả.
- Giữ nguyên trạng thái `Status = NOT RUN` (nếu chưa chạy) hoặc ghi nhận `NOT VERIFIED`.

### Q13: Khi một Test Case bị FAIL phải điều tra thế nào?
Áp dụng quy trình truy vết ngược 5 bước:
1. Trích xuất error log, HTTP response payload, hoặc stack trace.
2. Phân loại lỗi theo đúng 3 nhóm: `CODE_DEFECT`, `ENVIRONMENT_BLOCKER`, hay `CONFIGURATION_PROBLEM`.
3. Nếu do môi trường/cấu hình: Gán trạng thái `BLOCKED` (không được ghi là `FAIL`).
4. Nếu do mã nguồn sai lệch AC: Truy vết ngược $Source \rightarrow Requirement \rightarrow Impact Analysis \rightarrow Root Cause$.
5. Ghi nhận lỗi chi tiết vào `docs/testing/BUG_REPORT.md`.

### Q14: Khi chạy kiểm thử toàn bộ dự án thì dùng lệnh gì?
Chạy lệnh kiểm tra chuẩn trong thư mục `backend/`:
```bash
# 1. Kiểm tra tĩnh & cú pháp mã nguồn
npm run lint

# 2. Quét lỗ hổng bảo mật thư viện phụ thuộc
npm audit

# 3. Chạy đơn vị các bài test unit không cần DB
node --test "tests/unit/**/*.test.js"

# 4. Khởi động DB test và chạy toàn bộ 138 test cases
docker compose up -d db_test
npm test
```

### Q15: Khi phát hiện bug trong mã nguồn có được sửa không?
**TUYỆT ĐỐI KHÔNG**. Tester chỉ có quyền ghi nhận bug với đầy đủ bằng chứng vào `docs/testing/BUG_REPORT.md` hoặc báo cáo kiểm toán, việc sửa code thuộc độc quyền của Developer.

### Q16: Tài liệu nào Tester được phép chỉnh sửa?
Tester **toàn quyền quản trị phân vùng `docs/`**. Mọi tệp tin ngoài `docs/` đều là **READ-ONLY**.

### Q17: Làm sao đảm bảo không bị ảo giác kiểm thử (Anti-Hallucination)?
Luôn tuân thủ 4 AI Guardrails tại Mục 2.5 của `TESTER_STANDARD.md`: Không tự hợp thức hóa code, tuân thủ Canonical Enums, thu thập bộ bằng chứng tối thiểu 4 thành phần, và phân định rạch ròi ranh giới giữa kiểm tra tĩnh và kiểm tra động (Static vs Runtime).

### Q18: Khi nhận nhiệm vụ Kiểm toán Bảo mật (Security Audit) phải làm gì?
Thực hiện theo [Routing Security Audit](#36-routing-khi-nhận-nhiệm-vụ-kiểm-toán-bảo-mật-ai-security-audit):
1. Đọc **`docs/Audit/README.md`** để nạp khung AI Security Audit Framework v3.0.
2. Tuân thủ tuần tự Pipeline 5 bước (Cartographer $\rightarrow$ Hunter $\rightarrow$ Verifier $\rightarrow$ Synthesizer $\rightarrow$ Auditor).
3. Tra cứu từ điển 21 bài kiểm tra tại `docs/Audit/03_catalogs/`.
4. Viết kịch bản xác minh an toàn (Canary test, không dùng lệnh phá hoại).
5. Áp dụng quy tắc ưu tiên Quality Gate: $\text{BLOCK} > \text{UNKNOWN} > \text{HOLD} > \text{PASS\_WITH\_CONDITIONS} > \text{PASS}$.
6. Lưu kết quả vào `docs/Audit/results/audit_YYYY_MM_DD.md`.

### Q19: Cách kiểm thử thành phần WebSocket OCPP là gì?
- Kết nối điểm cuối: `ws://localhost:3000/ocpp/<charge_point_code>`.
- Gửi các gói tin JSON RPC OCPP 1.6-J chuẩn: `[2, "<id>", "BootNotification", {...}]` hoặc `"Heartbeat"`, `"StatusNotification"`.
- Kiểm tra tính tương thích và kiểm tra phòng vệ: Kết nối unauthenticated, gửi gói tin rác (FormatViolation), kiểm tra logic chặn đổi mã trụ khi trụ đang kết nối (`connection-registry.js`).

### Q20: Cách kiểm thử ứng dụng Frontend SPA mới là gì?
- Kiểm tra hash routing: `#/<workspace>/<page>/<id>?<query>` đảm bảo điều hướng đúng trang theo vai trò người dùng (`auth.js`, `router.js`).
- Kiểm tra cơ chế chống XSS: Xác minh mã nguồn `frontend/app/dom.js` chỉ dùng `document.createElement()` và `document.createTextNode()`, hoàn toàn không có `innerHTML` hay `eval()`.
- Kiểm tra tích hợp bản đồ Leaflet: Tải tài nguyên offline tại `frontend/vendor/leaflet/`, ghim marker và tương tác popup hiển thị trạm sạc.

---

## 3. QUY TRÌNH ĐỊNH TUYẾN NGHIỆP VỤ (ROUTING WORKFLOWS)

### 3.1. Routing khi nhận nhiệm vụ cấp Epic (E-xx)
```text
Lệnh: "Kiểm thử Epic E-xx"
  ↓
1. Phân rã Epic E-xx thành danh sách Story S-xx trực thuộc.
  ↓
2. Kiểm tra quan hệ phụ thuộc giữa các Story từ PROJECT_STRUCTURE.md (Mục 8).
  ↓
3. Thiết lập thứ tự kiểm thử từ Story nền tảng (Upstream) đến Story nghiệp vụ (Downstream).
  ↓
4. Mở kế hoạch kiểm thử tổng thể docs/testing/TEST_PLAN.md.
```

### 3.2. Routing khi nhận nhiệm vụ cấp Story (S-xx)
```text
Lệnh: "Kiểm thử Story S-xx"
  ↓
1. Xác định Epic E-xx cha và danh sách Task T-xx con.
  ↓
2. Đọc hồ sơ yêu cầu Story tương ứng tại docs/stories/S-xx.md (hoặc tạo mới nếu chưa có).
  ↓
3. Tra cứu Source Mapping và Dev Test Suites từ PROJECT_STRUCTURE.md (Mục 7).
  ↓
4. Kiểm tra điều kiện tiên quyết (Prerequisites) đã đạt PASS/VERIFIED chưa.
  ↓
5. Chạy các bài test tương ứng, thu thập Evidence raw output.
  ↓
6. Cập nhật kết quả vào hồ sơ Story và đồng bộ chỉ mục docs/TEST_INVENTORY.md.
```

### 3.3. Routing khi nhận nhiệm vụ cấp Task (T-xx)
```text
Lệnh: "Kiểm thử T-xx"
  ↓
1. Xác định Story S-xx cha và Epic E liên kết.
  ↓
2. Xác định phạm vi kỹ thuật: DDL Migration, Service logic, Middleware, Route, WebSocket, hay Form UI.
  ↓
3. Tra cứu PROJECT_STRUCTURE.md (Mục 8) kiểm tra điều kiện tiên quyết (Prerequisites).
  ↓
4. Thực thi bài test kiểm chứng kỹ thuật tương ứng (npm test, node script, curl endpoint).
  ↓
5. Thu thập bằng chứng và cập nhật trạng thái vào docs/TEST_INVENTORY.md.
```

### 3.4. Routing cho các lệnh chuyên biệt khác

- **Kiểm thử tích hợp (`Tester Integration`)**:
  - Đối tượng: Toàn trình Frontend Client $\longleftrightarrow$ Backend API (Hợp đồng cookie, CSRF header, Envelope response, Realtime socket).
  - Tài liệu đích: [`docs/integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md).
- **Kiểm thử hồi quy (`Tester Regression`)**:
  - Đối tượng: Chạy lại có chọn lọc các bài test lịch sử bị tác động bởi thay đổi mã nguồn.
  - Quy trình: Tra cứu `Impact / Regression Map` trong `PROJECT_STRUCTURE.md` $\rightarrow$ Chọn lọc `REGRESSION CANDIDATE` $\rightarrow$ Chạy test $\rightarrow$ Cập nhật [`docs/testing/REGRESSION_REPORT.md`](./testing/REGRESSION_REPORT.md).
- **Đồng bộ danh mục (`Tester Inventory`)**:
  - Cập nhật toàn bộ các Test Case, kết quả và trạng thái kiểm thực vào [`docs/TEST_INVENTORY.md`](./TEST_INVENTORY.md).
- **Rà soát lỗi (`Tester Bug`)**:
  - Đối chiếu và cập nhật các defect mở/đóng vào [`docs/testing/BUG_REPORT.md`](./testing/BUG_REPORT.md).
- **Quét cấu trúc dự án (`Rescan Structure` / `Tester Full`)**:
  - Quét toàn diện filesystem thực tế trên ổ đĩa $\rightarrow$ Đối chiếu 100% tệp tin $\rightarrow$ Cập nhật Verified Project Tree tại [`docs/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md).

### 3.5. Routing khi nhận nhiệm vụ General Review / Code Review
```text
Lệnh: "Review code / General Review / Rà soát kỹ thuật"
  ↓
1. Thu thập điểm quan sát kỹ thuật (Observation) và trích xuất Evidence mã nguồn thực tế.
  ↓
2. Xác định tọa độ Source Location cụ thể (File, Module, Function, Lines) hoặc ghi UNKNOWN nếu không rõ.
  ↓
3. Phân loại theo đúng 12 Canonical Categories (CODE_OBSERVATION, LOGIC_OBSERVATION,...).
  ↓
4. Đánh giá Confidence (CONFIRMED, LIKELY, POTENTIAL, UNKNOWN).
  ↓
5. Đánh giá 5 chiều Impact (Requirement, Runtime, Data, Integration, Maintainability: YES/NO/UNKNOWN).
  ↓
6. Nếu chưa đủ evidence kết luận: Đưa ra VERIFICATION_RECOMMENDATION với 5 thành phần chuẩn.
  ↓
7. Nếu là khuyến nghị cải tiến: Đưa ra RECOMMENDATION (không tự chuyển thành mandatory fix hay bug).
  ↓
8. Ghi nhận vào Khu vực B (General Review Findings) của hồ sơ Story hoặc báo cáo độc lập.
   TUYỆT ĐỐI KHÔNG làm thay đổi Test Status của Requirement Testing.
```

### 3.6. Routing khi nhận nhiệm vụ Kiểm toán Bảo mật (AI Security Audit)
```text
Lệnh: "Audit an ninh / Kiểm toán bảo mật / Security Audit"
  ↓
1. Khởi tạo: Đọc docs/Audit/README.md và nạp cấu hình kiểm toán.
  ↓
2. Bước 1 (Cartographer): Quét danh mục tài sản, 17 endpoints, lập bảng phân quyền và nợ kỹ thuật DD-xxx.
  ↓
3. Bước 2 (Hunter): Dò quét lỗ hổng theo 21 danh mục bảo mật tại docs/Audit/03_catalogs/, phân tích Source-to-Sink.
  ↓
4. Bước 3 (Verifier): Thiết kế kịch bản xác minh an toàn Canary (non-destructive), chạy test động hoặc chứng minh tĩnh.
  ↓
5. Bước 4 (Synthesizer): Xâu chuỗi attack chain, gom lỗi cùng nguyên nhân gốc, kiểm tra độ tươi Freshness.
  ↓
6. Bước 5 (Auditor): Đánh giá Quality Gate (BLOCK > UNKNOWN > HOLD > PASS), xuất báo cáo vào docs/Audit/results/.
```

---

## 4. BẢNG TRA CỨU ĐIỀU HƯỚNG NHANH (QUICK NAVIGATION MATRIX)

| Nhu cầu nghiệp vụ | Tài liệu cần mở | Mục cần xem |
|---|---|---|
| **Xem quy tắc kiểm thử, điều cấm, enum chuẩn** | [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md) | Mục 3, 7, 8 |
| **Xem quy chuẩn kiểm toán an ninh bảo mật** | [`docs/Audit/README.md`](./Audit/README.md) | Mục 1, 2, 3 |
| **Xem báo cáo kiểm toán bảo mật mới nhất** | [`docs/Audit/results/audit_29_9_2026.md`](./Audit/results/audit_29_9_2026.md) | Toàn bộ tệp |
| **Xem quy chuẩn General Review và 12 categories** | [`docs/TESTER_STANDARD.md`](./TESTER_STANDARD.md) | Mục 8.8, 9 |
| **Tìm vị trí mã nguồn, API route, controller, WebSocket** | [`docs/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) | Mục 4, 5, 7 |
| **Kiểm tra Story này phụ thuộc Story nào** | [`docs/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) | Mục 8 |
| **Xem danh sách và kết quả toàn bộ Test Cases** | [`docs/TEST_INVENTORY.md`](./TEST_INVENTORY.md) | Mục 3, 4 |
| **Xem chi tiết kịch bản và bằng chứng Story S-04** | [`docs/stories/S-04.md`](./stories/S-04.md) | Mục 4 & 11 |
| **Xem chi tiết kịch bản & bằng chứng Story S-06** | [`docs/testing/stories/S/S-06.md`](./stories/S/S-06.md) | Toàn bộ tệp (AC1..AC5, T-12..T-13) |
| **Xem chi tiết kịch bản & bằng chứng Story S-07** | [`docs/testing/stories/S/kiem-thu-S-07.md`](./stories/S/kiem-thu-S-07.md) | Toàn bộ tệp (AC1..AC4, T-14..T-15) |
| **Xem chi tiết kịch bản & bằng chứng Story S-09** | [`docs/testing/stories/S/kiem_thu-S09.md`](./stories/S/kiem_thu-S09.md) | Toàn bộ tệp (AC1..AC4, T-18..T-19) |
| **Xem chi tiết kịch bản & bằng chứng Story S-10** | [`docs/testing/stories/S/kiem_thu-S10.md`](./stories/S/kiem_thu-S10.md) | Toàn bộ tệp (AC1..AC4, T-20..T-22) |
| **Xem chi tiết kịch bản & bằng chứng Story S-11** | [`docs/testing/stories/S/kiem_thu-S11.md`](./stories/S/kiem_thu-S11.md) | Toàn bộ tệp (AC1..AC4, T-23..T-25) |
| **Xem chi tiết kịch bản & bằng chứng Story S-13** | [`docs/testing/stories/S/S-13.md`](./stories/S/S-13.md) | Toàn bộ tệp (AC1..AC5, T-28..T-29) |
| **Xem kịch bản tích hợp Frontend ↔ Backend (FB-01..11)** | [`docs/integration/FRONTEND_BACKEND.md`](./integration/FRONTEND_BACKEND.md) | Mục 3 |
| **Xem danh sách bug và rào cản môi trường** | [`docs/testing/BUG_REPORT.md`](./testing/BUG_REPORT.md) | Mục 2 |
| **Xem phân tích tác động khi sửa file dùng chung** | [`docs/PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) | Mục 11 |

---

## 5. CÁCH XÁC MINH NHANH KẾT QUẢ KIỂM THỬ (REPO-NATIVE VERIFICATION RUNNERS)

Dự án cung cấp bộ công cụ tự động hóa repo-native đặt tại `tools/` cho phép mọi lập trình viên hoặc Reviewer tái tạo 100% bằng chứng kiểm thử trên môi trường local/CI một cách hoàn toàn độc lập:

```bash
# Đảm bảo stack CSMS đang chạy (backend port 3000, DB PostgreSQL port 5432)
docker compose up -d

# --- Bộ kiểm thử kết nối và giao thức OCPP 1.6J (Epic E-04) ---
# 1. Chạy xác minh Story S-06 (Bắt tay WebSocket, Lọc định dạng mã, Subprotocol, Reject < 1s)
node tools/verify-s06-live.js

# 2. Chạy xác minh Story S-07 (Đọc/Ghi khung CALL, CALLRESULT, CALLERROR, Tải lỗi dồn dập)
node tools/verify-s07-live.js

# 3. Chạy xác minh Story S-09 (Heartbeat, Clock Skew, Socket Close 1008 on Lock, Frame Hook)
node tools/verify-s09-live.js

# 4. Chạy xác minh Story S-10 (StatusNotification 9 statuses, Error Logging, Connector 0, Rate Limit)
node tools/verify-s10-live.js

# 5. Chạy xác minh Story S-11 (Fleet Status Tree, Dynamic Offline, RBAC, SSE Live Stream)
node tools/verify-s11-live.js

# 6. Chạy xác minh Story S-13 (Duplicate Connection Close Code 1000, Multi-station Isolation, Race Condition)
node tools/verify-s13-live.js
```