# VULN-S04-FE01 — Lỗ hổng Stored XSS trong Leaflet Tooltip hiển thị tên trạm trên Bản đồ

Loại: VULN | Severity: Cao (CVSS 3.1: 7.2 - `CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:L/A:N`) | Story/Task: S-04 / T-09  
Mức xác minh: ĐÃ CHẠY | Trạng thái: MỞ  
Màn hình/URL: `/app.html#/operator/map`, `/app.html#/owner/map`  
Vai trò dùng để tái hiện: STATION_OWNER (tạo trạm độc hại) $\rightarrow$ Nạn nhân: OPERATOR / ADMIN (mở bản đồ)  
Trình duyệt + phiên bản: Chromium / Chrome 120+, Firefox 120+  
Bằng chứng: DOM Node Tooltip chứa mã HTML thực thi, không bị escape; không có CSP ngăn chặn.  

---

## 1. Mô tả
Khi người dùng có vai trò Chủ trạm (`STATION_OWNER`) tạo hoặc sửa trạm với tên chứa payload HTML/SVG (ví dụ: `<img src=x onerror=window.__xss_probe=1>`), máy chủ backend chấp nhận lưu chuỗi thô vào cơ sở dữ liệu. Khi Vận hành viên (`OPERATOR`) hoặc Quản trị viên (`ADMIN`) mở màn hình Bản đồ giám sát, component `station-map.js` nạp dữ liệu trạm và gọi trực tiếp `marker.bindTooltip(point.name)` / `marker.setTooltipContent(point.name)`.  
Do thư viện Leaflet 1.9.4 (`leaflet.js`) kiểm tra `if ("string" == typeof e) t.innerHTML = e;`, chuỗi tên trạm được gán trực tiếp vào `innerHTML` của tooltip container, dẫn tới việc mã JavaScript độc hại được thực thi ngay trong ngữ cảnh phiên làm việc của Quản trị viên/Vận hành viên.

## 2. Vị trí
- File: `frontend/components/station-map.js:80` và `frontend/components/station-map.js:84`
- Đoạn code trích:
```javascript
// Dòng 80:
existing.marker.setTooltipContent(point.name);

// Dòng 83-84:
const marker = L.marker([point.lat, point.lng], { icon: pinIcon(L, point.group), title: point.name, keyboard: true })
  .addTo(map).bindTooltip(point.name).on('click', () => onSelect(point.id));
```
- Phía thư viện: `frontend/vendor/leaflet/leaflet.js` (hàm `_updateContent`):
```javascript
_updateContent: function() {
  if (this._content) {
    var t = this._contentNode,
        e = "function" == typeof this._content ? this._content(this._source || this) : this._content;
    if ("string" == typeof e) t.innerHTML = e;
    else {
      for (; t.hasChildNodes();) t.removeChild(t.firstChild);
      t.appendChild(e);
    }
  }
}
```

## 3. Nguồn → Đích
- **Nguồn (Source):** Người dùng nhập `name` khi gọi `POST /api/stations` hoặc `PATCH /api/stations/:id`.
- **Trung gian:** Lưu trữ thô trong PostgreSQL bảng `stations.name` $\rightarrow$ Trả về qua `GET /api/fleet-status` hoặc `GET /api/stations`.
- **Đích (Sink):** `leaflet.js` $\rightarrow$ `_updateContent` $\rightarrow$ `t.innerHTML = e` (Tooltip DOM Node).

## 4. Tái hiện (Các bước chạy thật)
1. Đăng nhập tài khoản Chủ trạm:
```bash
node -e "
fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'owner@demo.csms.local', password: 'demo12345' })
}).then(async r => {
  const cookie = r.headers.get('set-cookie');
  // Tạo trạm với payload XSS
  const res = await fetch('http://localhost:3000/api/stations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie, 'Idempotency-Key': 'xss-' + Date.now() },
    body: JSON.stringify({
      name: '<img src=x onerror=window.__xss_probe=1>',
      address: '123 Phố XSS, Hà Nội',
      latitude: '21.0285',
      longitude: '105.8542'
    })
  });
  console.log('Status:', res.status, await res.json());
});"
```
