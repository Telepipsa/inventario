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
  return data;
}

async function saveProducts(products) {
  // Upsert by `code` (or fallback to insert). This avoids deleting all rows.
  // Requires that `code` is unique or that you accept merging by that column.
  const base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/products';
  const payload = (Array.isArray(products) ? products : []);
  if (payload.length === 0) return [];

  // Normalize payload: ensure field names match table columns
  const normalized = payload.map(p => {
    const out = Object.assign({}, p);
    // common mappings used in this app
    if (out.producto && !out.name) out.name = out.producto;
    if (out.codigo && !out.code) out.code = out.codigo;
    if (out.caducidad && !out.expiry) out.expiry = out.caducidad;
    if (out.stock !== undefined && out.qty === undefined) out.qty = out.stock;
    return out;
  });

  // Use upsert via on_conflict=code and Prefer resolution=merge-duplicates
  const url = base + '?on_conflict=code';
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
    // If upsert fails (often because on_conflict references a non-unique column),
    // fallback to a delete+insert strategy. This requires that RLS allows DELETE/INSERT for anon key.
    console.warn('Supabase upsert error, attempting delete+insert fallback', upsertErr);
    try {
      // Attempt to DELETE all rows (only works if anon key has permission)
      const dres = await fetch(base, { method: 'DELETE', headers: _headers() });
      if (!dres.ok) {
        const txt = await dres.text().catch(()=>'');
        const err2 = new Error('Supabase delete fallback failed: ' + dres.status + ' ' + txt);
        err2.status = dres.status;
        throw err2;
      }
      // Insert payload
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
      // rethrow the original upsert error if fallback also fails
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
