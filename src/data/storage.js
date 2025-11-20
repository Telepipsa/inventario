// /src/data/storage.js
export function loadProducts() {
  const raw = localStorage.getItem('products');
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export function saveProducts(products) {
  localStorage.setItem('products', JSON.stringify(products));
}
