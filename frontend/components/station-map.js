import { h } from '../app/dom.js';
import { emptyState } from './empty-state.js';

// Leaflet được vendor trong /vendor/leaflet (không phụ thuộc CDN). Chỉ nạp khi có màn hình cần bản đồ.
let leafletReady;
export function loadLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  leafletReady ??= new Promise((resolve, reject) => {
    document.head.append(h('link', { rel: 'stylesheet', href: '/vendor/leaflet/leaflet.css' }));
    const script = h('script', { src: '/vendor/leaflet/leaflet.js' });
    script.onload = () => resolve(globalThis.L);
    script.onerror = () => { leafletReady = null; reject(new Error('Không tải được thư viện bản đồ')); };
    document.head.append(script);
  });
  return leafletReady;
}

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; OpenStreetMap contributors';

function baseMap(L, container) {
  const map = L.map(container, { scrollWheelZoom: false, zoomControl: true }).setView([16, 106], 5);
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  return map;
}

const pinIcon = (L, group) => L.divIcon({ className: '', html: h('div', { class: `pin pin--${group}` }), iconSize: [30, 30], iconAnchor: [15, 30] });

// Bản đồ giám sát: mỗi trạm một marker, màu theo nhóm trạng thái xấu nhất của các trụ.
export function createStationMap(container, { onSelect }) {
  let L; let map; let failed = false; let fitted = false;
  const markers = new Map();
  let pending = null;

  const ready = loadLeaflet().then((lib) => {
    L = lib;
    map = baseMap(L, container);
    if (pending) apply(pending);
  }).catch(() => {
    failed = true;
    container.replaceChildren(h('div', { class: 'map-fallback' }, emptyState({ iconName: 'map', title: 'Bản đồ chưa tải được', text: 'Danh sách trạm bên cạnh vẫn dùng được bình thường.' })));
  });

  function apply(points) {
    const seen = new Set();
    for (const point of points) {
      seen.add(String(point.id));
      const existing = markers.get(String(point.id));
      if (existing) {
        if (existing.group !== point.group) { existing.marker.setIcon(pinIcon(L, point.group)); existing.group = point.group; }
        existing.marker.setTooltipContent(point.name);
        continue;
      }
      const marker = L.marker([point.lat, point.lng], { icon: pinIcon(L, point.group), title: point.name, keyboard: true })
        .addTo(map).bindTooltip(point.name).on('click', () => onSelect(point.id));
      markers.set(String(point.id), { marker, group: point.group });
    }
    for (const [id, entry] of markers) if (!seen.has(id)) { entry.marker.remove(); markers.delete(id); }
    if (!fitted && points.length) {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 14 });
      fitted = true;
    }
  }

  return {
    ready,
    update(points) { pending = points; if (map) apply(points); },
    invalidate() { map?.invalidateSize(); },
    destroy() { map?.remove(); map = null; },
    get failed() { return failed; },
  };
}

// Bản đồ chọn toạ độ trong form trạm: bấm để đặt điểm, nhập tay ở ô số vẫn được.
export function createPickerMap(container, { onPick }) {
  let L; let map; let marker;
  const ready = loadLeaflet().then((lib) => {
    L = lib;
    map = baseMap(L, container);
    map.on('click', (event) => onPick(event.latlng.lat, event.latlng.lng));
  }).catch(() => container.replaceChildren(h('p', { class: 'field__hint', style: 'padding:12px' }, 'Bản đồ chưa tải được. Bạn vẫn có thể nhập toạ độ bên dưới.')));
  return {
    ready,
    setPoint(lat, lng, pan = false) {
      if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!marker) marker = L.marker([lat, lng]).addTo(map);
      else marker.setLatLng([lat, lng]);
      if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 13));
    },
    invalidate() { map?.invalidateSize(); },
    destroy() { map?.remove(); map = null; },
  };
}
