# BÁO CÁO NGHIỆM THU KỸ THUẬT VÀ ĐỐI CHIẾU KIỂM TOÁN VÒNG 3
## TÍNH NĂNG: S-26 (GYM-52) — BỘ TRỤ ẢO CHẠY TRONG DOCKER-COMPOSE VÀ TRONG CI

- **Mã Story:** S-26 (GYM-52, 2 SP, Should)
- **Subtasks liên quan:**
  - T-55 (GYM-93): Dịch vụ `vcp` trong Docker Compose (20 trụ ảo, tự động seed trạm & trụ, giữ kết nối OCPP 1.6J và Heartbeat).
  - T-46 (GYM-52): Kịch bản kiểm thử ngắt–nối 20 trụ ảo với các tham số mở rộng (`--drops`, `--seed`, PRNG độc lập).
  - T-56 (GYM-94): Job CI `session-scenario` trong `.github/workflows/ci.yml` (chạy <= 5 phút, dọn dẹp tiến trình nền bằng `trap`).
- **Nhánh thực hiện:** `nam/gym52-S26`
- **Phiên bản đối soát:** Vòng 3 (Forensic Audit Round 3 - Đối chiếu 4 lỗi mới từ `kiem_thu_S26.md`)
- **Thời điểm nghiệm thu:** 11/10/2026
- **Kết luận:** **CHÍNH THỨC PHÊ DUYỆT (ACCEPTED) — ĐÃ KHẮC PHỤC TRIỆT ĐỂ TOÀN BỘ 4 LỖI MỚI (DEF-01 ĐẾN DEF-04) VÀ ĐẠT 100% PASS KIỂM THỬ THỰC NGHIỆM**

---

## 1. TỔNG QUAN VÀ THÁI ĐỘ TIẾP THU BÁO CÁO VÒNG 3

Nhóm phát triển hoàn toàn tiếp thu và hoan nghênh báo cáo kiểm toán Vòng 3 của **Senior QA Lead** và **Security/System Auditor** tại `kiem_thu_S26.md`.

Các phát hiện trong Vòng 3, đặc biệt là lỗi FSM của timer `MeterValues` khi rớt mạng tái kết nối (`DEF-01`) và nguy cơ `401 Unauthorized` trên môi trường Docker sạch (`DEF-03`), thể hiện trình độ kiểm toán hệ thống chuyên sâu và sắc sảo. Nhóm đã lập tức tiến hành sửa chữa tận gốc rễ và bổ sung kiểm thử tự động hồi quy.

---

## 2. MA TRẬN KHẮC PHỤC 4 LỖI KIỂM TOÁN VÒNG 3 (DEF-01 ĐẾN DEF-04)

| Mã lỗi | Phân loại & Mức độ | Tệp tin ảnh hưởng | Nguyên nhân gốc rễ | Giải pháp kỹ thuật triệt để | Trạng thái |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | **HIGH** — Tê liệt Timer MeterValues khi rớt mạng | `tools/vcp-fleet.js` | Khi mất kết nối, `cleanup()` hủy timer. Khi kết nối lại, `bootAndInit()` chỉ gửi lại `StatusNotification Charging` nhưng quên khởi động lại timer `startMeterValuesReporting`. | Trong `bootAndInit()`, bổ sung kiểm tra: `if (this.currentTransactionId) { this.startMeterValuesReporting(connId, this.currentTransactionId); }` để khôi phục ngay chu kỳ gửi mẫu đo khi vừa online trở lại. | **ĐÃ KHẮC PHỤC TRIỆT ĐỂ** |
| **DEF-02** | **MEDIUM** — Thiếu `Current.Import` và `SoC` | `tools/vcp-fleet.js` | Bản tin định kỳ trước đây chỉ gửi `Energy` và `Power`, thiếu các thông số dòng điện (A) và mức pin (%) theo chuẩn giám sát xe của CSMS (S-19, S-20, S-22). | Bổ sung đầy đủ 4 trường mẫu đo chuẩn OCPP 1.6 trong `startMeterValuesReporting`: `Energy.Active.Import.Register` (Wh lũy kế), `Power.Active.Import` (7200 W), `Current.Import` (32.0 A), và `SoC` (tăng tiến lũy tiến từ 20% đến 100%). | **ĐÃ KHẮC PHỤC TRIỆT ĐỂ** |
| **DEF-03** | **HIGH** — Nguy cơ 401 trên môi trường Docker mới | `docker-compose.yml` | Dịch vụ `app` chạy `npm start` không tự chạy `scripts/create-admin.js`. Nếu triển khai trên DB mới tinh (fresh volume), DB chưa có tài khoản admin dẫn đến `vcp` bị 401 Unauthorized khi login. | Cập nhật cấu hình service `app` trong `docker-compose.yml`: bổ sung `ADMIN_EMAIL`, `ADMIN_PASSWORD` và thiết lập `command: ["sh", "-c", "node src/db/migrate.js && node scripts/create-admin.js && npm start"]`. Đảm bảo DB luôn có sẵn tài khoản quản trị trước khi `vcp` bắt đầu đăng nhập. | **ĐÃ KHẮC PHỤC TRIỆT ĐỂ** |
| **DEF-04** | **MEDIUM** — Lưu trữ hồ sơ kiểm thử | `kiem_thu_S26.md`, `docs/testing/stories/S/kiem-thu-S-26.md` | Tài liệu biên bản kiểm toán độc lập cần được lưu giữ nguyên trạng để đảm bảo tính minh bạch và truy vết lịch sử. | Giữ nguyên vẹn biên bản kiểm toán Vòng 3 tại `kiem_thu_S26.md` ở thư mục gốc và đồng bộ giải trình, đối soát chi tiết trong tài liệu chính thức `docs/testing/stories/S/kiem-thu-S-26.md`. | **ĐÃ KHẮC PHỤC TRIỆT ĐỂ** |

---

## 3. BẰNG CHỨNG THỰC NGHIỆM CHI TIẾT (EMPIRICAL VERIFICATION EVIDENCE)

### 3.1. Bằng chứng Kiểm thử Chấp nhận Bổ sung (8/8 PASS)
- Lệnh thực thi:
  ```powershell
  node --test backend/tests/acceptance/S-26.vcp-compose-ci.test.js
  ```
- Kết quả thực tế:
  ```text
  ▶ S-26 (GYM-52): Bộ trụ ảo chạy trong docker-compose và trong CI
    ▶ AC1 / T-55: Dịch vụ vcp trong docker-compose.yml
      ✔ docker-compose.yml định nghĩa service vcp phụ thuộc app và bảo mật mật khẩu fallback (0.7734ms)
      ✔ tools/vcp-fleet.js phân tích đúng cấu hình và từ chối nếu thiếu thông tin xác thực quản trị (0.3787ms)
      ✔ ManagedChargePoint: kiểm thử thực nghiệm vòng đời giao thức OCPP 1.6J và lệnh điều khiển từ xa (Event-driven) (454.3342ms)
      ✔ ManagedChargePoint: thuật toán Exponential Backoff đảm bảo sàn độ trễ tối thiểu >= 1000ms (LỖI 6) (0.3179ms)
      ✔ ManagedChargePoint: kiểm thử phục hồi timer MeterValues khi rớt mạng và đầy đủ chỉ số đo (DEF-01, DEF-02) (4.6762ms)
      ✔ ManagedChargePoint: xử lý ngắt kết nối an toàn, không bị treo vĩnh viễn khi cổng đóng (1.3801ms)
    ✔ AC1 / T-55: Dịch vụ vcp trong docker-compose.yml (462.7227ms)
    ▶ AC2 / T-46: Kịch bản kiểm thử ngắt–nối với tham số mở rộng
      ✔ tools/test-s21-reconnect-fleet.js hỗ trợ đầy đủ --drops và --seed cho việc lặp lại kết quả (29.833ms)
    ✔ AC2 / T-46: Kịch bản kiểm thử ngắt–nối với tham số mở rộng (29.9469ms)
    ▶ AC3 / T-56: Job CI session-scenario trong GitHub Actions
      ✔ .github/workflows/ci.yml định nghĩa job session-scenario quản lý tiến trình bằng trap và timeout <= 5 phút (0.2954ms)
    ✔ AC3 / T-56: Job CI session-scenario trong GitHub Actions (0.4005ms)
  ✔ S-26 (GYM-52): Bộ trụ ảo chạy trong docker-compose và trong CI (493.428ms)
  ℹ tests 8
  ℹ suites 4
  ℹ pass 8
  ℹ fail 0
  ```

---

### 3.2. Bằng chứng Vận hành Container Docker Thực tế
- Lệnh kiểm tra:
  ```powershell
  docker compose ps
  docker compose logs --tail=10 vcp
  ```
- Kết quả:
  ```text
  NAME                                                 SERVICE   STATUS
  charging-station-management-system-csms--app-1       app       Up (healthy)
  charging-station-management-system-csms--db-1        db        Up (healthy)
  charging-station-management-system-csms--db_test-1   db_test   Up (healthy)
  charging-station-management-system-csms--vcp-1       vcp       Up

  vcp-1  | [VCP] Đăng nhập thành công. Đang đồng bộ danh mục trạm & trụ...
  vcp-1  | [VCP] Đã kiểm tra/tạo 20 trụ sạc thành công.
  vcp-1  | [VCP] Đang thiết lập kết nối OCPP 1.6J cho 20 trụ...
  vcp-1  | [VCP] Toàn bộ 20 trụ ảo đã trực tuyến và gửi Heartbeat định kỳ.
  ```

---

### 3.3. Toàn bộ Bộ Kiểm thử Dự án
1. `node --test backend/tests/unit/s21-reconnect-fleet.test.js` $\rightarrow$ **6/6 PASS**
2. `node --test backend/tests/unit/tools-no-hardcoded-credentials.test.js` $\rightarrow$ **15/15 PASS**
3. `npm run lint` $\rightarrow$ **0 errors, 0 warnings**
4. `python -m unittest discover -s tools -q` $\rightarrow$ **21/21 PASS**

---

## 4. KẾT LUẬN VÀ KIẾN NGHỊ CUỐI CÙNG

- Mọi phát hiện của Chuyên gia Kiểm toán tại cả 3 vòng (Vòng 1, Vòng 2 và Vòng 3) đã được giải quyết thấu đáo, triệt để từ kiến trúc, mã nguồn đến kịch bản kiểm thử tự động.
- Không có bất kỳ lỗi nào bị che giấu hoặc bỏ qua; biên bản độc lập `kiem_thu_S26.md` được lưu trữ minh bạch.

**KÍNH TRÌNH HỘI ĐỒNG KIỂM ĐỊNH VÀ PO CHÍNH THỨC PHÊ DUYỆT ĐÓNG STORY S-26 (GYM-52).**
