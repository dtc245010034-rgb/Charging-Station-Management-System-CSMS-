# AI Security Audit Framework v3.0

> **Deterministic, Evidence-First Security Assurance System for AI & Humans**  
> Khung tiêu chuẩn bảo mật module hóa hoàn chỉnh, độc lập và tự vận hành.

---

## 1. Tổng quan kiến trúc (Modular Architecture)

Hệ thống được thiết kế dạng **Pipeline 5 bước (SOP)** để AI có thể thực hiện kiểm toán mã nguồn một cách tuần tự, chính xác, không bị quá tải context và triệt tiêu hoàn toàn hiện tượng ảo giác (hallucination).

```text
f:/Audit/
├── README.md                      # NHẠC TRƯỞNG: Hướng dẫn AI chạy từng bước
│
├── 01_standards/                  # BỘ TIÊU CHUẨN & NGUYÊN TẮC BẮT BUỘC
│   ├── principles_and_safety.md   # 15 nguyên tắc chuẩn (P1-P15), Rules of engagement, Xử lý secret
│   ├── state_machine_enums.md     # Tuple trạng thái (C, R, V, F), Enums chính tắc, Quy tắc chuyển đổi
│   ├── evidence_ladder.md         # Thang bậc bằng chứng (Evidence Ladder), Quy tắc thăng cấp Certainty
│   ├── data_schemas.md            # Schema Finding, Schema Evidence, Quy tắc Parent-Child
│   └── profiles_and_governance.md # Phân quyền Profile A/B/C, Ranh giới AI không được tự duyệt
│
├── 02_runbook/                    # QUY TRÌNH THỰC THI TỪNG BƯỚC (AI nạp từng file theo bước)
│   ├── step1_inventory_and_scope.md  # Bước 1: Quét tài sản, endpoints, data flows
│   ├── step2_discovery_and_taint.md  # Bước 2: Dò tìm lỗ hổng, phân tích Source-to-Sink
│   ├── step3_verification_and_poc.md # Bước 3: Xác minh an toàn, viết PoC canary, negative test
│   ├── step4_correlation_and_state.md# Bước 4: Hợp nhất finding, attack chain, kiểm tra độ tươi
│   └── step5_quality_gate.md         # Bước 5: Đánh giá Quality Gate, xuất báo cáo cuối cùng
│
├── 03_catalogs/                   # TỪ ĐIỂN BÀI KIỂM TRA (AI tra cứu theo danh mục khi chạy Bước 2)
│   ├── 00_overview.md             # Hướng dẫn chung và quy tắc Source-to-Sink
│   ├── 01_auth_session_tenancy.md # AuthN, AuthZ, IDOR, Session, OAuth, Multi-tenancy
│   ├── 02_injection_data_handling.md # SQLi, Command Injection, SSRF, File, Deserialization, XSS, CORS
│   ├── 03_crypto_and_secrets.md   # Mật mã học, Lộ secret/API key trong code
│   ├── 04_logic_race_logging.md   # Business logic, Race condition (TOCTOU), Ghi log lộ PII
│   ├── 05_deps_supply_cicd_iac.md # Thư viện bên thứ 3 (SCA), Chuỗi cung ứng, Docker, CI/CD
│   └── 06_api_and_llm.md          # Bảo mật API, Prompt Injection, Rủi ro hệ thống AI/LLM
│
├── 04_templates/                  # TEMPLATES DỮ LIỆU ĐẦU VÀO VÀ ĐẦU RA
│   ├── audit_config.example.yaml  # File cấu hình phạm vi audit cho dự án mục tiêu
│   ├── inventory_artifact.json    # Mẫu JSON kết quả quét tài sản (Đầu ra Bước 1)
│   ├── finding_artifact.json      # Mẫu JSON chuẩn cho từng finding
│   └── audit_report_template.md   # Mẫu báo cáo kiểm toán Markdown hoàn chỉnh (Đầu ra Bước 5)
│
└── 05_references/                 # TÀI LIỆU THAM CHIẾU & MẪU ĐỐI SOÁT
    ├── severity_rubric.md         # Ma trận định mức mức độ nghiêm trọng (CVSS)
    ├── worked_example.md          # Ví dụ thực tế mẫu cho 1 finding đạt chuẩn
    ├── failure_codes_registry.md  # Mã lỗi chẩn đoán khi vi phạm quy chuẩn
    └── requirement_id_registry.md # Bảng đăng ký mã yêu cầu (Traceability Matrix)
```

---

## 2. Hướng dẫn AI thực hiện cuộc kiểm toán (Master AI Runbook)

Khi người dùng yêu cầu kiểm toán một repository hoặc thư mục mã nguồn, **AI BẮT BUỘC** phải tuân thủ đúng quy trình 5 bước sau đây:

### Bước 1: Khởi tạo phạm vi & Lập danh mục tài sản (Cartographer)
1. Đọc hướng dẫn: [step1_inventory_and_scope.md](file:///f:/Audit/02_runbook/step1_inventory_and_scope.md).
2. Quét cấu trúc repository, file cấu hình, route, file manifests (`package.json`, `requirements.txt`,...).
3. Phân loại endpoints (Public vs Protected), actors, và luồng dữ liệu nhạy cảm.
4. Bất kỳ thành phần nào không thể phân tích tĩnh được phải ghi nhận vào danh sách **Discovery Debt** (`DD-xxx`).
5. Xuất artifact: `inventory.json` theo mẫu [inventory_artifact.json](file:///f:/Audit/04_templates/inventory_artifact.json).

### Bước 2: Dò quét lỗ hổng & Phân tích Source-to-Sink (Hunter)
1. Đọc hướng dẫn: [step2_discovery_and_taint.md](file:///f:/Audit/02_runbook/step2_discovery_and_taint.md).
2. Tra cứu từng chuyên đề bảo mật liên quan trong thư mục [03_catalogs/](file:///f:/Audit/03_catalogs/00_overview.md).
3. Lần theo luồng dữ liệu từ nguồn nhập của người dùng (**Source**) đến điểm thực thi nguy hiểm (**Sink**).
4. Kiểm tra các cơ chế lọc, escaping hoặc middleware bảo vệ (**Compensating Controls - Nguyên tắc P9**).
5. Ghi nhận các phát hiện ban đầu ở mức Certainty `DISCOVERED` hoặc `SUPPORTED`.

### Bước 3: Xác minh an toàn & Viết PoC Canary (Verifier)
1. Đọc hướng dẫn: [step3_verification_and_poc.md](file:///f:/Audit/02_runbook/step3_verification_and_poc.md).
2. Tuyệt đối tuân thủ nguyên tắc an toàn: Không chạy thử nghiệm phá hoại (`DROP TABLE`, `rm -rf`), chỉ dùng chuỗi canary lành tính (`CANARY_1337`).
3. Thực hiện kiểm thử động (local test) hoặc chứng minh tĩnh tất định để nâng Certainty lên `CONFIRMED`.
4. Mỗi bài test thành công phải đi kèm một **Negative Test** (kiểm tra với dữ liệu hợp lệ) để loại trừ kết quả sai.

### Bước 4: Hợp nhất, Attack Chain & Kiểm tra độ tươi (Synthesizer)
1. Đọc hướng dẫn: [step4_correlation_and_state.md](file:///f:/Audit/02_runbook/step4_correlation_and_state.md).
2. Gom các lỗi có cùng nguyên nhân gốc (ví dụ: thiếu CSRF ở 10 endpoint gom về 1 finding cha với 10 `affected_locations`).
3. Xâu chuỗi các lỗi nhỏ thành kịch bản tấn công liên hoàn (Attack Chains).
4. Kiểm tra độ tươi (`freshness`) so với mã hash Git hiện tại.

### Bước 5: Đánh giá Quality Gate & Xuất báo cáo (Auditor)
1. Đọc hướng dẫn: [step5_quality_gate.md](file:///f:/Audit/02_runbook/step5_quality_gate.md).
2. Áp dụng quy tắc ưu tiên nghiêm ngặt:
   $$\text{BLOCK} > \text{UNKNOWN} > \text{HOLD} > \text{PASS\_WITH\_CONDITIONS} > \text{WAIVED} > \text{PASS}$$
3. Nhớ các nguyên tắc bất biến: `UNKNOWN != PASS`, `NOT_TESTED != SAFE`.
4. Xuất báo cáo `audit_report.md` theo mẫu [audit_report_template.md](file:///f:/Audit/04_templates/audit_report_template.md).

---

## 3. Ranh giới an toàn tối cao (AI Non-Negotiable Invariants)

1. **AI Không Được Tự Duyệt (Principle P15 & Section 19.4)**:
   AI có thể phát hiện, phân tích, viết PoC và đề xuất giải pháp, nhưng **KHÔNG ĐƯỢC PHÉP**:
   - Tự đóng lỗi là `FALSE_POSITIVE` hoặc `ACCEPTED_RISK` mà không có con người xác nhận.
   - Tự ký giấy miễn trừ (`WAIVED`).
   - Tự biến kết quả `BLOCK` thành `PASS` để bypass cổng phát hành.
2. **Tuyệt đối không để lộ Secret (Appendix B)**:
   Bất kỳ khóa API, mật khẩu, JWT secret tìm thấy trong mã nguồn phải được che giấu thành `[REDACTED]`. Không được in nguyên văn secret vào báo cáo.
3. **Không bịa đặt CVE (Section 14)**:
   Chỉ trích dẫn mã CVE / GHSA có thật từ cơ sở dữ liệu bảo mật chính thức.
