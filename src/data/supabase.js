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
  // Simple replace-all: DELETE all rows then INSERT provided array
  // Requires RLS disabled or policies that allow anon key to delete/insert.
  const base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/products';
  // 1) DELETE all
  let dres = await fetch(base, { method: 'DELETE', headers: _headers() });
  if (!dres.ok) {
    const txt = await dres.text().catch(()=>'');
    const err = new Error('Supabase delete failed: ' + dres.status + ' ' + txt);
    err.status = dres.status;
    throw err;
  }
  // 2) INSERT many rows
  const payload = (Array.isArray(products) ? products : []);
  // attempt to map common field names to table columns if necessary
  const insertRes = await fetch(base, { method: 'POST', headers: Object.assign({}, _headers(), { Prefer: 'return=representation' }), body: JSON.stringify(payload) });
  if (!insertRes.ok) {
    const txt = await insertRes.text().catch(()=>'');
    const err = new Error('Supabase insert failed: ' + insertRes.status + ' ' + txt);
    err.status = insertRes.status;
    throw err;
  }
  const data = await insertRes.json();
  return data;
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
