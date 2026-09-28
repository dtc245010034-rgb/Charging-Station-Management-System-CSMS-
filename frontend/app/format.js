const number = new Intl.NumberFormat('vi-VN');
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

export const formatNumber = (value) => number.format(Number(value));
export const formatKw = (value) => `${number.format(Number(value))} kW`;
export const formatDateTime = (value) => (value ? dateTime.format(new Date(value)) : '—');

export function formatLongDate(date = new Date()) {
  const text = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export const formatClock = (date = new Date()) => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
export const initials = (name = '') => name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
export const coordinate = (value) => (value === null || value === undefined ? '—' : Number(value).toFixed(5));
