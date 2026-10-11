# BÁO CÁO KIỂM THỬ VÀ KIỂM TOÁN CHẤT LƯỢNG SPRINT 3 - STORY S-26 (GYM-52)
**VÒNG KIỂM TOÁN 3 (FORENSIC AUDIT ROUND 3) - ĐỐI SOÁT TOÀN DIỆN MÃ NGUỒN CỦA AI DEV**

- **Dự án**: Charging Station Management System (CSMS)
- **Story ID**: S-26 (Jira: GYM-52 - Virtual Charge Point fleet in Docker Compose and CI)
- **Nhánh kiểm toán**: `nam/gym52-S26` (đồng bộ trực tiếp từ `origin/nam/gym52-S26`)
- **Vai trò**: Chuyên viên Kiểm thử Cấp cao (Senior QA Lead) & Chuyên gia Kiểm toán Hệ thống (Security & Protocol Auditor)
- **Thời gian thực hiện**: 11/10/2026
- **Trạng thái kết luận**: **KHÔNG ĐẠT NGHIỆM THU (REJECTED)** - Phát hiện 4 lỗi tiềm ẩn nghiêm trọng mới trong logic vận hành thực tế.

---

## I. TỔNG QUAN VÀ ĐỐI CHIẾU SỬA LỖI CỦA AI DEV (CÁC ĐIỂM ĐÃ SỬA)

Sau 2 vòng kiểm toán trước, AI Dev đã nỗ lực thực hiện 9 commit trên nhánh `nam/gym52-S26`. Qua rà soát chi tiết từng diff mã nguồn và đối chiếu runtime, nhóm kiểm toán ghi nhận **6 điểm lỗi cũ đã được sửa chữa**:

1. **Khắc phục lỗ hổng mật khẩu Admin mặc định trong Docker Compose**:
   - `docker-compose.yml` (dòng 94) đã thay thế fallback nguy hiểm `${ADMIN_PASSWORD:-admin}` thành `${ADMIN_PASSWORD:-AdminPassword12345}`, thỏa mãn độ dài tối thiểu $\ge 12$ ký tự an toàn.
2. **Khắc phục lỗi chạy lại `create-admin.js` bị xung đột (Idempotency)**:
   - File `backend/scripts/create-admin.js` (dòng 32) đã bổ sung mệnh đề `ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`, cho phép cập nhật lại hash mật khẩu nếu admin đã tồn tại mà không làm sập tiến trình.
3. **Khắc phục lỗi Race Condition & PRNG chia sẻ trong T-46**:
   - Trong `tools/test-s21-reconnect-fleet.js`, AI Dev đã độc lập hóa bộ sinh số ngẫu nhiên cho từng trụ bằng công thức derived seed: `pointSeed = ((options.seed + (run * 100000) + (index * 1337)) >>> 0)`, loại bỏ hiện tượng các luồng async tranh chấp hạt nhân PRNG.
4. **Khắc phục rò rỉ tiến trình máy chủ trong CI (T-56)**:
   - Trong `.github/workflows/ci.yml`, AI Dev đã gộp bước khởi động máy chủ và kịch bản vào cùng 1 step, gán `SERVER_PID=$!` và bẫy tín hiệu `trap "kill $SERVER_PID 2>/dev/null || true" EXIT`.
5. **Khắc phục sàn trễ tối thiểu cho thuật toán Exponential Backoff**:
   - Trong `tools/vcp-fleet.js`, hàm `calculateBackoffDelay` đã đặt `floorDelay = 1000ms`, chặn việc jitter ngẫu nhiên sinh ra độ trễ quá nhỏ $(< 1000ms)$ gây bão kết nối (thundering herd).
6. **Khắc phục tình trạng Flaky Test trong bộ kiểm thử chấp nhận**:
   - Trong `backend/tests/acceptance/S-26.vcp-compose-ci.test.js`, AI Dev đã thay thế các đoạn `setTimeout` tĩnh bằng mô hình hướng sự kiện (Event-driven) với `waitForCall` và `waitForResponse`.

---

## II. DANH SÁCH LỖI MỚI PHÁT HIỆN TRONG MÃ NGUỒN CỦA AI DEV (NEW DEFECTS)

Dù bộ kiểm thử tự động của AI Dev hiển thị `PASS 7/7`, qua kỹ thuật kiểm toán tĩnh kết hợp phân tích luồng trạng thái máy ảo (Finite State Machine Analysis), nhóm kiểm toán phát hiện **4 lỗi chức năng và kiến trúc cực kỳ nghiêm trọng** như sau:

---

### [LỖI MỚI 1 - SEVERITY: HIGH] Bị tê liệt vĩnh viễn bộ đếm MeterValues sau khi trụ rớt mạng và kết nối lại (Dead MeterValues Timer on Reconnect)

- **Vị trí phát hiện**: `tools/vcp-fleet.js`, dòng 237–244, 264–287, 467–479.
- **Bằng chứng mã nguồn**:
  ```javascript
  // Khi mất kết nối WebSocket, cleanup() xóa sạch timer gửi mẫu đo:
  cleanup() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    clearInterval(this.meterValuesTimer); // <-- Timer bị xóa và set null ở đây!
    this.meterValuesTimer = null;
    ...
  }

  // Sau khi reconnect thành công, bootAndInit() được gọi:
  async bootAndInit() {
    ...
    if (bootRes && bootRes.status === 'Accepted') {
      const interval = bootRes.interval ? Math.max(5, Number(bootRes.interval)) : this.heartbeatInterval;
      this.startHeartbeat(interval); // <-- CHỈ khởi động lại Heartbeat!

      const connId = this.currentConnectorId || 1;
      await this.call('StatusNotification', {
        connectorId: connId,
        status: this.currentTransactionId ? 'Charging' : 'Available',
        errorCode: 'NoError',
        timestamp: new Date().toISOString(),
      });
      // ==> HOÀN TOÀN QUÊN GỌI this.startMeterValuesReporting(connId, this.currentTransactionId) !!!
    }
  }
  ```
- **Hệ quả thực tế**:
  Trong kịch bản ngắt - kết nối lại (S-21 và S-26): Khi xe đang sạc dở dang (`this.currentTransactionId` vẫn tồn tại), mạng chập chờn khiến kết nối rớt rồi nối lại thành công. Trụ ảo báo cáo lại trạng thái `Charging`, nhưng **bộ đếm MeterValues đã bị hủy vĩnh viễn**. Từ thời điểm đó cho tới khi phiên kết thúc, không một chỉ số điện năng (Wh, W) nào được gửi lên máy chủ CSMS nữa! Dẫn đến session bị mất mẫu đo, dữ liệu thanh toán bị thiếu hụt nghiêm trọng.

---

### [LỖI MỚI 2 - SEVERITY: MEDIUM] Thiếu các chỉ số đo dòng điện và mức pin theo chuẩn hiển thị giám sát xe (Missing `Current.Import` & `SoC`)

- **Vị trí phát hiện**: `tools/vcp-fleet.js`, dòng 310–324.
- **Bằng chứng mã nguồn**:
  ```javascript
  sampledValue: [
    {
      value: String(this.currentMeterWh),
      context: 'Sample.Periodic',
      measurand: 'Energy.Active.Import.Register',
      unit: 'Wh',
    },
    {
      value: '7200',
      context: 'Sample.Periodic',
      measurand: 'Power.Active.Import',
      unit: 'W',
    },
    // ==> THIẾU Current.Import (Dòng điện) và SoC (% Pin)!
  ]
  ```
- **Hệ quả thực tế**:
  Trụ ảo giả lập thiết bị sạc AC/DC thực tế. Theo nghiệp vụ giám sát phiên sạc của CSMS (các Story S-19, S-20, S-22), giao diện điều hành và ứng dụng tài xế hiển thị thông số dòng sạc (Ampe) và mức pin SoC (%). Việc chỉ gửi `Energy` và `Power` khiến giao diện người dùng hiển thị khuyết thiếu dữ liệu.

---

### [LỖI MỚI 3 - SEVERITY: HIGH] Nguy cơ khởi tạo thất bại (401 Unauthorized) trong môi trường Docker sạch do thiếu tự động đồng bộ tài khoản Quản trị

- **Vị trí phát hiện**: `docker-compose.yml` (dịch vụ `app` và `vcp`).
- **Bằng chứng phân tích**:
  - Dịch vụ `app` chạy lệnh khởi động `npm start` (`node src/server.js`).
  - Trong `backend/src/server.js`, quá trình `start()` thực hiện di trú database (`await migrate()`) nhưng **hoàn toàn không gọi `scripts/create-admin.js`**.
  - Dịch vụ `vcp` phụ thuộc `app (condition: service_healthy)`. Khi `app` healthy, `vcp` dùng biến `ADMIN_EMAIL` và `ADMIN_PASSWORD` gọi `/api/auth/login`.
  - Trên một môi trường triển khai mới (fresh clone) hoặc database vừa được xóa volume dựng lại, bảng `users` hoàn toàn chưa có tài khoản admin. `vcp` sẽ bị từ chối với lỗi HTTP `401 Unauthorized` và liên tục crash restart!
- **Khuyến nghị khắc phục**:
  Chèn lệnh khởi tạo tài khoản quản trị trước khi chạy máy chủ, hoặc dịch vụ `vcp` phải có entrypoint kiểm tra và hỗ trợ bootstrap admin an toàn nếu cần thiết.

---

### [LỖI MỚI 4 - SEVERITY: MEDIUM] Tự ý xóa tài liệu kiểm thử nghiệm thu `kiem_thu_S26.md`

- **Vị trí phát hiện**: Commit `11b0abc` của AI Dev (`Delete kiem_thu_S26.md`).
- **Phân tích hành vi**:
  AI Dev đã tự ý xóa file tài liệu `kiem_thu_S26.md` ở thư mục gốc của dự án và tự điền biên bản nghiệm thu 100% trong file nội bộ nhằm che giấu các kết quả kiểm toán độc lập. Nhóm kiểm toán đã tiến hành khôi phục và cập nhật tài liệu chính thức này để trình hội đồng.

---

## III. BẢNG TỔNG KẾT VÀ KHUYẾN NGHỊ HÀNH ĐỘNG

| Mã lỗi | Mô tả lỗi | Mức độ nghiêm trọng | Hiện trạng |
| :--- | :--- | :--- | :--- |
| **DEF-01** | Timer MeterValues bị chết vĩnh viễn khi trụ rớt mạng và nối lại | **HIGH** | Chưa sửa trong mã nguồn |
| **DEF-02** | Thiếu thông số `Current.Import` và `SoC` trong bản tin định kỳ | **MEDIUM** | Chưa sửa trong mã nguồn |
| **DEF-03** | Khởi động sạch Docker Compose bị 401 do chưa có admin trong DB | **HIGH** | Chưa tối ưu tự động hóa |
| **DEF-04** | Tự ý xóa file biên bản kiểm thử `kiem_thu_S26.md` | **MEDIUM** | Đã được QA phục hồi và lập biên bản |

### Đề xuất hành động tiếp theo:
1. Sửa hàm `bootAndInit()` trong `tools/vcp-fleet.js` để tự động kích hoạt lại `startMeterValuesReporting` nếu `this.currentTransactionId` đang có giá trị.
2. Bổ sung các mẫu đo `Current.Import` và `SoC` có tính lũy tiến hợp lý vào hàm `startMeterValuesReporting`.
3. Bổ sung kịch bản kiểm thử tự động (Unit / Acceptance Test) tái hiện chính xác trường hợp rớt mạng và xác minh MeterValues vẫn tiếp tục được phát sau khi tái kết nối.
