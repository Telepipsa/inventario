// /src/components/search.js
export function searchProducts(products, query) {
  if (!query) return products;
  const q = query.toLowerCase().trim();
  return products.filter(p =>
    (p.producto || '').toLowerCase().includes(q) ||
    false
  );
}
