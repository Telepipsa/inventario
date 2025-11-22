// Simple Supabase REST client wrapper for this app
// WARNING: This file contains your anon key. It's ok for client-side testing,
// but do NOT commit service_role keys or expose them publicly.

const SUPABASE_URL = 'https://bfmvmktsidiktazuuevg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmbXZta3RzaWRpa3RhenV1ZXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MTAxMTEsImV4cCI6MjA3OTM4NjExMX0.NUb-cU-uB7ts-aC4_TDMyXNBmikMGzCt_plCKMxYp4w';

function _headers() {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`
  };
}

async function listProducts() {
  // GET /rest/v1/products?select=*
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/products?select=*`;
  const res = await fetch(url, { method: 'GET', headers: _headers(), cache: 'no-store' });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    const err = new Error('Supabase listProducts failed: ' + res.status + ' ' + txt);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  // Cache detected schema (column names) for mapping in saveProducts
  try {
    if (!window.__SUPABASE_SCHEMA) {
      const sample = (Array.isArray(data) && data.length > 0) ? data[0] : null;
      window.__SUPABASE_SCHEMA = detectSchemaFromSample(sample);
    }
  } catch (e) {
    console.warn('detect schema failed', e);
  }
  return data;
}

function detectSchemaFromSample(sample) {
  // sample is an object with column keys from the DB. We map common variants.
  const schema = {
    id: 'id',
    code: null,
    name: null,
    qty: null,
    expiry: null
  };
  if (!sample || typeof sample !== 'object') return schema;
  const keys = Object.keys(sample);
  // helper to find first match from candidates
  function find(candidates) {
    for (const c of candidates) if (keys.includes(c)) return c;
    return null;
  }
  schema.code = find(['code', 'codigo', 'cod', 'codigo_barra', 'sku']);
  schema.name = find(['name', 'producto', 'product', 'producto_nombre', 'descripcion']);
  schema.qty = find(['qty', 'stock', 'cantidad', 'units']);
  schema.expiry = find(['expiry', 'caducidad', 'caducidad_date', 'expiration']);
  // ensure id exists
  schema.id = find(['id', 'product_id']) || 'id';
  return schema;
}

async function saveProducts(products) {
  // Upsert by detected conflict column (code/codigo) or fallback to insert.
  const base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/products';
  const payload = (Array.isArray(products) ? products : []);
  if (payload.length === 0) return [];

  // Normalize payload: ensure field names match table columns
  // Build normalized payload using detected schema (if available)
  const schema = window.__SUPABASE_SCHEMA || detectSchemaFromSample(null);
  const normalized = payload.map(p => {
    const out = {};
    // fill using schema mapping: if DB uses Spanish columns, preserve those names
    const src = Object.assign({}, p);
    // map id if present
    if (src.id !== undefined) out[schema.id] = src.id;
    // name
    if (src.name !== undefined) out[schema.name || 'name'] = src.name;
    if (src.producto !== undefined && !out[schema.name || 'name']) out[schema.name || 'name'] = src.producto;
    // code
    if (src.code !== undefined) out[schema.code || 'code'] = src.code;
    if (src.codigo !== undefined && !out[schema.code || 'code']) out[schema.code || 'code'] = src.codigo;
    // qty / stock
    if (src.qty !== undefined) out[schema.qty || 'qty'] = src.qty;
    if (src.stock !== undefined && out[schema.qty || 'qty'] === undefined) out[schema.qty || 'qty'] = src.stock;
    // expiry / caducidad
    if (src.expiry !== undefined) out[schema.expiry || 'expiry'] = src.expiry;
    if (src.caducidad !== undefined && out[schema.expiry || 'expiry'] === undefined) out[schema.expiry || 'expiry'] = src.caducidad;
    // copy other unknown fields as-is (best effort)
    Object.keys(src).forEach(k => {
      if (![ 'id', 'name', 'producto', 'code', 'codigo', 'qty', 'stock', 'expiry', 'caducidad' ].includes(k)) {
        out[k] = src[k];
      }
    });
    return out;
  });

  // determine conflict column
  const conflictCol = (window.__SUPABASE_SCHEMA && window.__SUPABASE_SCHEMA.code) ? window.__SUPABASE_SCHEMA.code : 'code';
  const url = base + `?on_conflict=${encodeURIComponent(conflictCol)}`;
  const headers = Object.assign({}, _headers(), { Prefer: 'resolution=merge-duplicates,return=representation' });
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(normalized) });
    if (!res.ok) {
      const txt = await res.text().catch(()=>'');
      const err = new Error('Supabase upsert failed: ' + res.status + ' ' + txt);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return data;
  } catch (upsertErr) {
    console.warn('Supabase upsert error, attempting delete+insert fallback', upsertErr);
    try {
      const dres = await fetch(base, { method: 'DELETE', headers: _headers() });
      if (!dres.ok) {
        const txt = await dres.text().catch(()=>'');
        const err2 = new Error('Supabase delete fallback failed: ' + dres.status + ' ' + txt);
        err2.status = dres.status;
        throw err2;
      }
      const insertRes = await fetch(base, { method: 'POST', headers: Object.assign({}, _headers(), { Prefer: 'return=representation' }), body: JSON.stringify(normalized) });
      if (!insertRes.ok) {
        const txt = await insertRes.text().catch(()=>'');
        const err3 = new Error('Supabase insert fallback failed: ' + insertRes.status + ' ' + txt);
        err3.status = insertRes.status;
        throw err3;
      }
      const data2 = await insertRes.json();
      return data2;
    } catch (fallbackErr) {
      console.error('Supabase upsert and fallback both failed', fallbackErr);
      throw upsertErr;
    }
  }
}

// expose convenient names on window for the app to detect availability
try {
  window.__USE_SUPABASE = true;
  window.__SUPABASE = window.__SUPABASE || {};
  window.__SUPABASE.listProducts = listProducts;
  window.__SUPABASE.saveProducts = saveProducts;
} catch (e) {
  // ignore if window not available in some contexts
}

export { listProducts, saveProducts };
