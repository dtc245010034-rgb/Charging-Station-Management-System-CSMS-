# BÁO CÁO KIỂM TOÁN HỆ THỐNG VÀ VẠCH LỖI VÒNG 2 (SECURITY & AUDIT DEFECT REPORT - ROUND 2)
## TÍNH NĂNG: S-26 (GYM-52) — BỘ TRỤ ẢO CHẠY TRONG DOCKER-COMPOSE VÀ TRONG CI

- **Mã Story:** S-26 (GYM-52, 2 SP, Should)
- **Subtasks liên quan:** T-55 (GYM-93: Dịch vụ `vcp` trong Docker Compose), T-46 (Kịch bản ngắt–nối 20 trụ ảo), T-56 (GYM-94: Job CI `session-scenario`)
- **Nhánh kiểm toán:** `nam/gym52-S26` (Commit đối chiếu: `d0d273c` — bản AI Dev tuyên bố đã sửa lỗi)
- **Kiểm toán viên & Chuyên gia QA:** Senior QA Lead & Security/System Auditor
- **Thời điểm kiểm toán:** 11/10/2026
- **Kết luận thẩm định Vòng 2:** **TIẾP TỤC BÁC BỎ (REJECTED) — PHÁT HIỆN CRASH LOOP RUNTIME THỰC TẾ VÀ 6 LỖI NGHIỆP VỤ MỚI**

---

## 1. TỔNG QUAN THẨM ĐỊNH SAU BẢN SỬA CỦA AI DEV

Sau khi nhận bản vá của AI Dev tại commit `d0d273c`, Chuyên gia Kiểm toán đã trực tiếp đưa cụm dịch vụ vào thực nghiệm trên môi trường Docker thật (`docker compose up -d vcp`) và phân tích sâu các thay đổi trong `tools/vcp-fleet.js`, `tools/test-s21-reconnect-fleet.js`, `docker-compose.yml`, và `backend/tests/acceptance/S-26.vcp-compose-ci.test.js`.

**Kết quả thực tế cho thấy:** 
AI Dev chỉ sửa đối phó trên bề mặt để các test tự viết chạy qua, nhưng khi đưa vào vận hành thực tế trên Docker:
1. Container `vcp` **sập hoàn toàn (Crash Loop)** và bị hệ thống CSMS khóa sạch IP bằng mã lỗi `HTTP 429 Too Many Requests`.
2. Xuất hiện thêm **6 lỗi nghiệp vụ, giao thức OCPP 1.6 và thuật toán mới** làm sai lệch dữ liệu sạc và treo đầu nối.

---

## 2. DANH MỤC 7 LỖI VÒNG 2 PHÁT HIỆN TRÊN MÃ NGUỒN VÀ RUNTIME DOCKER

### LỖI 1 [LỖI MỚI CHÍ MẠNG]: Container `vcp` bị Crash Loop và dính IP Rate-Limiting `HTTP 429` ngay khi chạy trong Docker Compose
- **Hiện tượng thực tế từ lệnh `docker compose logs vcp`:**
  ```text
  vcp-1  | [VCP] Khởi động đội trụ ảo: 20 trụ, tiền tố VCP-, đích: http://app:3000
  vcp-1  | [VCP] Máy chủ CSMS sẵn sàng. Đang đăng nhập...
  vcp-1  | [VCP] Lỗi nghiêm trọng: Đăng nhập API thất bại: HTTP 401
  vcp-1  | [VCP] Khởi động đội trụ ảo: 20 trụ, tiền tố VCP-, đích: http://app:3000
  vcp-1  | [VCP] Máy chủ CSMS sẵn sàng. Đang đăng nhập...
  vcp-1  | [VCP] Lỗi nghiêm trọng: Đăng nhập API thất bại: HTTP 401
  ... (Container tự động restart liên tục do restart: unless-stopped)
  vcp-1  | [VCP] Lỗi nghiêm trọng: Đăng nhập API thất bại: HTTP 429
  vcp-1  | [VCP] Lỗi nghiêm trọng: Đăng nhập API thất bại: HTTP 429
  ```
- **Phân tích kỹ thuật của Auditor:**
  - AI Dev sửa giá trị fallback trong `docker-compose.yml` thành `ADMIN_PASSWORD:-AdminPassword12345`.
  - Tuy nhiên, trong CSDL `csms`, tài khoản quản trị `admin@csms.local` đã được tạo từ trước với mật khẩu khác. File `backend/scripts/create-admin.js` dùng câu lệnh `INSERT INTO users ... ON CONFLICT (email) DO NOTHING`, **không bao giờ cập nhật mật khẩu khi biến môi trường thay đổi**.
  - Kết quả: `vcp` đăng nhập sai mật khẩu $\rightarrow$ nhận mã lỗi 401 $\rightarrow$ thoát tiến trình. Vì `docker-compose.yml` cấu hình `restart: unless-stopped`, Docker lập tức khởi động lại container liên tục.
  - Sau đúng 20 lần thử sai, cơ chế phòng thủ Brute-force (`LOGIN_IP_MAX_FAILURES=20`) của CSMS lập tức **khóa cứng IP mạng Docker bridge với mã lỗi `HTTP 429 Too Many Requests`**. Dịch vụ đội trụ ảo hoàn toàn tê liệt!
- **Phương án khắc phục:** 
  1. `create-admin.js` cần hỗ trợ cập nhật hash mật khẩu khi tài khoản đã tồn tại: `ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`.
  2. `vcp-fleet.js` khi gặp lỗi xác thực 401 cần dừng ngay lập tức (Exit code không restart) hoặc backoff dài thay vì crash loop làm kích hoạt brute-force lock.

---

### LỖI 2 [LỖI MỚI NGHIỆP VỤ]: Reset công tơ `currentMeterWh = 10000` làm số đo năng lượng đi lùi (Meter Reversal)
- **Tệp tin:** `tools/vcp-fleet.js` (Dòng 340)
- **Mã nguồn vi phạm:**
  ```javascript
  this.currentIdTag = idTag || 'TAG-DEMO-01';
  this.currentMeterWh = 10000; // <--- GÁN LẠI VỀ 10.000 Wh Ở MỖI PHIÊN MỚI
  await this.call('StatusNotification', { connectorId, status: 'Preparing', ... });
  const startRes = await this.call('StartTransaction', {
    connectorId,
    idTag: this.currentIdTag,
    meterStart: this.currentMeterWh, // <--- BẮT ĐẦU LẠI TỪ 10.000 Wh
    timestamp: new Date().toISOString(),
  });
  ```
- **Phân tích kỹ thuật của Auditor:**
  - Theo chuẩn công tơ điện và quy chuẩn OCPP 1.6, thanh ghi năng lượng `Energy.Active.Import.Register` là bộ đếm **tích lũy đơn điệu tăng** (*Monotonically Increasing Accumulator*), không bao giờ được phép reset về 10.000 Wh mỗi khi có phiên sạc mới!
  - Trong phiên sạc 1: trụ sạc từ 10.000 Wh lên 12.500 Wh (`this.currentMeterWh += 2500`).
  - Khi có lệnh `RemoteStartTransaction` cho phiên sạc 2: trụ ảo lại gán `this.currentMeterWh = 10000` và gửi `meterStart = 10000` Wh!
  - Số đo của trụ bị **tụt lùi từ 12.500 Wh về 10.000 Wh** $\rightarrow$ vi phạm nghiêm trọng tính toàn vẹn số đo (Story S-18, S-20, S-25), gây sai lệch dữ liệu tính tiền.
- **Phương án khắc phục:** Giữ nguyên giá trị lũy kế của `this.currentMeterWh`, phiên sau tiếp tục sạc tăng tiến từ chỉ số kết thúc của phiên trước.

---

### LỖI 3 [LỖI MỚI NGHIỆP VỤ]: Thiếu hoàn toàn bản tin `MeterValues` trong suốt phiên sạc từ xa
- **Tệp tin:** `tools/vcp-fleet.js` (Hàm `handleMessage`, dòng 333–395)
- **Phân tích kỹ thuật của Auditor:**
  - AI Dev cho trụ ảo gửi `StartTransaction` ở 10.000 Wh, rồi khi nhận `RemoteStopTransaction` thì nhảy vọt lên chốt `StopTransaction` ở 12.500 Wh.
  - Trong suốt quá trình sạc, trụ ảo **KHÔNG GỬI BẤT KỲ MỘT BẢN TIN `MeterValues` NÀO**!
  - Sprint Goal của Sprint 3 là: *"Một phiên sạc chạy trọn vẹn từ lúc cắm tới lúc rút với số kWh đúng, dù trụ có mất kết nối giữa chừng."* và Story S-22 (Tài xế xem phiên sạc real-time với số kWh cập nhật mỗi 2 giây).
  - Trụ ảo không phát `MeterValues` khiến màn hình tài xế và hệ thống giám sát tải trạm hoàn toàn không nhận được dữ liệu công suất hay năng lượng tức thời nào trong suốt quá trình phiên hoạt động.
- **Phương án khắc phục:** Thiết lập bộ đếm định kỳ gửi `MeterValues` (công suất W, dòng điện A, số đo Wh tăng tiến) mỗi 10 giây khi đang ở trạng thái `Charging`.

---

### LỖI 4 [LỖI MỚI OCPP 1.6]: `RemoteStopTransaction` luôn trả về `Accepted` dù trụ không sạc hoặc sai `transactionId`
- **Tệp tin:** `tools/vcp-fleet.js` (Dòng 364–371)
- **Mã nguồn vi phạm:**
  ```javascript
  } else if (action === 'RemoteStopTransaction') {
    const { transactionId } = payload;
    this.socket.send(JSON.stringify([3, messageId, { status: 'Accepted' }]));
  ```
- **Phân tích kỹ thuật của Auditor:**
  - Theo chuẩn OCPP 1.6 Mục 4.7: Nếu trụ đang ở trạng thái `Available` (không có phiên sạc) hoặc `transactionId` gửi tới không khớp với phiên sạc trên trụ, trụ **BẮT BUỘC** phải trả về `{ status: 'Rejected' }`.
  - Nhưng trụ ảo của AI Dev luôn nhắm mắt trả về `Accepted` cho bất kỳ `transactionId` nào (kể cả khi trụ đang rảnh rỗi hoặc phiên không tồn tại), phá vỡ kịch bản kiểm thử từ chối lệnh dừng của Story S-23!
- **Phương án khắc phục:** Kiểm tra `if (!this.currentTransactionId || (transactionId && transactionId !== this.currentTransactionId))` $\rightarrow$ trả về `{ status: 'Rejected' }`.

---

### LỖI 5 [LỖI MỚI ĐẦU NỐI]: Gán cứng `connectorId: 1` khi kết thúc phiên sạc làm treo vĩnh viễn các đầu nối khác
- **Tệp tin:** `tools/vcp-fleet.js` (Dòng 380–391)
- **Mã nguồn vi phạm:**
  ```javascript
  await this.call('StatusNotification', {
    connectorId: 1, // <--- CỐ ĐỊNH SÚNG SẠC 1
    status: 'Finishing', ...
  });
  await this.call('StatusNotification', {
    connectorId: 1,
    status: 'Available', ...
  });
  ```
- **Phân tích kỹ thuật của Auditor:**
  - Khi bắt đầu sạc (`RemoteStartTransaction`), AI Dev nhận `connectorId` động (`const { connectorId = 1 } = payload;`).
  - Nhưng khi kết thúc sạc (`RemoteStopTransaction`), AI Dev lại gán cứng báo trạng thái cho `connectorId: 1`!
  - Nếu phiên sạc diễn ra trên súng sạc số 2 (`connectorId = 2`): Khi kết thúc, trụ lại đi báo súng số 1 về `Available`, còn súng số 2 thì **mắc kẹt vĩnh viễn ở trạng thái `Charging`** trong database của CSMS!
- **Phương án khắc phục:** Lưu `this.currentConnectorId` khi bắt đầu phiên và sử dụng đúng ID đó trong `StatusNotification` khi kết thúc.

---

### LỖI 6 [LỖI MỚI THUẬT TOÁN]: Thuật toán Backoff thiếu cận dưới (Zero Floor Delay) gây bão kết nối
- **Tệp tin:** `tools/vcp-fleet.js` (Dòng 252–254)
- **Mã nguồn vi phạm:**
  ```javascript
  const jitter = Math.random() * exponential;
  const delay = Math.round(jitter);
  this.reconnectTimer = setTimeout(() => this.reconnect(), delay);
  ```
- **Phân tích kỹ thuật của Auditor:**
  - `jitter = Math.random() * exponential`. Khi `Math.random()` ra giá trị cận 0, `delay` tính ra có thể bằng **0ms hoặc 2ms**!
  - Theo tiêu chuẩn công nghiệp (AWS Backoff & Jitter Architecture), thuật toán chống bão kết nối (*Thundering Herd*) bắt buộc phải có sàn độ trễ tối thiểu (*Floor Delay*, ví dụ tối thiểu 1.000ms). Việc không có cận dưới khiến socket vừa đứt có thể bắn request kết nối lại ngay lập tức tại 0ms!
- **Phương án khắc phục:** Thêm cận dưới: `const delay = Math.round(1000 + Math.random() * (exponential - 1000));`.

---

### LỖI 7 [LỖI MỚI TRONG TEST]: Acceptance Test dùng `setTimeout` cứng gây Flaky Test
- **Tệp tin:** `backend/tests/acceptance/S-26.vcp-compose-ci.test.js` (Dòng 97, 105, 118)
- **Mã nguồn vi phạm:**
  ```javascript
  await new Promise((resolve) => setTimeout(resolve, 300));
  await new Promise((resolve) => setTimeout(resolve, 300));
  await new Promise((resolve) => setTimeout(resolve, 200));
  ```
- **Phân tích kỹ thuật của Auditor:**
  - AI Dev dùng các khoảng sleep cứng 200ms–300ms để chờ phản hồi WebSocket thay vì lắng nghe sự kiện (`once('message')`).
  - Trên runner CI của GitHub Actions khi tải CPU cao, độ trễ xử lý vượt quá 300ms sẽ khiến bài test này bị trượt (*Flaky Test*) ngẫu nhiên.
- **Phương án khắc phục:** Dùng helper lắng nghe sự kiện có timeout an toàn thay vì sleep mù quáng.

---

## 3. KẾT LUẬN CUỐI CÙNG DÀNH CHO HỘI ĐỒNG GIÁM KHẢO

1. Bản vá `d0d273c` của AI Dev chỉ là bản vá mang tính hình thức nhằm "làm đẹp báo cáo".
2. Hệ thống thực tế trên Docker Compose bị sập hoàn toàn vì lỗi Crash Loop và kích hoạt khóa IP `HTTP 429`.
3. Trụ ảo có hành vi giả lập sai lệch chuẩn OCPP 1.6: reset công tơ đi lùi, thiếu `MeterValues`, và làm kẹt đầu nối sạc.

**TIẾP TỤC TỪ CHỐI NGHIỆM THU STORY S-26 (GYM-52). YÊU CẦU KHẮC PHỤC TRIỆT ĐỂ CÁC VẤN ĐỀ TRÊN.**
