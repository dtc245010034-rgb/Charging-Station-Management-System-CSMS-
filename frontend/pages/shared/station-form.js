import { h } from '../../app/dom.js';
import { stationStatusLabels } from '../../app/status.js';
import { kilowattsToWatts } from '../../app/power.js';
import * as csms from '../../services/csms.js';
import { openModal } from '../../components/modal.js';
import { createPickerMap } from '../../components/station-map.js';
import { toast } from '../../components/toast.js';

const isNum = (value, min, max) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;

// Form tạo/sửa trạm. Tạo mới: Idempotency-Key sinh một lần và đổi khi người dùng sửa nội dung,
// nên bấm lưu hai lần vẫn chỉ ra một trạm. Sửa: chỉ gửi trường thật sự thay đổi.
export function openStationForm({ station = null, onSaved }) {
  const editing = Boolean(station);
  const locked = station?.status === 'ACTIVE'; // backend chặn sửa toạ độ khi trạm đang hoạt động
  let key = csms.stations.newKey();
  const fieldError = {};

  const input = (id, props) => h('input', { class: 'input', id, ...props });
  const name = input('sf-name', { maxlength: 255, required: true, value: station?.name ?? '', autocomplete: 'off' });
  const address = input('sf-address', { maxlength: 500, required: true, value: station?.address ?? '', autocomplete: 'off' });
  const powerLimit = input('sf-power-limit', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: station?.power?.limitKw ?? '',
    'aria-describedby': 'sf-power-hint',
  });
  const noShowFee = input('sf-no-show-fee', {
    type: 'number', step: '1000', min: '0', max: '1000000', autocomplete: 'off',
    value: station?.noShowFeeDong ?? 0,
  });
  const lat = input('sf-lat', { type: 'number', step: 'any', inputmode: 'decimal', min: -90, max: 90, value: station?.latitude ?? '', disabled: locked });
  const lng = input('sf-lng', { type: 'number', step: 'any', inputmode: 'decimal', min: -180, max: 180, value: station?.longitude ?? '', disabled: locked });
  const status = h('select', { class: 'select', id: 'sf-status' },
    Object.entries(stationStatusLabels).map(([value, label]) => h('option', { value, selected: (station?.status ?? 'INACTIVE') === value }, label)));

const TIMEZONES = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Việt Nam (Asia/Ho_Chi_Minh, GMT+7)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (Asia/Bangkok, GMT+7)' },
  { value: 'Asia/Kolkata', label: 'Ấn Độ (Asia/Kolkata, GMT+5:30)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (Asia/Tokyo, GMT+9)' },
  { value: 'UTC', label: 'UTC (GMT+0)' },
];

  const tz = h('select', { class: 'select', id: 'sf-timezone' },
    TIMEZONES.map(({ value, label }) => h('option', { value, selected: (station?.timezone ?? 'Asia/Ho_Chi_Minh') === value }, label)));

  const errors = {
    name: h('p', { class: 'field__error', hidden: true }),
    address: h('p', { class: 'field__error', hidden: true }),
    power: h('p', { class: 'field__error', hidden: true }),
    noShowFee: h('p', { class: 'field__error', hidden: true }),
    coords: h('p', { class: 'field__error', hidden: true }),
  };
  const formError = h('p', { class: 'form-alert', role: 'alert', hidden: true });
  const setError = (field, message) => { errors[field].textContent = message || ''; errors[field].hidden = !message; fieldError[field] = message; };

  const mapEl = h('div', { class: 'map', style: 'min-height:240px;height:240px;border-radius:var(--radius-md);overflow:hidden', 'aria-label': 'Bản đồ chọn vị trí' });
  const picker = locked ? null : createPickerMap(mapEl, {
    onPick: (la, ln) => { lat.value = la.toFixed(8); lng.value = ln.toFixed(8); setError('coords', ''); picker.setPoint(la, ln); },
  });
  const syncMarker = () => picker?.setPoint(Number(lat.value), Number(lng.value));
  picker?.ready.then(() => { if (lat.value && lng.value) picker.setPoint(Number(lat.value), Number(lng.value), true); });
  lat.addEventListener('input', syncMarker);
  lng.addEventListener('input', syncMarker);

  const save = h('button', { class: 'btn btn--primary', type: 'submit' }, editing ? 'Lưu thay đổi' : 'Lưu trạm');
  const form = h('form', { class: 'stack', novalidate: true, id: 'station-form' },
    h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Tên trạm'), name, errors.name),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Địa chỉ'), address, errors.address),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Hạn mức công suất (kW)'), powerLimit,
        h('span', { class: 'field__hint', id: 'sf-power-hint' }, 'Để trống nếu không giới hạn; tối đa 1 chữ số thập phân.'), errors.power),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Phí không đến (đồng)'), noShowFee,
        h('span', { class: 'field__hint' }, 'Từ 0 đến 1.000.000 đ; trừ ví nếu quá hạn.'), errors.noShowFee),
      h('label', { class: editing ? 'field' : 'field span-2' }, h('span', { class: 'field__label' }, 'Múi giờ'), tz),
      editing && h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Trạng thái'), status)),
    locked
      ? h('p', { class: 'field__hint' }, 'Trạm đang hoạt động nên không sửa được toạ độ. Chuyển sang “Chưa hoạt động” và lưu trước.')
      : h('p', { class: 'field__hint' }, 'Bấm vào bản đồ để đặt vị trí, hoặc nhập toạ độ bên dưới.'),
    !locked && mapEl,
    h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Vĩ độ'), lat),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Kinh độ'), lng),
      h('div', { class: 'span-2' }, errors.coords)),
    formError);

  function validate() {
    let ok = true;
    setError('name', name.value.trim() ? '' : 'Tên trạm là bắt buộc');
    setError('address', address.value.trim() ? '' : 'Địa chỉ là bắt buộc');
    ok = !fieldError.name && !fieldError.address;
    const powerText = powerLimit.value.trim();
    const powerWatts = powerText ? kilowattsToWatts(powerText) : null;
    const validPower = powerText === '' || powerWatts !== null;
    setError('power', validPower ? '' : 'Công suất phải từ 0,1 đến 100.000 kW và tối đa 1 chữ số thập phân');
    ok = ok && validPower;
    const nsfText = noShowFee.value.trim();
    const nsfNum = Number(nsfText || 0);
    const validNsf = nsfText === '' || (Number.isInteger(nsfNum) && nsfNum >= 0 && nsfNum <= 1000000);
    setError('noShowFee', validNsf ? '' : 'Phí không đến phải là số nguyên từ 0 đến 1.000.000 đ');
    ok = ok && validNsf;
    let coords = '';
    if (!locked) {
      const hasLat = lat.value.trim() !== '';
      const hasLng = lng.value.trim() !== '';
      if (hasLat !== hasLng) coords = 'Cần nhập cả vĩ độ và kinh độ';
      else if (!editing && !hasLat) coords = 'Vĩ độ và kinh độ là bắt buộc';
      else if (hasLat && !isNum(lat.value, -90, 90)) coords = 'Vĩ độ phải nằm trong khoảng -90 đến 90';
      else if (hasLng && !isNum(lng.value, -180, 180)) coords = 'Kinh độ phải nằm trong khoảng -180 đến 180';
    }
    setError('coords', coords);
    return ok && !coords;
  }

  function payload() {
    const body = {};
    const next = { name: name.value.trim(), address: address.value.trim(), timezone: tz.value };
    if (!editing) {
      return {
        ...next,
        latitude: lat.value.trim(),
        longitude: lng.value.trim(),
        ...(powerLimit.value.trim() ? { power_limit_kw: powerLimit.value.trim() } : {}),
        no_show_fee_dong: Number(noShowFee.value || 0),
      };
    }
    for (const field of ['name', 'address', 'timezone']) if (next[field] !== station[field]) body[field] = next[field];
    const enteredPower = powerLimit.value.trim();
    const enteredWatts = enteredPower ? kilowattsToWatts(enteredPower) : null;
    if (enteredWatts !== (station.power_limit_w === null ? null : BigInt(station.power_limit_w))) {
      body.power_limit_kw = enteredPower || null;
    }
    const enteredNsf = Number(noShowFee.value || 0);
    if (enteredNsf !== Number(station.no_show_fee_dong ?? station.noShowFeeDong ?? 0)) {
      body.no_show_fee_dong = enteredNsf;
    }
    if (!locked && lat.value.trim() && (Number(lat.value) !== Number(station.latitude) || Number(lng.value) !== Number(station.longitude))) {
      body.latitude = lat.value.trim();
      body.longitude = lng.value.trim();
    }
    if (status.value !== station.status) body.status = status.value;
    return body;
  }

  const modal = openModal({
    title: editing ? 'Sửa thông tin trạm' : 'Thêm trạm sạc',
    body: form,
    footer: [h('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'Hủy'), save],
    onClose: () => picker?.destroy(),
  });
  save.setAttribute('form', 'station-form');
  picker?.ready.then(() => picker.invalidate());
  setTimeout(() => { picker?.invalidate(); name.focus(); }, 60);

  form.addEventListener('input', () => { key = csms.stations.newKey(); formError.hidden = true; });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validate()) return;
    const body = payload();
    if (editing && !Object.keys(body).length) { modal.close(); return; }
    save.disabled = true;
    save.textContent = 'Đang lưu…';
    try {
      const saved = editing ? await csms.stations.update(station.id, body) : await csms.stations.create(body, key);
      modal.close();
      toast(editing ? 'Đã lưu thay đổi trạm.' : `Đã tạo trạm “${saved.name}”.`);
      onSaved?.(saved);
    } catch (error) {
      formError.textContent = error.message;
      formError.hidden = false;
      save.disabled = false;
      save.textContent = editing ? 'Lưu thay đổi' : 'Lưu trạm';
    }
  });
}
