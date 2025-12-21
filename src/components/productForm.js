// /src/components/productForm.js
export function fillForm(p) {
  // prefer explicit codigo but fall back to other common keys; trim whitespace
  const rawCode = (p && (p.codigo || p.predeterminado || p.code || p.Codigo || p.CODIGO || p.Code || p.codigoProducto)) || '';
  try { document.getElementById('pfCodigo').value = rawCode.toString().trim(); } catch (e) { document.getElementById('pfCodigo').value = '' }
  document.getElementById('pfName').value = p.producto || '';
  document.getElementById('pfStock').value = p.stock ?? 0;
  // normalize expiry to YYYY-MM-DD so <input type="date"> can display it
  const raw = p.caducidad || '';
  document.getElementById('pfExpiry').value = normalizeToIso(raw);
  const iconValue = p.icon || 'icon-192.png';
  document.getElementById('pfIcon').value = iconValue;
  const preview = document.getElementById('pfIconPreview');
  if (preview) preview.src = `./public/icons/${iconValue}`;
  // tipo: prefer the new `tipo` column (array). Fallback to legacy `tags` array.
  try {
    const tiposArray = Array.isArray(p && p.tipo) ? p.tipo.map(t => (t||'').toString().toLowerCase())
      : (p && typeof p.tipo === 'string' && p.tipo.trim() !== '') ? [p.tipo.toString().toLowerCase()]
      : (Array.isArray(p.tags) ? p.tags.map(t => (t||'').toString().toLowerCase()) : []);
    document.getElementById('pfTagSeco').checked = tiposArray.includes('seco');
    document.getElementById('pfTagCongelado').checked = tiposArray.includes('congelado');
    document.getElementById('pfTagFresco').checked = tiposArray.includes('fresco');
    document.getElementById('pfTagBebida').checked = tiposArray.includes('bebida');
    document.getElementById('pfTagHelados').checked = tiposArray.includes('helados');
  } catch (e) { /* ignore */ }
}
export function readForm() {
  const codigo = document.getElementById('pfCodigo').value.trim();
  const name = document.getElementById('pfName').value.trim();
  const stock = +document.getElementById('pfStock').value;
  let expiry = document.getElementById('pfExpiry').value.trim();
  const icon = document.getElementById('pfIcon').value.trim() || 'icon-192.png';
  // Determine tipo from checkbox selection (allow multiple)
  let tipo = [];
    try {
    if (document.getElementById('pfTagSeco') && document.getElementById('pfTagSeco').checked) tipo.push('seco');
    if (document.getElementById('pfTagCongelado') && document.getElementById('pfTagCongelado').checked) tipo.push('congelado');
    if (document.getElementById('pfTagFresco') && document.getElementById('pfTagFresco').checked) tipo.push('fresco');
    if (document.getElementById('pfTagBebida') && document.getElementById('pfTagBebida').checked) tipo.push('bebida');
    if (document.getElementById('pfTagHelados') && document.getElementById('pfTagHelados').checked) tipo.push('helados');
  } catch(e) {}
  if (!name) { alert('Nombre es obligatorio'); return null; }
  if (!Number.isFinite(stock) || stock < 0) { alert('Stock debe ser un número ≥ 0'); return null; }
  // expiry is optional; if provided, must be YYYY-MM-DD
  if (expiry === '') expiry = '';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) { alert('Fecha en formato YYYY-MM-DD'); return null; }
  return { codigo: codigo || '', producto: name, stock, caducidad: expiry, icon, tipo };
}

// helpers
function normalizeToIso(val) {
  if (!val) return '';
  // already ISO-like
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  // Date object
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val.toISOString().slice(0,10);
  // dd/mm/yyyy or dd-mm-yyyy -> convert
  const dm = /^([0-3]?\d)[-/]([0-1]?\d)[-/](\d{4})$/.exec(val);
  if (dm) {
    const d = dm[1].padStart(2,'0');
    const m = dm[2].padStart(2,'0');
    const y = dm[3];
    return `${y}-${m}-${d}`;
  }
  // mm/dd/yyyy common US format -> try to interpret if looks like that
  const mm = /^([0-1]?\d)[-/]([0-3]?\d)[-/](\d{4})$/.exec(val);
  if (mm) {
    const m = mm[1].padStart(2,'0');
    const d = mm[2].padStart(2,'0');
    const y = mm[3];
    return `${y}-${m}-${d}`;
  }
  // fallback: try constructing Date
  const parsed = new Date(val);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0,10);
  return '';
}
export function bindFormActions({ onSave, onDelete, onCancel }) {
  document.getElementById('productForm').addEventListener('submit', (e) => {
    e.preventDefault();
    onSave();
  });
  document.getElementById('pfDelete').addEventListener('click', onDelete);
  document.getElementById('pfClose').addEventListener('click', onCancel);
}
