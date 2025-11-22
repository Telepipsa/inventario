// Public copy of Supabase REST client wrapper for static-serving environments
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
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/products?select=*`;
  const res = await fetch(url, { method: 'GET', headers: _headers(), cache: 'no-store' });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    const err = new Error('Supabase listProducts failed: ' + res.status + ' ' + txt);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  try {
    if (!window.__SUPABASE_SCHEMA) {
      const sample = (Array.isArray(data) && data.length > 0) ? data[0] : null;
      window.__SUPABASE_SCHEMA = detectSchemaFromSample(sample);
    }
  } catch (e) {
    console.warn('detect schema failed', e);
  }
  // Normalize returned rows so frontend expects `icon` and `code` consistently.
  try {
    const schema = window.__SUPABASE_SCHEMA || detectSchemaFromSample((Array.isArray(data) && data.length>0)?data[0]:null);
    if (Array.isArray(data) && data.length > 0) {
      data.forEach(row => {
        // map icon column to `icon` for UI
        if (schema && schema.icon && row[schema.icon] !== undefined) row.icon = row[schema.icon];
        // map code-like column to `code` for UI convenience
        if (schema && schema.code && row[schema.code] !== undefined) row.code = row[schema.code];
        if (!row.code && row.codigo) row.code = row.codigo;
      });
    }
  } catch(e) { /* non-fatal */ }
  return data;
}

function detectSchemaFromSample(sample) {
  const schema = {
    id: 'id',
    code: null,
    name: null,
    qty: null,
    expiry: null,
    icon: null
  };
  if (!sample || typeof sample !== 'object') return schema;
  const keys = Object.keys(sample);
  function find(candidates) {
    for (const c of candidates) if (keys.includes(c)) return c;
    return null;
  }
  schema.code = find(['code', 'codigo', 'cod', 'codigo_barra', 'sku']);
  schema.name = find(['name', 'producto', 'product', 'producto_nombre', 'descripcion']);
  schema.qty = find(['qty', 'stock', 'cantidad', 'units']);
  schema.expiry = find(['expiry', 'caducidad', 'caducidad_date', 'expiration']);
  schema.icon = find(['icon', 'icono', 'imagen', 'ruta_icono']);
  schema.id = find(['id', 'product_id']) || 'id';
  schema.columns = keys.slice();
  return schema;
}

async function saveProducts(products) {
  const base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/products';
  const payload = (Array.isArray(products) ? products : []);
  if (payload.length === 0) return [];
  const schema = window.__SUPABASE_SCHEMA || detectSchemaFromSample(null);
  const normalized = payload.map(p => {
    const out = {};
    const src = Object.assign({}, p);
    if (src.id !== undefined) out[schema.id] = src.id;
    if (src.name !== undefined) out[schema.name || 'name'] = src.name;
    if (src.producto !== undefined && !out[schema.name || 'name']) out[schema.name || 'name'] = src.producto;
    if (src.code !== undefined) out[schema.code || 'code'] = src.code;
    if (src.codigo !== undefined && !out[schema.code || 'code']) out[schema.code || 'code'] = src.codigo;
    if (src.qty !== undefined) out[schema.qty || 'qty'] = src.qty;
    if (src.stock !== undefined && out[schema.qty || 'qty'] === undefined) out[schema.qty || 'qty'] = src.stock;
    if (src.expiry !== undefined) out[schema.expiry || 'expiry'] = src.expiry;
    if (src.caducidad !== undefined && out[schema.expiry || 'expiry'] === undefined) out[schema.expiry || 'expiry'] = src.caducidad;
    // icon
    if (src.icon !== undefined) out[schema.icon || 'icon'] = src.icon;
    if (src.icono !== undefined && !out[schema.icon || 'icon']) out[schema.icon || 'icon'] = src.icono;
    Object.keys(src).forEach(k => {
      if (![ 'id', 'name', 'producto', 'code', 'codigo', 'qty', 'stock', 'expiry', 'caducidad', 'icon', 'icono' ].includes(k)) {
        out[k] = src[k];
      }
    });
    return out;
  });
  const detectedSchema = window.__SUPABASE_SCHEMA || detectSchemaFromSample(null);
  const conflictCandidates = [ (detectedSchema && detectedSchema.code), 'codigo', 'code', 'cod', 'codigo_barra', 'sku' ].filter(Boolean);
  const allowedCols = Array.isArray(detectedSchema.columns) && detectedSchema.columns.length > 0 ? detectedSchema.columns : null;
  let conflictCol = null;
  // Prefer a conflict column that actually exists in the DB schema
  if (allowedCols) {
    for (const c of conflictCandidates) { if (allowedCols.includes(c)) { conflictCol = c; break; } }
    // if none of the code-like candidates exist, prefer the primary id column if present
    if (!conflictCol && detectedSchema && detectedSchema.id && allowedCols.includes(detectedSchema.id)) {
      conflictCol = detectedSchema.id;
    }
  }
  // If we still don't have a safe conflict column, check the normalized payload keys as a last resort
  if (!conflictCol) {
    const sample = normalized && normalized.length > 0 ? normalized[0] : {};
    const sampleKeys = Object.keys(sample || {});
    for (const c of conflictCandidates) { if (sampleKeys.includes(c)) { conflictCol = c; break; } }
  }

  let useOnConflict = Boolean(conflictCol && allowedCols && allowedCols.includes(conflictCol));
  const url = useOnConflict ? base + `?on_conflict=${encodeURIComponent(conflictCol)}` : base;
  const headers = Object.assign({}, _headers(), { Prefer: 'resolution=merge-duplicates,return=representation' });
  const detectedSchema2 = detectedSchema;
  const allowedCols2 = allowedCols;
  let harmonized;
  if (allowedCols2) {
    harmonized = normalized.map(obj => {
      const o = {};
      allowedCols2.forEach(k => { o[k] = obj.hasOwnProperty(k) ? obj[k] : null; });
      return o;
    });
  } else {
    const allKeys = new Set();
    normalized.forEach(obj => Object.keys(obj).forEach(k => allKeys.add(k)));
    const keysArray = Array.from(allKeys);
    harmonized = normalized.map(obj => {
      const o = {};
      keysArray.forEach(k => { o[k] = (obj.hasOwnProperty(k) ? obj[k] : null); });
      return o;
    });
  }
  try {
    console.info('[supabase] saveProducts using on_conflict?', useOnConflict, 'col=', conflictCol);
    if (useOnConflict) {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(harmonized) });
      if (!res.ok) {
        const txt = await res.text().catch(()=>'');
        const err = new Error('Supabase upsert failed: ' + res.status + ' ' + txt);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      return data;
    }
    // No safe on_conflict available. If we have a primary id column, update per-item via PATCH, otherwise fall back to POST inserts.
    if (detectedSchema && detectedSchema.id && allowedCols && allowedCols.includes(detectedSchema.id)) {
      // perform PATCH per item by id
      const results = [];
      for (const item of harmonized) {
        const idVal = item[detectedSchema.id];
        if (idVal === undefined || idVal === null) {
          // insert new row
          const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify([item]) });
          if (!r.ok) { const txt = await r.text().catch(()=>''); throw new Error('Insert failed: ' + r.status + ' ' + txt); }
          const d = await r.json(); results.push(...(Array.isArray(d)?d:[d]));
        } else {
          // PATCH by primary key
          const patchUrl = `${base}?${encodeURIComponent(detectedSchema.id)}=eq.${encodeURIComponent(idVal)}`;
          const r = await fetch(patchUrl, { method: 'PATCH', headers, body: JSON.stringify(item) });
          if (!r.ok) { const txt = await r.text().catch(()=>''); throw new Error('Patch failed: ' + r.status + ' ' + txt); }
          const d = await r.json(); results.push(...(Array.isArray(d)?d:[d]));
        }
      }
      return results;
    }
    // Last resort: send inserts without on_conflict
    const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify(harmonized) });
    if (!r.ok) { const txt = await r.text().catch(()=>''); const err = new Error('Supabase insert failed: ' + r.status + ' ' + txt); err.status = r.status; throw err; }
    const d = await r.json();
    return d;
  } catch (upsertErr) {
    console.error('Supabase upsert failed and no safe fallback is available', upsertErr);
    throw upsertErr;
  }
}

try {
  window.__USE_SUPABASE = true;
  window.__SUPABASE = window.__SUPABASE || {};
  window.__SUPABASE.listProducts = listProducts;
  window.__SUPABASE.saveProducts = saveProducts;
} catch (e) {}

async function saveSingle(product) {
  if (!product || typeof product !== 'object') return null;
  const base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/products';
  const schema = window.__SUPABASE_SCHEMA || detectSchemaFromSample(product);
  const src = Object.assign({}, product);
  const out = {};
  if (src.id !== undefined) out[schema.id || 'id'] = src.id;
  if (src.name !== undefined) out[schema.name || 'name'] = src.name;
  if (src.producto !== undefined && !out[schema.name || 'name']) out[schema.name || 'name'] = src.producto;
  if (src.code !== undefined) out[schema.code || 'code'] = src.code;
  if (src.codigo !== undefined && !out[schema.code || 'code']) out[schema.code || 'code'] = src.codigo;
  if (src.qty !== undefined) out[schema.qty || 'qty'] = src.qty;
  if (src.stock !== undefined && out[schema.qty || 'qty'] === undefined) out[schema.qty || 'qty'] = src.stock;
  if (src.expiry !== undefined) out[schema.expiry || 'expiry'] = src.expiry;
  if (src.caducidad !== undefined && out[schema.expiry || 'expiry'] === undefined) out[schema.expiry || 'expiry'] = src.caducidad;
  // icon mapping
  if (src.icon !== undefined) out[schema.icon || 'icon'] = src.icon;
  if (src.icono !== undefined && !out[schema.icon || 'icon']) out[schema.icon || 'icon'] = src.icono;
  Object.keys(src).forEach(k => { if (!out.hasOwnProperty(k)) out[k] = src[k]; });
  // Choose a safe conflict column only if it exists in DB schema; otherwise we'll PATCH by id or fall back to inserts
  const conflictCandidates = [ (schema && schema.code), 'codigo', 'code', 'cod', 'codigo_barra', 'sku' ].filter(Boolean);
  const allowedCols = Array.isArray((window.__SUPABASE_SCHEMA && window.__SUPABASE_SCHEMA.columns) ? window.__SUPABASE_SCHEMA.columns : null) ? window.__SUPABASE_SCHEMA.columns : null;
  let conflictCol = null;
  if (allowedCols) {
    for (const c of conflictCandidates) { if (allowedCols.includes(c)) { conflictCol = c; break; } }
    if (!conflictCol && schema && schema.id && allowedCols.includes(schema.id)) conflictCol = schema.id;
  }
  const useOnConflict = Boolean(conflictCol && allowedCols && allowedCols.includes(conflictCol));
  const url = useOnConflict ? base + `?on_conflict=${encodeURIComponent(conflictCol)}` : base;
  const headers = Object.assign({}, _headers(), { Prefer: 'resolution=merge-duplicates,return=representation' });
  try {
    // If we have detected DB columns, only send those keys (fill missing with null)
    const detected = window.__SUPABASE_SCHEMA || detectSchemaFromSample(product);
    const allowed = Array.isArray(detected.columns) && detected.columns.length > 0 ? detected.columns : null;
    let payloadObj = out;
    if (allowed) {
      payloadObj = {};
      allowed.forEach(k => { payloadObj[k] = out.hasOwnProperty(k) ? out[k] : null; });
    }
    console.info('[supabase] saveSingle using on_conflict?', useOnConflict, 'col=', conflictCol);
    if (useOnConflict) {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify([payloadObj]) });
      if (!res.ok) {
        const txt = await res.text().catch(()=>'');
        const err = new Error('Supabase saveSingle failed: ' + res.status + ' ' + txt);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      return Array.isArray(data) ? data[0] : data;
    }
    // No safe on_conflict: if we have an id column, PATCH by id, otherwise POST insert
    if (schema && schema.id && allowedCols && allowedCols.includes(schema.id) && payloadObj[schema.id] !== undefined && payloadObj[schema.id] !== null) {
      const idVal = payloadObj[schema.id];
      const patchUrl = `${base}?${encodeURIComponent(schema.id)}=eq.${encodeURIComponent(idVal)}`;
      const r = await fetch(patchUrl, { method: 'PATCH', headers, body: JSON.stringify(payloadObj) });
      if (!r.ok) { const txt = await r.text().catch(()=>''); const err = new Error('Supabase patch failed: ' + r.status + ' ' + txt); err.status = r.status; throw err; }
      const d = await r.json();
      return Array.isArray(d) ? d[0] : d;
    }
    // last resort: insert without on_conflict
    const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify([payloadObj]) });
    if (!r.ok) { const txt = await r.text().catch(()=>''); const err = new Error('Supabase saveSingle insert failed: ' + r.status + ' ' + txt); err.status = r.status; throw err; }
    const d = await r.json();
    return Array.isArray(d) ? d[0] : d;
  } catch (e) {
    console.error('saveSingle error', e);
    throw e;
  }
}

try { if (window && window.__SUPABASE) window.__SUPABASE.saveSingle = saveSingle; } catch(e) {}

export { listProducts, saveProducts, saveSingle };
