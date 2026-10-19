# Hợp đồng hàm tính tiền và Quy ước làm tròn (Billing Contract)

> Tài liệu kỹ thuật phục vụ S-28, S-29, S-30, S-31, S-32 (Chặng 1).

## 1. Chữ ký hàm thuần `priceSession`

Module: `backend/src/modules/billing/price-session.js`  
Nguyên tắc: **Hàm thuần (Pure function)** — Không import `db/pool`, không đọc cơ sở dữ liệu, không đọc đồng hồ hệ thống.

```javascript
priceSession({
  startedAt,     // ISO string hoặc timestamp bắt đầu phiên
  stoppedAt,     // ISO string hoặc timestamp kết thúc phiên
  meterStartWh,  // Số nguyên Wh bắt đầu (>= 0)
  meterStopWh,   // Số nguyên Wh kết thúc (>= meterStartWh)
  samples: [     // Mảng mẫu đo Wh tích luỹ trong khoảng (startedAt, stoppedAt), sắp xếp tăng dần theo thời gian
    { at, wh }
  ],
  timezone,      // Chuỗi IANA timezone của trạm, ví dụ 'Asia/Ho_Chi_Minh'
  tariff: {
    periods: [   // Danh sách khung giờ đã chuẩn hoá, phủ kín [0, 1440) phút trong ngày
      { startMin, endMin, pricePerKwh, label? }
    ],
    idle: {
      graceMin,    // Thời gian ân hạn (phút, số nguyên >= 0)
      perMinDong   // Phí chiếm trụ mỗi phút (đồng, số nguyên >= 0)
    }
  },
  idleInterval?: { from, to } // Tuỳ chọn: khoảng thời gian chiếm trụ (ISO strings / timestamps)
})
```

### Kết quả trả về:

```javascript
{
  lines: [
    {
      kind: 'ENERGY' | 'IDLE',
      localDate: 'YYYY-MM-DD', // Ngày địa phương theo múi giờ trạm tại điểm bắt đầu đoạn
      from: 'ISO string',
      to: 'ISO string',
      wh: 12345,               // Số nguyên Wh (đoạn IDLE thì wh = 0)
      pricePerKwh: 4000,       // Đồng/kWh (đoạn IDLE thì null)
      amountDong: 49380,       // Số nguyên đồng
      minutes?: 15,            // Chỉ có ở dòng IDLE (số phút tính phí)
      perMinDong?: 1000        // Chỉ có ở dòng IDLE (đơn giá phút)
    }
  ],
  totalDong: 49380,            // Tổng tiền của phiên (số nguyên đồng)
  roundingRule: 'PER_SEGMENT_HALF_UP'
}
```

---

## 2. Thuật toán tính tiền điện 7 bước

1. **Điểm cắt thời gian (Split Points):**
   Tập hợp các điểm cắt gồm: `startedAt`, `stoppedAt`, mọi ranh giới đổi khung giờ trong ngày và mọi mốc nửa đêm (00:00) theo **GIỜ ĐỊA PHƯƠNG CỦA TRẠM** nằm nghiêm ngặt trong khoảng `(startedAt, stoppedAt)`. Loại bỏ trùng lặp và sắp xếp tăng dần.

2. **Xác định Wh tích luỹ tại mỗi điểm cắt (Interpolation):**
   Wh tích luỹ tại một điểm cắt $T$:
   - Nếu trùng với mốc đo thực tế trong `samples` (hoặc tại 2 đầu neo `meterStartWh @ startedAt`, `meterStopWh @ stoppedAt`), lấy trực tiếp giá trị mẫu đó.
   - Nếu nằm giữa hai mốc đo lân cận $A(t_A, wh_A)$ và $B(t_B, wh_B)$:
     $$\text{wh}_T = \text{roundHalfUp}\left(wh_A + \frac{(T - t_A) \times (wh_B - wh_A)}{t_B - t_A}\right)$$
     Kết quả làm tròn nửa lên về số nguyên Wh.

3. **Wh của từng đoạn (Segment Energy):**
   Wh của đoạn từ $T_i$ đến $T_{i+1}$ được tính bằng:
   $$\Delta \text{wh} = \text{wh}(T_{i+1}) - \text{wh}(T_i)$$
   *Bất biến bắt buộc:* $\sum \Delta \text{wh} = \text{meterStopWh} - \text{meterStartWh}$ đúng từng Wh. Không bao giờ tồn tại đoạn có độ dài 0 giây.

4. **Khung giá của đoạn (Tariff Period Matching):**
   Xác định khung giá áp dụng bằng cách lấy thời điểm giữa đoạn:
   $$T_{\text{mid}} = T_i + \frac{T_{i+1} - T_i}{2}$$
   Quy đổi $T_{\text{mid}}$ sang phút trong ngày theo giờ trạm (`[0, 1440)`) và tìm khung giờ tương ứng chứa $T_{\text{mid}}$.

5. **Tính tiền từng đoạn (Segment Amount):**
   Tiền điện của từng đoạn được làm tròn nửa lên bằng phép toán số nguyên:
   $$\text{amountDong} = \text{roundHalfUp}(\Delta \text{wh} \times \text{pricePerKwh}, 1000)$$
   Quy tắc: **Làm tròn từng đoạn rồi cộng dồn (`PER_SEGMENT_HALF_UP`)**.

6. **Đoạn 0 Wh:**
   Nếu một đoạn có $\Delta \text{wh} = 0$, vẫn sinh dòng chi tiết trong `lines` với `amountDong = 0` để đảm bảo liên tục về mặt thời gian trên hoá đơn.

7. **Trình bày dòng hoá đơn:**
   Mảng `lines` sắp xếp tăng dần theo thời gian. Mỗi dòng chứa `localDate` (ngày địa phương theo giờ trạm của mốc bắt đầu đoạn) để phục vụ gom nhóm theo ngày.

---

## 3. Quy ước tính phí chiếm trụ (IDLE)

Nếu đầu vào cung cấp `idleInterval`:
1. Mốc kết thúc ân hạn: $T_{\text{grace}} = \text{from} + \text{graceMin} \times 60 \text{ giây}$.
2. Nếu $\text{to} \le T_{\text{grace}}$: Xe rời trụ trong thời gian ân hạn $\Rightarrow$ **Không phát sinh phí IDLE** (không có dòng IDLE).
3. Nếu $\text{to} > T_{\text{grace}}$:
   - Số phút tính phí: Làm tròn trần (mỗi phút đã bắt đầu đều tính trọn 1 phút):
     $$\text{minutes} = \left\lceil \frac{\text{to} - T_{\text{grace}}}{60 \text{ giây}} \right\rceil$$
   - Tiền phí chiếm trụ:
     $$\text{idleDong} = \text{minutes} \times \text{perMinDong}$$
   - Tạo đúng **MỘT** dòng IDLE trong `lines` với:
     `{ kind: 'IDLE', localDate: (ngày của mốc hết ân hạn), from, to, wh: 0, pricePerKwh: null, minutes, perMinDong, amountDong: idleDong }`.

---

## 4. Bảng quyết định chốt (Decisions Q1, Q3, Q4, Q6)

| Mã | Nội dung | Quyết định áp dụng |
|---|---|---|
| **Q1** | Khóa biểu giá theo phiên hay theo ngày | Biểu giá được chọn áp dụng theo thời điểm bắt đầu phiên (`startedAt`). Các khung giờ trong ngày lấy từ biểu giá đó. |
| **Q3** | Quy tắc làm tròn tiền | Làm tròn nửa lên từng đoạn rồi cộng (`PER_SEGMENT_HALF_UP`). Cấm dùng số thực (floating point). |
| **Q4** | Xử lý số đo Wh khi mẫu thưa | Nội suy tuyến tính giữa 2 mốc đo bao quanh, làm tròn nửa lên về Wh nguyên. |
| **Q6** | Ngày hiệu lực biểu giá | Biểu giá đầu tiên của trạm được phép có hiệu lực từ **HÔM NAY** (theo ngày địa phương trạm). Các phiên bản cập nhật tiếp theo bắt buộc từ **NGÀY MAI** trở đi. Không được đặt ngày trong quá khứ. |
