// /src/data/storage.js
export function loadProducts() {
  // When the app is configured to use Supabase as the single source of truth,
  // avoid falling back to localStorage. This prevents mixing local cached data
  // with the DB and stops the app from loading non-DB data on tab visibility
  // changes or startup when `window.__USE_SUPABASE` is set.
  try {
    if (typeof window !== 'undefined' && window.__USE_SUPABASE) return [];
  } catch (e) {
    // ignore and continue to localStorage fallback
  }
  const raw = localStorage.getItem('products');
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export function saveProducts(products) {
  localStorage.setItem('products', JSON.stringify(products));
}
