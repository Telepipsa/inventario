// /src/services/expiry.js
export function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d)) return false;
  const today = new Date();
  return d.toISOString().slice(0,10) === today.toISOString().slice(0,10);
}
export function isTodayOrPast(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d)) return false;
  const today = new Date();
  return d <= new Date(today.toISOString().slice(0,10));
}
