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
  // Consider "expired" only when the expiry date is strictly before today.
  // A product that expires today is still usable today and should not be
  // treated as expired until the next day.
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expiryDateAtMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return expiryDateAtMidnight.getTime() < startOfToday.getTime();
}
