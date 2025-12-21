import { renderTable, bindRowEvents, getSelectedIndexes } from '../src/components/table.js';
import { fillForm, readForm, bindFormActions } from '../src/components/productForm.js';
import { openModal, closeModal, bindModal } from '../src/components/modal.js';
import { loadProducts, saveProducts } from '../src/data/storage.js';
import { isTodayOrPast } from '../src/services/expiry.js';
import { importFile } from '../src/data/import.js';
// Try to load the Supabase wrapper dynamically using an absolute path so it
// reliably loads in the browser environment. This sets `window.__SUPABASE`.
(function loadSupabaseWrapper(){
  // Try several candidate paths and provide detailed diagnostics so we can
  // determine why `window.__SUPABASE` might be undefined in the browser.
  (async function() {
    const candidates = [
      './supabase.js',        // when app.js is served from /public, this resolves to /public/supabase.js
      '/supabase.js',         // when server root is public/, this resolves correctly
      '/public/supabase.js',  // when server root is project root
      '/src/data/supabase.js',
      './src/data/supabase.js',
      '../src/data/supabase.js',
      '/public/src/data/supabase.js'
    ];
    let lastErr = null;
    for (const p of candidates) {
      try {
        console.info('[supabase] attempting dynamic import from', p);
        const mod = await import(p);
        console.info('[supabase] module imported from', p, 'module keys:', Object.keys(mod));
        // If the module didn't set window.__SUPABASE, populate it from exports.
        try {
          if (!window.__SUPABASE) window.__SUPABASE = {};
          if (!window.__USE_SUPABASE) window.__USE_SUPABASE = true;
          if (!window.__SUPABASE.listProducts && typeof mod.listProducts === 'function') window.__SUPABASE.listProducts = mod.listProducts;
          if (!window.__SUPABASE.saveProducts && typeof mod.saveProducts === 'function') window.__SUPABASE.saveProducts = mod.saveProducts;
          if (!window.__SUPABASE.saveSingle && typeof mod.saveSingle === 'function') window.__SUPABASE.saveSingle = mod.saveSingle;
        } catch (e) {
          console.warn('[supabase] could not attach exports to window', e);
        }
        // Small deferred check to log final presence
        setTimeout(() => {
          try { console.info('[supabase] final window.__SUPABASE keys:', window.__SUPABASE ? Object.keys(window.__SUPABASE) : 'undefined'); } catch(e){}
        }, 200);
        return;
      } catch (err) {
        lastErr = err;
        console.warn('[supabase] import failed for', p, err && err.message ? err.message : err);
      }
    }
    console.error('[supabase] all dynamic import attempts failed. last error:', lastErr);
    // As a last-resort fallback, inject a module <script> tag for each candidate
    // This helps when dynamic import is blocked by server config but script tags are allowed.
    for (const p of candidates) {
      try {
        console.info('[supabase] injecting module script fallback for', p);
        const s = document.createElement('script');
        s.type = 'module';
        s.src = p;
        document.head.appendChild(s);
        // wait briefly for the module to execute and set window.__SUPABASE
        await new Promise(res => setTimeout(res, 350));
        if (window.__SUPABASE && typeof window.__SUPABASE.listProducts === 'function') {
          console.info('[supabase] loaded via script tag fallback from', p);
          return;
        }
      } catch (e) {
        console.warn('[supabase] script tag fallback failed for', p, e && e.message ? e.message : e);
      }
    }
    console.error('[supabase] module could not be loaded by any method');
  })();
})();

console.log('✅ app.js cargado correctamente');

// Normalize product names: remove accents/diacritics, punctuation, extra spaces and lowercase
function normalizeName(s) {
  if (!s) return '';
  try {
    return s.toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^0-9a-zA-Z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  } catch (e) { return s.toString().trim().toLowerCase(); }
}

// Ensure API base is normalized to an origin (protocol + host[:port])
function getApiBaseOrigin(raw) {
  const val = (raw || window.__API_BASE || '').toString().trim();
  if (!val) return '';
  try {
    const u = new URL(val);
    return u.origin;
  } catch (e) {
    // fallback: strip common API path segments and trailing slash
    return val.replace(/\/api\/products\/?$/i, '').replace(/\/$/, '');
  }
}

const fileButton = document.getElementById('fileButton');
const fileInput = document.getElementById('fileInput');
const searchInput = document.getElementById('searchInput');
const clearCacheBtn = document.getElementById('clearCacheBtn');
// Tag filter controls (above table)
const tagFilterSeco = document.getElementById('tagFilterSeco');
const tagFilterCongelado = document.getElementById('tagFilterCongelado');
const tagFilterFresco = document.getElementById('tagFilterFresco');
const tagFilterBebida = document.getElementById('tagFilterBebida');
const tagFilterHelados = document.getElementById('tagFilterHelados');
// Default API key for your personal server (used automatically when missing)
const DEFAULT_API_KEY = '98150e30a8d0945c90fae1f68999a7a9';
const forceSyncBtn = document.getElementById('forceSyncBtn');
const adminBtn = document.getElementById('adminBtn');
const installBtn = document.getElementById('installBtn');
const whatsappNotifyBtn = document.getElementById('whatsappNotifyBtn');
const editMultipleBtn = document.getElementById('editMultipleBtn');

// PWA install handling: show `installBtn` when `beforeinstallprompt` fires (Chrome/Android)
let deferredPrompt = null;
const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
const isInStandaloneMode = ('standalone' in window.navigator) && window.navigator.standalone;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  deferredPrompt = e;
  try { if (installBtn) installBtn.style.display = ''; } catch(e) {}
});

if (installBtn) {
  // For iOS show the install button too (will show instructions on click)
  if (isIos && !isInStandaloneMode) installBtn.style.display = '';
  installBtn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    // If we have the deferred prompt (Chrome/Android)
    if (deferredPrompt) {
      try { deferredPrompt.prompt(); } catch(e) {}
      try {
        const choice = await deferredPrompt.userChoice;
        // hide the install button after choice
        deferredPrompt = null;
        installBtn.style.display = 'none';
      } catch (e) {
        deferredPrompt = null;
      }
      return;
    }
    // Fallback for iOS Safari: show quick instructions
    if (isIos && !isInStandaloneMode) {
      try {
        alert('Para instalar en iOS: toca el icono de compartir (abajo) y elige "Añadir a pantalla de inicio".');
      } catch (e) {}
      return;
    }
  });
}

window.addEventListener('appinstalled', () => {
  // hide install button if installed
  try { if (installBtn) installBtn.style.display = 'none'; } catch(e) {}
  deferredPrompt = null;
});

// WhatsApp notify: compose message for up to 5 products nearest to expiry (or expired)
function formatIsoDate(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    // return as dd/mm/yyyy
    const day = String(dt.getDate()).padStart(2,'0');
    const month = String(dt.getMonth()+1).padStart(2,'0');
    const year = dt.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) { return String(d); }
}

function composeWhatsAppForProducts(products) {
  if (!Array.isArray(products)) return '';
  const today = new Date();
  // convert caducidad to comparable date (missing dates -> far future)
  const enriched = products.map(p => {
    let dt = null;
    try { if (p && p.caducidad) dt = new Date(p.caducidad); } catch(e) { dt = null; }
    const expiryValid = dt && !Number.isNaN(dt.getTime());
    // compute midnight versions to do date-only comparisons (no time component)
    let isExpired = false;
    let sortKey = Number.MAX_SAFE_INTEGER;
    if (expiryValid) {
      const dtMid = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
      const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      isExpired = dtMid.getTime() < todayMid.getTime(); // strictly before today
      sortKey = dtMid.getTime();
      // keep dt normalized to midnight for later formatting/compute
      dt = dtMid;
    }
    return Object.assign({}, p, { _expiryDate: dt, _isExpired: isExpired, _sortKey: sortKey });
  });
  // sort by soonest expiry (expired first), then take 5
  enriched.sort((a,b) => (a._sortKey - b._sortKey));
  // keep only items that have a valid expiry date (or expired)
  const valid = enriched.filter(p => p._expiryDate && !Number.isNaN(p._expiryDate.getTime()));
  const pick = valid.slice(0,5);
  if (pick.length === 0) return '';
  const lines = [];
  lines.push('Productos caducados / próximos a caducar:');
    const msPerDay = 24 * 60 * 60 * 1000;
  for (const p of pick) {
    const name = p.producto || p.name || p.producto_nombre || p.producto || p.codigo || 'Producto';
    const dt = p._expiryDate;
    const dateStr = formatIsoDate(dt);
    // compute day-difference between expiry midnight and today midnight
    const todayMid = new Date(); todayMid.setHours(0,0,0,0);
    const dtMid = dt ? new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()) : null;
    const daysDiff = dtMid ? Math.round((dtMid.getTime() - todayMid.getTime()) / msPerDay) : null;
    if (p._isExpired) {
      // wrap CADUCADO in asterisks for WhatsApp bold
      lines.push(`"${name}" *CADUCADO*  - Revisar nuevo stock`);
    } else {
      if (daysDiff === 0) {
        // Expires today — show a clearer message instead of "Quedan 0 días"
        lines.push(`"${name}" *${dateStr}* - Caduca hoy`);
      } else {
        const plural = Math.abs(daysDiff) === 1 ? 'día' : 'días';
        // wrap date in asterisks for WhatsApp bold
        lines.push(`"${name}" *${dateStr}* - Quedan ${daysDiff} ${plural}`);
      }
    }
  }
  lines.push('— Enviado desde Inventario');
  return lines.join('\n');
}

// Robust clipboard copy helper with fallbacks for older mobile browsers
async function copyTextToClipboard(text) {
  if (!text) return false;
  // Try modern API first
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // fall through to legacy method
  }

  // Legacy fallback using a textarea + execCommand
  try {
    const ta = document.createElement('textarea');
    // iOS requires element to be selectable and in the DOM
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    // selection for iOS
    ta.focus();
    ta.select();
    try { ta.setSelectionRange(0, ta.value.length); } catch (e) {}
    const ok = document.execCommand && document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch (e) {
    return false;
  }
}

if (whatsappNotifyBtn) {
  whatsappNotifyBtn.addEventListener('click', async (e) => {
    try {
      const products = window.__products || [];
      const message = composeWhatsAppForProducts(products);
      if (!message) { alert('No hay productos con fecha de caducidad para enviar.'); return; }

      // Try to copy to clipboard (centralized helper with fallbacks)
      let copied = false;
      try {
        copied = await copyTextToClipboard(message);
      } catch (e) { copied = false; }

      if (copied) {
        try { showToast('Mensaje copiado al portapapeles. Ábrelo en WhatsApp y pega en el grupo.', 3000, 'success'); } catch(e){}
      } else {
        // If we couldn't copy, present the message in a prompt for manual copy
        try { prompt('Copia el siguiente mensaje (Ctrl+C) y pégalo en tu grupo de WhatsApp:', message); } catch(e){}
      }

      // Finally open WhatsApp: prefer native app on mobile, fallback to wa.me / api.whatsapp.com
      const encoded = encodeURIComponent(message);
      try {
        const ua = navigator.userAgent || '';
        const isMobile = /android|iphone|ipad|ipod/i.test(ua);
        if (isMobile) {
          // Try to open native app first. Some browsers will handle this and switch apps.
          try {
            const appUrl = `whatsapp://send?text=${encoded}`;
            // open in new tab/window — on many mobile browsers this will trigger the app
            window.open(appUrl, '_blank');
          } catch (e) {
            // ignore and fall through to web fallback
          }
          // If the native attempt didn't work (or was blocked), open wa.me after a short delay
          setTimeout(() => {
            try { window.open(`https://wa.me/?text=${encoded}`, '_blank'); } catch(e) {
              try { window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank'); } catch(_) {}
            }
          }, 600);
        } else {
          // Desktop / non-mobile: open web interface
          try { window.open(`https://wa.me/?text=${encoded}`, '_blank'); } catch(e) {
            try { window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank'); } catch(_) {}
          }
        }
      } catch (err) {
        // last-resort: open wa.me
        try { window.open(`https://wa.me/?text=${encoded}`, '_blank'); } catch(e) { /* ignore */ }
      }
    } catch (err) { console.error('whatsapp notify failed', err); alert('No se pudo componer el mensaje de WhatsApp (revisa consola)'); }
  });
}

// Broadcast channel for intra-browser/tab sync (fallback to polling across devices)
const bc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('inventario-sync') : null;

function revealAdminControls() {
  try {
    document.querySelectorAll('.admin-hidden').forEach(el => el.classList.remove('admin-hidden'));
  } catch (e) { console.warn('revealAdminControls error', e); }
  if (adminBtn) adminBtn.style.display = 'none';
  try {
    // mark admin flag so other code can check
    window.__isAdmin = true;
    const pfCodigo = document.getElementById('pfCodigo');
    if (pfCodigo) pfCodigo.disabled = false;
  } catch(e) {}
}

// only bind if not already bound by the inline fallback (prevents double prompt)
if (adminBtn && !(adminBtn.dataset && adminBtn.dataset.adminBound)) {
  adminBtn.addEventListener('click', () => {
    const pw = prompt('Introduce la contraseña de admin:');
    if (pw === null) return; // user cancelled
    if (String(pw) === '1494') {
      revealAdminControls();
    } else {
      // incorrect password: silent
    }
  });
  try { adminBtn.dataset.adminBound = '1'; } catch(e) {}
}

let products = [];
let currentMultiEdit = false;
let currentMultiIndexes = [];

// Attempt to load from a central API if configured (set window.__API_BASE = 'http://host:port')
async function serverLoadProducts() {
  // If a Supabase client wrapper is available, use it
  try {
    if (window.__USE_SUPABASE && window.__SUPABASE && typeof window.__SUPABASE.listProducts === 'function') {
      return await window.__SUPABASE.listProducts();
    }
  } catch (e) {
    console.warn('supabase listProducts failed, falling back to API', e);
  }
  const base = getApiBaseOrigin(window.__API_BASE);
  if (!base) throw new Error('No API base');
  const res = await fetch(base + '/api/products');
  if (!res.ok) throw new Error('Failed to fetch from server');
  return await res.json();
}

async function serverSaveProducts(p) {
  // If a Supabase client wrapper is available, use it
  try {
    if (window.__USE_SUPABASE && window.__SUPABASE && typeof window.__SUPABASE.saveProducts === 'function') {
      return await window.__SUPABASE.saveProducts(p);
    }
  } catch (e) {
    console.warn('supabase saveProducts failed, falling back to API', e);
  }
  const base = getApiBaseOrigin(window.__API_BASE);
  if (!base) throw new Error('No API base');
  const headers = { 'Content-Type': 'application/json' };
  // prefer in-memory API key, fallback to localStorage (in case user cleared state)
  const apiKey = window.__API_KEY || (localStorage && localStorage.getItem && localStorage.getItem('API_KEY'));
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(base + '/api/products', { method: 'POST', headers, body: JSON.stringify(p) });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`Failed to save to server: ${res.status} ${txt}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

// wrapper to save locally and optionally push to server
function syncSave(p) {
  saveProducts(p);
  // notify other tabs/devices in same origin
  try { if (bc) bc.postMessage({ type: 'products-updated', products: p }); } catch(e) {}

  if (window.__API_BASE) {
    serverSaveProducts(p).then(() => console.info('[sync] saved to server')).catch(e => {
      console.warn('[sync] server save failed', e);
      // show user-visible toast for failures; special message when unauthorized
      if (e && e.status === 401) {
        // Automatically set a default API key for your personal use, persist it, and retry once
        showToast('Sincronización falló: 401 No autorizado — reintentando con API Key conocida', 3500, 'error');
            try {
              // If unauthorized, attempt one retry with known key but remain silent about automatic changes
              const existing = window.__API_KEY || (localStorage && localStorage.getItem && localStorage.getItem('API_KEY'));
              const k = existing || DEFAULT_API_KEY;
              if (k) {
                try { localStorage.setItem('API_KEY', k); } catch(e2) { console.warn('Could not write API_KEY to localStorage', e2); }
                window.__API_KEY = k;
                // retry once
                serverSaveProducts(p).then(() => {
                  console.info('[sync] saved to server after auto-setting API key');
                  try { if (bc) bc.postMessage({ type: 'products-updated', products: p }); } catch(e) {}
                }).catch(err2 => {
                  console.warn('[sync] retry after auto API key failed', err2);
                });
              }
            } catch (setErr) { console.warn('Auto-set API key failed', setErr); }
      } else {
        showToast('Sincronización falló: no se pudieron guardar los productos en el servidor', 5000, 'error');
      }
    });
  }
}

// Poll server periodically for changes and update UI when different
let _pollIntervalId = null;
function startServerPoll(intervalSec = 45) {
  if (_pollIntervalId) clearInterval(_pollIntervalId);
  _pollIntervalId = setInterval(async () => {
    if (!window.__API_BASE) return;
    try {
      const remote = await serverLoadProducts();
      if (!Array.isArray(remote)) return;
      const localStr = JSON.stringify(window.__products || []);
      const remoteStr = JSON.stringify(remote || []);
      if (localStr !== remoteStr) {
        products = remote;
        saveProducts(products);
        window.__products = products;
        try { if (typeof renderAndBind === 'function') renderAndBind(); } catch(e) { console.warn('render after poll failed', e); }
        try { if (bc) bc.postMessage({ type: 'products-updated', products: products }); } catch(e) {}
      }
    } catch (e) {
      // ignore polling errors
    }
  }, Math.max(1000, intervalSec) * 1000);
}

// trigger immediate fetch on visibility change (when tab becomes active)
document.addEventListener('visibilitychange', () => {
  // When the tab becomes visible, re-fetch from server if we have a server or Supabase
  if (document.visibilityState === 'visible' && (window.__API_BASE || window.__USE_SUPABASE)) {
    (async () => {
      try {
        const remote = await serverLoadProducts();
        if (Array.isArray(remote)) {
          const localStr = JSON.stringify(window.__products || []);
          const remoteStr = JSON.stringify(remote || []);
          if (localStr !== remoteStr) {
            products = remote;
            saveProducts(products);
            window.__products = products;
            try { if (typeof renderAndBind === 'function') renderAndBind(); } catch(e) {}
          }
        }
      } catch (e) {}
    })();
  }
});

// Shared helper: try to load products from server (used by the "Cargar" button and on startup)
async function loadProductsFromServerPreferRemote() {
  showLoading('Cargando productos desde servidor...');
  try {
    // if no API_BASE is configured, attempt the known public server once
    if (!window.__API_BASE) {
      try {
        const known = 'https://inventario-zrlk.onrender.com';
        const r = await fetch(known.replace(/\/$/, '') + '/api/products', { cache: 'no-cache' });
        if (r.ok) {
          window.__API_BASE = known.replace(/\/$/, '');
          try { localStorage.setItem('API_BASE', window.__API_BASE); } catch(e) {}
        }
      } catch (err) { /* ignore, will fallback to local */ }
    }
    if (!window.__API_BASE) throw new Error('No API_BASE');
    const remote = await serverLoadProducts();
    if (!Array.isArray(remote) || remote.length === 0) throw new Error('Empty remote response');
    products = remote;
    // normalize code-like fields
    try { products.forEach(p => { if (p && typeof p === 'object') { if (p.codigo) p.codigo = String(p.codigo).trim(); if (p.predeterminado) p.predeterminado = String(p.predeterminado).trim(); if (p.code) p.code = String(p.code).trim(); } }); } catch (e) {}
    // Persist fetched remote list to local cache but do NOT re-push the same remote back to the server.
    try { saveProducts(products); } catch(e) { console.warn('saveProducts local cache failed', e); }
    window.__products = products;
    try { if (typeof renderAndBind === 'function') renderAndBind(); } catch(e) { console.warn('render after server load failed', e); }
    showToast(`Cargados ${products.length} productos desde servidor`, 2000, 'success');
    return true;
  } catch (err) {
    console.warn('server load failed', err);
    return false;
  } finally {
    hideLoading();
  }
}

// Listen to BroadcastChannel updates from other tabs
if (bc) {
  bc.onmessage = (ev) => {
    try {
      const msg = ev.data;
      if (!msg || msg.type !== 'products-updated') return;
      const remote = msg.products || [];
      const localStr = JSON.stringify(window.__products || []);
      const remoteStr = JSON.stringify(remote || []);
      if (localStr !== remoteStr) {
        products = remote;
        saveProducts(products);
        window.__products = products;
        try {
          const t = document.getElementById('tableSearchInput');
          const q = t && t.value ? t.value : (searchInput && searchInput.value ? searchInput.value : '');
          filterAndRender(q);
        } catch(e) { try { if (typeof renderAndBind === 'function') renderAndBind(); } catch(_){} }
      }
    } catch (e) { console.warn('bc.onmessage failed', e); }
  };
}

// Clear service worker, caches, localStorage/sessionStorage and reload the page
async function clearAppCacheAndReload() {
  if (!confirm('¿Borrar caché, service worker y datos locales? Se recargará la app.')) return;
  showToast('Limpiando caché y datos locales...', 2500, '');
  try {
    // unregister service workers
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(()=>{})));
    }
    // delete caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k).catch(()=>{})));
    }
    // clear storage
    try { localStorage.clear(); } catch(e) {}
    try { sessionStorage.clear(); } catch(e) {}
    // small delay to let unregisters settle
    setTimeout(() => {
      try { showToast('Recargando...', 1000, 'success'); } catch(e){}
      location.reload();
    }, 600);
  } catch (err) {
    console.error('clearAppCache failed', err);
    showToast('Error limpiando caché (revisa consola)', 4000, 'error');
  }
}

if (clearCacheBtn) clearCacheBtn.addEventListener('click', clearAppCacheAndReload);
if (forceSyncBtn) forceSyncBtn.addEventListener('click', async () => {
  if (!confirm('¿Forzar sincronización con el servidor ahora? Esto intentará subir los productos locales.')) return;
  showToast('Forzando sincronización...', 2000, '');
  try {
    const local = window.__products || [];
    await serverSaveProducts(local);
    showToast('Sincronización forzada completada', 2500, 'success');
  } catch (err) {
    console.error('forceSync failed', err);
    if (err && err.status === 401) showToast('Forzar sync falló: 401 No autorizado — revisa API Key', 5000, 'error');
    else showToast('Forzar sync falló (revisa consola)', 4000, 'error');
  }
});

(async function initProducts() {
  // load server config from localStorage if present (and attempt auto-detect)
  try { loadServerConfig(); } catch (e) { console.warn('loadServerConfig failed', e); }

  // If a Supabase wrapper is available, always load products from the DB
  // and skip any local/file fallbacks. This enforces DB-only loads as requested.
  try {
    if (window.__USE_SUPABASE && window.__SUPABASE && typeof window.__SUPABASE.listProducts === 'function') {
      try {
        showLoading('Cargando productos desde la base de datos...');
      } catch (e) {}
      try {
        const remote = await window.__SUPABASE.listProducts();
        if (Array.isArray(remote)) {
          products = remote;
          window.__products = products;
          try { if (typeof renderAndBind === 'function') renderAndBind(); } catch(e) { console.warn('render after supabase init failed', e); }
        }
      } catch (e) {
        console.warn('[supabase] initial load failed', e);
      } finally {
        try { hideLoading(); } catch (e) {}
      }
      return; // do not proceed to any local/file fallbacks
    }
  } catch (e) { console.warn('supabase detection failed', e); }

  // On first load, prefer the same server-loading logic used by the "Cargar" button.
  // This ensures the initial load behaves identically to when the user presses the button.
  try {
    const ok = await loadProductsFromServerPreferRemote();
    if (ok) return; // loaded and rendered
  } catch (e) { /* ignore and continue with auto-detect/fallbacks */ }
  // If no API_BASE configured and we don't have Supabase, try to auto-detect a server on the same origin
  if (!window.__API_BASE && !window.__USE_SUPABASE) {
    try {
      const tryUrl = window.location.origin.replace(/\/$/, '') + '/api/products';
      const r = await fetch(tryUrl, { cache: 'no-cache' });
      if (r.ok) {
        // server present on same origin — use it by default (no API key assumed)
        window.__API_BASE = window.location.origin.replace(/\/$/, '');
        localStorage.setItem('API_BASE', window.__API_BASE);
        console.info('[auto-detect] API_BASE set to', window.__API_BASE);
        const remote = await r.json();
        if (Array.isArray(remote) && remote.length > 0) {
          products = remote;
          saveProducts(products); // keep local cache
        }
      }
    } catch (e) {
      // ignore — no server on same origin
      console.info('[auto-detect] no server detected on same origin', e && e.message);
    }
  }
    // Try to load from server automatically on startup (prefer remote over local)
    async function tryAutoServerLoad() {
      showLoading('Cargando productos desde servidor...');
      // If no API_BASE configured and we don't have Supabase, probe a known public server once
      try {
        if (!window.__API_BASE && !window.__USE_SUPABASE) {
        try {
          const known = 'https://inventario-zrlk.onrender.com';
          const tryUrl = known.replace(/\/$/, '') + '/api/products';
          const r = await fetch(tryUrl, { cache: 'no-cache' });
          if (r.ok) {
              window.__API_BASE = known.replace(/\/$/, '');
              // Persist base and user API key so app can auto-sync on startup
              localStorage.setItem('API_BASE', window.__API_BASE);
              // User-provided API key (set per user's request)
              const knownApiKey = '98150e30a8d0945c90fae1f68999a7a9';
              window.__API_KEY = knownApiKey;
              localStorage.setItem('API_KEY', knownApiKey);
              console.info('[auto-fallback] API_BASE/API_KEY set to', window.__API_BASE);
              const remote = await r.json();
              if (Array.isArray(remote) && remote.length > 0) {
                products = remote;
                saveProducts(products);
                return true;
              }
              // If remote is empty but we have local products, push them to the server
              try {
                const local = loadProducts();
                if (Array.isArray(local) && local.length > 0) {
                  await serverSaveProducts(local);
                  console.info('[auto-fallback] pushed local products to server');
                  // reload from server to confirm
                  const confirmRemote = await fetch(window.__API_BASE + '/api/products');
                  if (confirmRemote.ok) {
                    const list = await confirmRemote.json();
                    if (Array.isArray(list) && list.length > 0) {
                      products = list;
                      saveProducts(products);
                      return true;
                    }
                  }
                }
              } catch (e) { console.warn('[auto-fallback] push local -> server failed', e); }
          }
        } catch (e) {
          console.info('[auto-fallback] known server not reachable', e && e.message);
        }
      }
        // If API_BASE is configured, try to load from it
            if (window.__API_BASE) {
          try {
            const remote = await serverLoadProducts();
            if (Array.isArray(remote) && remote.length > 0) {
              products = remote;
              saveProducts(products); // keep local cache
              return true;
            }
              } catch (e) { console.info('Could not load products from API:', e); }
        }
      } finally {
        hideLoading();
      }
      return false;
    }

    await tryAutoServerLoad();
  if (!products || !Array.isArray(products) || products.length === 0) {
    products = loadProducts();
    // If still empty, keep products as an empty array — do not inject sample data.
    if (!products || !Array.isArray(products)) products = [];
  }
  // normalize code fields (trim whitespace) so table/form show them correctly
  try {
    products.forEach(p => {
      if (!p || typeof p !== 'object') return;
      if (p.codigo) p.codigo = p.codigo.toString().trim();
      if (p.code) p.code = p.code.toString().trim();
      if (p.Codigo) p.Codigo = p.Codigo.toString().trim();
    });
  } catch (e) { console.warn('code normalization failed', e); }

  // expose globally
  window.__products = products;
  // ensure UI reflects loaded products (init may run before initial render)
  try { if (typeof renderAndBind === 'function') renderAndBind(); } catch (e) { console.warn('render after init failed', e); }
  // ensure codigo input is disabled by default unless admin
  try { const pf = document.getElementById('pfCodigo'); if (pf) pf.disabled = !window.__isAdmin; } catch(e) {}
})();

// start polling loop to sync from server periodically (no-op until API_BASE set)
(function(){
  try { startServerPoll(45); } catch(e) { /* ignore */ }
})();

// expose products globally for component utilities (used for mapping selections)
window.__products = products;

// History stack for undo operations (supports multiple undos)
const HISTORY_MAX = 100;
const historyStack = [];
window.__history = historyStack;

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function sortForDisplay(list) {
  if (!list || !Array.isArray(list)) return list || [];
  const now = new Date();
  const startOfToday = new Date(now.toISOString().slice(0,10));
  function toTime(v) {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d)) return null;
    return d.getTime();
  }
  return list.slice().sort((a,b) => {
    const aTime = toTime(a.caducidad);
    const bTime = toTime(b.caducidad);
    const aExpired = isTodayOrPast(a.caducidad);
    const bExpired = isTodayOrPast(b.caducidad);
    // expired first
    if (aExpired && !bExpired) return -1;
    if (!aExpired && bExpired) return 1;
    // both expired -> show closest to today first (most recently expired)
    if (aExpired && bExpired) {
      if (aTime == null && bTime == null) return 0;
      if (aTime == null) return 1;
      if (bTime == null) return -1;
      return bTime - aTime; // descending (closer to now first)
    }
    // both not expired -> show soonest expiry first
    if (aTime == null && bTime == null) {
      // fallback to name
      const an = (a.producto || '').toString().toLowerCase();
      const bn = (b.producto || '').toString().toLowerCase();
      return an < bn ? -1 : (an > bn ? 1 : 0);
    }
    if (aTime == null) return 1;
    if (bTime == null) return -1;
    return aTime - bTime;
  });
}

// Bind stock-change event handlers to visible controls
function bindStockControls() {
  document.querySelectorAll('.stock-controls').forEach(el => {
    // remove any existing to avoid duplicate handlers
    try { el.removeEventListener && el.removeEventListener('stock-change', el._stockHandler); } catch(e) {}
    const handler = (ev) => {
      const delta = ev.detail && typeof ev.detail.delta === 'number' ? ev.detail.delta : undefined;
      if (typeof delta !== 'number') return;
      const globalIdxAttr = ev.currentTarget && ev.currentTarget.dataset ? ev.currentTarget.dataset.globalIndex : undefined;
      let gi = (globalIdxAttr !== undefined && globalIdxAttr !== '') ? +globalIdxAttr : null;
      if ((gi === null || Number.isNaN(gi)) && ev.detail && typeof ev.detail.index === 'number') gi = ev.detail.index;
      if (gi === null || Number.isNaN(gi)) return;
      const item = products[gi];
      if (!item) return;
      const before = deepClone(item);
      const cur = Number(item.stock ?? 0);
      const next = Math.max(0, cur + delta);
      products[gi].stock = next;
      const afterState = deepClone(products[gi]);
      pushHistory({ type: 'edit', index: gi, before: before, after: afterState, changes: computeChanges(before, afterState) });
      syncSave(products);
      window.__products = products;
      // preserve current filter/search when re-rendering
      try {
        const t = document.getElementById('tableSearchInput');
        const q = t && t.value ? t.value : (searchInput && searchInput.value ? searchInput.value : '');
        filterAndRender(q);
      } catch(e) { try { if (typeof renderAndBind === 'function') renderAndBind(); } catch(_){} }
    };
    // store handler for potential future removal
    el._stockHandler = handler;
    el.addEventListener('stock-change', handler);
  });
}

// Update Edit-Multiple button enabled state based on selected rows
function updateEditMultipleButton() {
  try {
    if (!editMultipleBtn) return;
    const sel = getSelectedIndexes();
      // enable when at least one unique item is selected (allow editing any number)
      const unique = Array.isArray(sel) ? Array.from(new Set(sel)) : [];
      editMultipleBtn.disabled = !(unique.length >= 1);
  } catch (e) { /* ignore */ }
}

// Listen for selection changes (row checkboxes and selectAll)
document.addEventListener('change', (e) => {
  try {
    const t = e.target;
    if (!t) return;
    if (t.matches && (t.matches('.row-check') || t.id === 'selectAll')) {
      updateEditMultipleButton();
    }
  } catch (err) {}
});

// Bind edit-multiple button click
if (editMultipleBtn) {
  editMultipleBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    let idxs = getSelectedIndexes();
    const unique = Array.isArray(idxs) ? Array.from(new Set(idxs)) : [];
    if (unique.length < 1) { showToast('Selecciona al menos 1 producto para editar en lote', 2500, 'error'); return; }
    currentMultiEdit = true;
    currentMultiIndexes = unique;
    // prepare modal: clear codigo/nombre and disable them; clear other fields
    try {
      const pfCodigo = document.getElementById('pfCodigo');
      const pfName = document.getElementById('pfName');
      const pfStock = document.getElementById('pfStock');
      const pfExpiry = document.getElementById('pfExpiry');
      const pfIcon = document.getElementById('pfIcon');
      const preview = document.getElementById('pfIconPreview');
      if (pfCodigo) { pfCodigo.value = ''; pfCodigo.disabled = true; }
      if (pfName) { pfName.value = ''; pfName.disabled = true; }
      if (pfStock) pfStock.value = '';
      if (pfExpiry) pfExpiry.value = '';
      if (pfIcon) pfIcon.value = '';
      if (preview) preview.src = './public/icons/icon-192.png';
      // uncheck tipo checkboxes
      const tSec = document.getElementById('pfTagSeco');
      const tCong = document.getElementById('pfTagCongelado');
      const tFres = document.getElementById('pfTagFresco');
      if (tSec) tSec.checked = false;
      if (tCong) tCong.checked = false;
      if (tFres) tFres.checked = false;
      // hide delete button for multi-edit
      const del = document.getElementById('pfDelete'); if (del) del.style.display = 'none';
      // change modal title
      const hdr = document.querySelector('#productForm h2'); if (hdr) hdr.textContent = 'Editar varios productos';
    } catch (err) { console.warn('prepare multi-edit modal failed', err); }
    // open centered modal
    try { openModal(); } catch(e) { openModal(); }
  });
}

function computeChanges(before, after) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changes = [];
  fields.forEach(f => {
    const bv = before ? before[f] : undefined;
    const av = after ? after[f] : undefined;
    if (f === 'stock') {
      const bnum = Number(bv ?? 0);
      const anum = Number(av ?? 0);
      if (bnum !== anum) changes.push({ field: 'stock', before: bnum, after: anum, delta: anum - bnum });
    } else if (String(bv) !== String(av)) {
      changes.push({ field: f, before: bv, after: av });
    }
  });
  return changes;
}

function pushHistory(entry) {
  // entry should be a plain object describing how to undo
  historyStack.push(entry);
  if (historyStack.length > HISTORY_MAX) historyStack.shift();
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById('undoBtn');
  if (!btn) return;
  btn.disabled = historyStack.length === 0;
  btn.title = historyStack.length > 0 ? `Deshacer (${historyStack.length})` : 'Nada que deshacer';
}

function historyEntryDescription(entry) {
  if (!entry || !entry.type) return 'Acción desconocida';
  if (entry.type === 'add') return `Añadido: ${entry.item && entry.item.producto ? entry.item.producto : 'producto'}`;
  if (entry.type === 'delete') {
    const names = (entry.items || []).map(i => i.item && i.item.producto).filter(Boolean);
    if (names.length === 1) return `Eliminado: ${names[0]}`;
    return `Eliminados: ${(entry.items || []).length} producto(s)`;
  }
  if (entry.type === 'edit') {
    const changes = entry.changes || [];
    const name = (entry.after && entry.after.producto) || (entry.before && entry.before.producto) || '';
    if (changes.length === 0) return `Editado: ${name || 'producto'}`;
    // produce compact phrases
    const parts = changes.map(c => {
      if (c.field === 'stock') {
        const d = c.delta || (Number(c.after || 0) - Number(c.before || 0));
        return `Stock ${d > 0 ? '+'+d : d}`;
      }
      if (c.field === 'producto') return `Nombre`; 
      if (c.field === 'caducidad') return `Caducidad`;
      if (c.field === 'icon') return `Icono`;
      return c.field;
    });
    return `${name ? name + ': ' : ''}${parts.join(', ')} modificado(s)`;
  }
  if (entry.type === 'edit-multiple') {
    const changes = entry.changes || [];
    return `Productos: ${changes.length}`;
  }
  if (entry.type === 'edit-multiple') {
    const changes = entry.changes || [];
    if (changes.length === 0) return 'Editados varios productos';
    const names = changes.map(c => (c.after && c.after.producto) || (c.before && c.before.producto)).filter(Boolean);
    if (names.length <= 3) return `Editados: ${names.join(', ')}`;
    return `Editados: ${names.slice(0,3).join(', ')} (+${names.length-3} más)`;
  }
  if (entry.type === 'edit-multiple') {
    const changes = entry.changes || [];
    // restore each before state
    changes.forEach(c => {
      if (c && typeof c.index === 'number' && c.before) {
        if (c.index >= 0 && c.index < products.length) products[c.index] = deepClone(c.before);
      }
    });
    return;
  }
  if (entry.type === 'import') {
    const added = (entry.changes || []).filter(c => c.kind === 'added').length;
    const updated = (entry.changes || []).filter(c => c.kind === 'updated').length;
    return `Importación: +${added} añadidos, ${updated} actualizados`;
  }
  return 'Acción';
}

function historyEntryMeta(entry) {
  if (!entry || !entry.type) return '';
  if (entry.type === 'add') return entry.item && entry.item.producto ? `Producto: ${entry.item.producto}` : '';
  if (entry.type === 'delete') {
    const names = (entry.items || []).map(i => i.item && i.item.producto).filter(Boolean);
    if (names.length <= 5) return `Productos: ${names.join(', ')}`;
    return `Productos: ${names.slice(0,5).join(', ')} (+${names.length-5} más)`;
  }
  if (entry.type === 'edit') {
    const changes = entry.changes || [];
    if (changes.length === 0) return '';
    return changes.map(c => {
      if (c.field === 'stock') return `Stock: ${c.before} → ${c.after}`;
      return `${c.field}: ${c.before ?? ''} → ${c.after ?? ''}`;
    }).join(' · ');
  }
  if (entry.type === 'import') {
    const added = (entry.changes || []).filter(c => c.kind === 'added').length;
    const updated = (entry.changes || []).filter(c => c.kind === 'updated').length;
    return `Añadidos: ${added}, Actualizados: ${updated}`;
  }
  return '';
}

function showHistoryPanel(triggerBtn) {
  let panel = document.getElementById('historyPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'historyPanel';
    panel.className = 'history-panel';
    document.body.appendChild(panel);
  }
  // render history (newest first)
  const entries = historyStack.slice().reverse();
  panel.innerHTML = `<h3>Historial (${historyStack.length})</h3>` + (entries.length === 0 ? `<div class="history-empty">No hay acciones en el historial</div>` : entries.map((e, idx) => {
    const globalIdx = historyStack.length - 1 - idx; // map reversed index to original
    return `<div class="history-entry" data-idx="${globalIdx}">
      <div>
        <div class="desc">${historyEntryDescription(e)}</div>
        <div class="meta">${historyEntryMeta(e)}</div>
      </div>
      <div>
        <button class="entry-btn" data-idx="${globalIdx}">Deshacer</button>
      </div>
    </div>`;
  }).join(''));

  // position near trigger if provided. On small screens center the panel instead.
  if (window.innerWidth <= 720) {
    panel.style.position = 'fixed';
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = 'calc(100vw - 24px)';
    panel.style.maxHeight = '80vh';
    panel.style.boxSizing = 'border-box';
  } else if (triggerBtn && triggerBtn.getBoundingClientRect) {
    const r = triggerBtn.getBoundingClientRect();
    panel.style.position = 'absolute';
    panel.style.left = `${Math.max(8, r.left + window.scrollX)}px`;
    panel.style.top = `${r.bottom + window.scrollY + 8}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
  // bind close on outside click
  setTimeout(() => {
    document.addEventListener('click', historyOutsideClick);
  }, 0);

  // bind entry buttons
  panel.querySelectorAll('.entry-btn').forEach(b => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const idx = +ev.currentTarget.dataset.idx;
    // undo until this index (inclusive)
    undoUntil(idx);
    hideHistoryPanel();
  }));
}

function hideHistoryPanel() {
  const panel = document.getElementById('historyPanel');
  if (!panel) return;
  panel.remove();
  document.removeEventListener('click', historyOutsideClick);
}

function historyOutsideClick(e) {
  const panel = document.getElementById('historyPanel');
  if (!panel) return;
  if (panel.contains(e.target)) return;
  const hb = document.getElementById('historyBtn');
  if (hb && (hb === e.target || hb.contains(e.target))) return;
  hideHistoryPanel();
}

function undoUntil(globalIdx) {
  // globalIdx: index in historyStack to undo (0 = oldest, last = newest). We'll pop until we reach that index and applyUndo for each popped entry.
  if (historyStack.length === 0) { showToast('Nada que deshacer', 1500); return; }
  const targetPos = globalIdx;
  // pop until historyStack.length -1 === targetPos
  while (historyStack.length - 1 >= targetPos) {
    const entry = historyStack.pop();
    applyUndo(entry);
  }
    syncSave(products);
    window.__products = products;
    try {
      const t = document.getElementById('tableSearchInput');
      const q = t && t.value ? t.value : (searchInput && searchInput.value ? searchInput.value : '');
      filterAndRender(q);
    } catch(e) { try { renderAndBind(); } catch(_){} }
  updateUndoButton();
  showToast('Acciones deshechas', 1800, 'success');
}

function applyUndo(entry) {
  if (!entry || !entry.type) return;
  if (entry.type === 'add') {
    // undo add -> remove item at index
    const i = entry.index;
    if (i >= 0 && i < products.length) products.splice(i, 1);
  } else if (entry.type === 'delete') {
    // undo delete -> insert items at their original indices
    const items = entry.items || [];
    // restore in ascending order
    items.sort((a,b) => a.index - b.index).forEach(it => {
      products.splice(it.index, 0, deepClone(it.item));
    });
  } else if (entry.type === 'edit') {
    const i = entry.index;
    if (i >= 0 && i < products.length) {
      products[i] = deepClone(entry.before);
    }
  } else if (entry.type === 'import') {
    // handle changes: added (remove), updated (restore before)
    const changes = entry.changes || [];
    // remove additions first (descending indices)
    const added = changes.filter(c => c.kind === 'added').sort((a,b) => b.index - a.index);
    added.forEach(a => { if (a.index >=0 && a.index < products.length) products.splice(a.index, 1); });
    // restore updated
    const updated = changes.filter(c => c.kind === 'updated');
    updated.forEach(u => { if (u.index >=0 && u.index < products.length) products[u.index] = deepClone(u.before); });
  }
}

function undoLast() {
  if (historyStack.length === 0) { showToast('Nada que deshacer', 1500); return; }
  const entry = historyStack.pop();
  applyUndo(entry);
    syncSave(products);
    window.__products = products;
    try { const t = document.getElementById('tableSearchInput'); const q = t && t.value ? t.value : (searchInput && searchInput.value ? searchInput.value : ''); filterAndRender(q); } catch(e) { try { renderAndBind(); } catch(_){} }
  updateUndoButton();
  showToast('Acción deshecha', 1800, 'success');
}

// wire header undo button
const headerUndoBtn = document.getElementById('undoBtn');
if (headerUndoBtn) {
  headerUndoBtn.addEventListener('click', () => { undoLast(); });
}

// wire table history button (next to delete selected)
const tableHistoryBtn = document.getElementById('historyBtn');
if (tableHistoryBtn) {
  tableHistoryBtn.addEventListener('click', (e) => { e.stopPropagation(); showHistoryPanel(tableHistoryBtn); });
}

updateUndoButton();

let currentEditIndex = -1;

function renderAndBind() {
  const display = sortForDisplay(products);
  renderTable(display);
  bindRowEvents((index, dataset, btn) => {
    const p = dataset[index];
    // if we were in multi-edit state, clear it because we're opening single edit
    try { if (currentMultiEdit) { currentMultiEdit = false; currentMultiIndexes = []; const pfCodigo = document.getElementById('pfCodigo'); if (pfCodigo && window.__isAdmin) pfCodigo.disabled = false; const pfName = document.getElementById('pfName'); if (pfName) pfName.disabled = false; const del = document.getElementById('pfDelete'); if (del) del.style.display = ''; const hdr = document.querySelector('#productForm h2'); if (hdr) hdr.textContent = 'Editar producto'; } } catch(e){}
    // map to original products array by reference equality
    currentEditIndex = products.findIndex(pr => pr === p);
    fillForm(p);
    // On wide screens prefer a centered wider modal (better UX); on small screens show popover near the button
    if (window.innerWidth >= 1000) openModal(); else openModal({ target: btn });
  }, display);
  // Bind stock controls for the rendered rows
  try { bindStockControls(); } catch(e) { console.warn('bindStockControls failed', e); }
  try { updateEditMultipleButton(); } catch(e) {}
}

// Bind form actions
bindFormActions({
  onSave: async () => {
    // If we are in multi-edit mode, collect optional fields and apply to all selected
    if (currentMultiEdit && Array.isArray(currentMultiIndexes) && currentMultiIndexes.length > 0) {
      // read optional values from form without validation of name/codigo
      const icon = document.getElementById('pfIcon') ? document.getElementById('pfIcon').value.trim() : '';
      const expiry = document.getElementById('pfExpiry') ? document.getElementById('pfExpiry').value.trim() : '';
      const stockRaw = document.getElementById('pfStock') ? document.getElementById('pfStock').value.trim() : '';
      const stock = stockRaw === '' ? undefined : (+stockRaw);
      // collect multiple tipos if checked
      let tipoArr = [];
      try {
        if (document.getElementById('pfTagSeco') && document.getElementById('pfTagSeco').checked) tipoArr.push('seco');
        if (document.getElementById('pfTagCongelado') && document.getElementById('pfTagCongelado').checked) tipoArr.push('congelado');
        if (document.getElementById('pfTagFresco') && document.getElementById('pfTagFresco').checked) tipoArr.push('fresco');
        if (document.getElementById('pfTagBebida') && document.getElementById('pfTagBebida').checked) tipoArr.push('bebida');
        if (document.getElementById('pfTagHelados') && document.getElementById('pfTagHelados').checked) tipoArr.push('helados');
      } catch (e) { tipoArr = []; }
      const changes = [];
      currentMultiIndexes.forEach((gi) => {
        if (gi < 0 || gi >= products.length) return;
        const before = deepClone(products[gi]);
        if (icon) products[gi].icon = icon;
        if (expiry !== '') products[gi].caducidad = expiry;
        if (typeof stock !== 'undefined' && !Number.isNaN(stock)) products[gi].stock = stock;
        if (Array.isArray(tipoArr) && tipoArr.length > 0) products[gi].tipo = tipoArr;
        const after = deepClone(products[gi]);
        changes.push({ index: gi, before, after });
      });
      // push a grouped history entry
      if (changes.length > 0) pushHistory({ type: 'edit-multiple', changes: changes });
    } else {
      const data = readForm();
      if (!data) return;
      if (currentEditIndex >= 0 && currentEditIndex < products.length) {
        const before = deepClone(products[currentEditIndex]);
        products[currentEditIndex] = data;
        const afterState = deepClone(data);
        pushHistory({ type: 'edit', index: currentEditIndex, before: before, after: afterState, changes: computeChanges(before, afterState) });
      } else {
        products.push(data);
        const idx = products.length - 1;
        pushHistory({ type: 'add', index: idx, item: deepClone(data) });
      }
    }
    // Save locally and broadcast immediately, then re-render preserving the
    // current search/filter so the user's view isn't reset to show all items.
    saveProducts(products);
    try { if (bc) bc.postMessage({ type: 'products-updated', products: products }); } catch(e){}
    window.__products = products;
    try {
      // reset multi-edit state and restore form defaults
      if (currentMultiEdit) {
        currentMultiEdit = false;
        currentMultiIndexes = [];
        try {
          const pfCodigo = document.getElementById('pfCodigo'); if (pfCodigo && window.__isAdmin) pfCodigo.disabled = false;
          const pfName = document.getElementById('pfName'); if (pfName) pfName.disabled = false;
          const del = document.getElementById('pfDelete'); if (del) del.style.display = '';
          const hdr = document.querySelector('#productForm h2'); if (hdr) hdr.textContent = 'Editar producto';
        } catch(e){}
      }
      const t = document.getElementById('tableSearchInput');
      const q = t && t.value ? t.value : (searchInput && searchInput.value ? searchInput.value : '');
      filterAndRender(q);
    } catch (e) {
      // fallback to full render if something unexpected happens
      try { renderAndBind(); } catch(_){ }
    }

    // Try single-item server save via Supabase wrapper (more efficient)
    if (window.__USE_SUPABASE && window.__SUPABASE && typeof window.__SUPABASE.saveSingle === 'function') {
      try {
        showToast('Guardando cambios en servidor...', 1500, '');
        await window.__SUPABASE.saveSingle(data);
        showToast('Guardado en servidor', 1400, 'success');
      } catch (e) {
        console.warn('saveSingle failed, falling back to full sync', e);
        showToast('No se pudo guardar individualmente — sincronizando todo...', 2200, 'error');
        try { await serverSaveProducts(products); showToast('Sincronización completada', 1400, 'success'); } catch (err) { console.error('full sync failed', err); showToast('Error sincronizando al servidor', 3000, 'error'); }
      }
    } else {
      // fallback to full sync behavior
      syncSave(products);
    }

    closeModal();
  },
  onDelete: () => {
    if (currentEditIndex < 0) return;
    if (!confirm('¿Eliminar producto?')) return;
    const removed = deepClone(products[currentEditIndex]);
    products.splice(currentEditIndex, 1);
    pushHistory({ type: 'delete', items: [{ index: currentEditIndex, item: removed }] });
    syncSave(products);
    window.__products = products;
    try { const t = document.getElementById('tableSearchInput'); const q = t && t.value ? t.value : (searchInput && searchInput.value ? searchInput.value : ''); filterAndRender(q); } catch(e) { try { renderAndBind(); } catch(_){} }
    closeModal();
  },
  onCancel: () => {
    // cleanup multi-edit state if active
    try {
      if (currentMultiEdit) {
        currentMultiEdit = false;
        currentMultiIndexes = [];
        const pfCodigo = document.getElementById('pfCodigo'); if (pfCodigo && window.__isAdmin) pfCodigo.disabled = false;
        const pfName = document.getElementById('pfName'); if (pfName) pfName.disabled = false;
        const del = document.getElementById('pfDelete'); if (del) del.style.display = '';
        const hdr = document.querySelector('#productForm h2'); if (hdr) hdr.textContent = 'Editar producto';
      }
    } catch(e){}
    closeModal();
  }
});

bindModal(() => {
  try {
    if (currentMultiEdit) {
      currentMultiEdit = false;
      currentMultiIndexes = [];
      const pfCodigo = document.getElementById('pfCodigo'); if (pfCodigo && window.__isAdmin) pfCodigo.disabled = false;
      const pfName = document.getElementById('pfName'); if (pfName) pfName.disabled = false;
      const del = document.getElementById('pfDelete'); if (del) del.style.display = '';
      const hdr = document.querySelector('#productForm h2'); if (hdr) hdr.textContent = 'Editar producto';
    }
  } catch(e){}
  closeModal();
});

// File import button
function showToast(message, ms = 3000, type = '', actionsHtml = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.className = 'toast' + (type ? ` ${type}` : '');
  t.hidden = false;
  t.innerHTML = `<span class="toast-msg">${message}</span>` + (actionsHtml || '');
  // trigger animation
  requestAnimationFrame(() => t.classList.add('show'));
  if (ms > 0) {
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; t.className = 'toast'; t.innerHTML = ''; }, 200);
    }, ms);
  }
}

// Loading overlay helper (persistent spinner)
function showLoading(message = 'Cargando...') {
  let ov = document.getElementById('loadingOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'loadingOverlay';
    ov.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);z-index:9999;';
    ov.innerHTML = `<div style="background:#fff;padding:16px 18px;border-radius:8px;display:flex;gap:12px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,0.18)"><div class="spinner" style="width:26px;height:26px;border:4px solid #e6e6e6;border-top-color:#1976d2;border-radius:50%;animation:spin 1s linear infinite"></div><div class="loading-msg" style="font-size:14px;color:#222">${message}</div></div>`;
    document.body.appendChild(ov);
    if (!document.getElementById('loadingOverlayStyles')) {
      const s = document.createElement('style');
      s.id = 'loadingOverlayStyles';
      s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
  } else {
    const msg = ov.querySelector('.loading-msg'); if (msg) msg.textContent = message;
    ov.style.display = 'flex';
  }
}

function hideLoading() {
  const ov = document.getElementById('loadingOverlay');
  if (ov) ov.remove();
}

if (fileButton && fileInput) {
  fileButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const rows = await importFile(file);
      let added = 0, updated = 0;
      const changes = []; // record changes for undo
      rows.forEach(r => {
        // compare by normalized product name (case-insensitive, ignore accents/symbols)
        const name = normalizeName(r.producto || '');
        const idx = products.findIndex(p => normalizeName(p.producto || '') === name);
        if (idx >= 0) {
          // record before state
          const before = deepClone(products[idx]);
          // update stock
          products[idx].stock = r.stock ?? products[idx].stock ?? 0;
          // update expiry only if CSV provides it; otherwise keep existing
          if (r.caducidad && r.caducidad.trim() !== '') products[idx].caducidad = r.caducidad;
          // keep existing icon if present; otherwise use imported icon
          if (!products[idx].icon && r.icon) products[idx].icon = r.icon;
          products[idx].__highlight = 'updated';
          changes.push({ kind: 'updated', index: idx, before: before });
          updated++;
        } else {
          // new product: ensure default icon if missing
          const newItem = Object.assign({}, r);
          if (!newItem.icon) newItem.icon = 'icon-192.png';
          newItem.__highlight = 'added';
          products.push(newItem);
          const newIndex = products.length - 1;
          changes.push({ kind: 'added', index: newIndex, item: deepClone(newItem) });
          added++;
        }
      });
      // record import as a single history entry for undo
      if (changes.length > 0) pushHistory({ type: 'import', changes: changes });
      // keep global reference in sync
      window.__products = products;
      syncSave(products);
      // keep global reference in sync
      window.__products = products;
      renderAndBind();
      showToast(`Importado: ${added} añadidos, ${updated} actualizados`, 3500, 'success');
      // remove highlight flags after a delay so animation can run
      setTimeout(() => {
        [...products].forEach(p => { if (p.__highlight) delete p.__highlight; });
        renderAndBind();
      }, 2400);
    } catch (err) {
      console.error('Import error', err);
      showToast('Error al importar archivo', 3500, 'error');
    }
    // clear input so same file can be re-selected
    e.target.value = '';
  });
}

// search/filter helper used by header and table-top search inputs
function filterAndRender(query) {
  const q = query ? normalizeName(query) : '';
  const filteredByName = q ? products.filter(p => normalizeName(p.producto || '').includes(q)) : products;
  // determine active tag filters (defaults: if checkbox missing, treat as checked)
  const active = {
    seco: tagFilterSeco ? !!tagFilterSeco.checked : true,
    congelado: tagFilterCongelado ? !!tagFilterCongelado.checked : true,
    fresco: tagFilterFresco ? !!tagFilterFresco.checked : true,
    bebida: tagFilterBebida ? !!tagFilterBebida.checked : true,
    helados: tagFilterHelados ? !!tagFilterHelados.checked : true
  };
  // Count how many type filters are currently active. When exactly one is
  // active, we will hide products that have no `tipo`/tags to make the
  // filtering stricter (user explicitly requested only that type).
  const activeCount = (active.seco ? 1 : 0) + (active.congelado ? 1 : 0) + (active.fresco ? 1 : 0) + (active.bebida ? 1 : 0) + (active.helados ? 1 : 0);
  function matchesTag(p) {
    try {
      // Build array of tipos: prefer `tipo` (array), fallback to string or tags
      const tipos = Array.isArray(p && p.tipo) ? p.tipo.map(x => (x||'').toString().toLowerCase())
        : (p && typeof p.tipo === 'string' && p.tipo.trim() !== '') ? [p.tipo.toLowerCase()]
        : (Array.isArray(p.tags) ? p.tags.map(x => (x||'').toString().toLowerCase()) : []);
      // If no tipos present, decide using activeCount: only show when none or ALL filters are active
      const totalFilters = 0 + (tagFilterSeco ? 1 : 0) + (tagFilterCongelado ? 1 : 0) + (tagFilterFresco ? 1 : 0) + (tagFilterBebida ? 1 : 0) + (tagFilterHelados ? 1 : 0);
      if (!tipos || tipos.length === 0) {
        if (activeCount === 0 || activeCount === totalFilters) return true;
        return false;
      }
      // check for any overlap between product tipos and active filters
      if (active.seco && tipos.includes('seco')) return true;
      if (active.congelado && tipos.includes('congelado')) return true;
      if (active.fresco && tipos.includes('fresco')) return true;
      if (active.bebida && tipos.includes('bebida')) return true;
      if (active.helados && tipos.includes('helados')) return true;
      return false;
    } catch (e) { return true; }
  }

  const filtered = filteredByName.filter(matchesTag);
  const display = sortForDisplay(filtered);
  renderTable(display);
  bindRowEvents((index, dataset, btn) => {
    const p = dataset[index];
    currentEditIndex = products.findIndex(pr => pr === p);
    fillForm(p);
    if (window.innerWidth >= 1000) openModal(); else openModal({ target: btn });
  }, display);
  // ensure stock buttons are wired for the filtered/rendered rows
  try { bindStockControls(); } catch(e) { console.warn('bindStockControls failed', e); }
  try { updateEditMultipleButton(); } catch(e) {}
}

// header search
if (searchInput) {
  searchInput.addEventListener('input', (e) => filterAndRender(e.target.value));
}

// table top search and controls
const tableSearch = document.getElementById('tableSearchInput');
const addProductBtn = document.getElementById('addProduct');
const deleteSelectedBtn = document.getElementById('deleteSelected');
if (tableSearch) tableSearch.addEventListener('input', (e) => filterAndRender(e.target.value));
// wire tag filter checkboxes to update the table when changed
if (tagFilterSeco) tagFilterSeco.addEventListener('change', () => filterAndRender(tableSearch ? tableSearch.value : (searchInput ? searchInput.value : '')));
if (tagFilterCongelado) tagFilterCongelado.addEventListener('change', () => filterAndRender(tableSearch ? tableSearch.value : (searchInput ? searchInput.value : '')));
if (tagFilterFresco) tagFilterFresco.addEventListener('change', () => filterAndRender(tableSearch ? tableSearch.value : (searchInput ? searchInput.value : '')));
if (tagFilterBebida) tagFilterBebida.addEventListener('change', () => filterAndRender(tableSearch ? tableSearch.value : (searchInput ? searchInput.value : '')));
if (tagFilterHelados) tagFilterHelados.addEventListener('change', () => filterAndRender(tableSearch ? tableSearch.value : (searchInput ? searchInput.value : '')));
if (addProductBtn) {
  addProductBtn.addEventListener('click', () => {
    currentEditIndex = -1;
    fillForm({});
    openModal();
  });
}
if (deleteSelectedBtn) {
  deleteSelectedBtn.addEventListener('click', () => {
    const idxs = getSelectedIndexes();
    if (!idxs || idxs.length === 0) { showToast('No hay productos seleccionados', 2000, 'error'); return; }
    if (!confirm(`Eliminar ${idxs.length} producto(s)?`)) return;
    // backup deleted items for undo (store original index and cloned item)
    const backup = idxs.map(i => ({ index: i, item: deepClone(products[i]) }));
    // remove descending so indexes stay valid
    idxs.sort((a,b) => b - a).forEach(i => products.splice(i, 1));
    // record history entry
    pushHistory({ type: 'delete', items: backup });
    syncSave(products);
    window.__products = products;
    try { const t = document.getElementById('tableSearchInput'); const q = t && t.value ? t.value : (searchInput && searchInput.value ? searchInput.value : ''); filterAndRender(q); } catch(e) { try { renderAndBind(); } catch(_){} }
    // show toast with Undo button that triggers global undo
    showToast(`${idxs.length} eliminado(s)`, 8000, 'success', ` <button id="toastUndoBtn" class="toast-btn">Deshacer</button>`);
    const undoBtn = document.getElementById('toastUndoBtn');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => { undoLast(); });
    }
  });
}

// Initial render
renderAndBind();

// --- Service Worker registration & push subscription helpers ---
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return console.info('No serviceWorker available');
  // Register using a relative path so it works both on localhost and GitHub Pages (project sites)
  const swPath = './service-worker.js';
  try {
    console.info('[SW] trying to register', swPath);
    const reg = await navigator.serviceWorker.register(swPath);
    console.info('ServiceWorker registered at', reg.scope);
  } catch (err) {
    console.error('ServiceWorker registration failed', err);
  }
}

// Ask for notification permission and subscribe to Push (if VAPID key provided)
async function enablePush() {
  if (!('Notification' in window)) { showToast('Notificaciones no soportadas por este navegador', 3000, 'error'); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { showToast('Permiso de notificaciones denegado', 3000, 'error'); return; }
  showToast('Permiso concedido. Registrando service worker...', 2000, 'success');
  try { await registerServiceWorker(); } catch(e) { console.error(e); }
  // Try to subscribe to Push if service worker registration exists
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    // navigator.serviceWorker.controller may be null until a reload — inform user
    showToast('Service worker registrado. Recarga la página para completar la suscripción Push.', 5000, 'success');
    return;
  }
  // If a VAPID public key is provided by the app, use it to subscribe (set window.__VAPID_PUBLIC_KEY)
  const vapidKey = window.__VAPID_PUBLIC_KEY || null;
  if (!vapidKey) {
    console.info('VAPID public key not provided. Skipping push subscription. Provide window.__VAPID_PUBLIC_KEY for automated subscription.');
    showToast('Service worker activo. Proporciona clave VAPID en el servidor para Push.', 5000, 'success');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
    console.info('Push subscription:', sub);
    showToast('Suscripción Push creada. Enviar al servidor para notificaciones.', 4000, 'success');
    // You should POST `sub` to your server to save it and use it to send push messages
  } catch (err) {
    console.error('Push subscription error', err);
    showToast('Error creando suscripción Push', 3500, 'error');
  }
}

// small helper to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// The `Notificaciones` button and its binding were removed from the UI
// because push subscriptions require a persistent server. The enablePush
// function remains if you later re-add server-side support.

// --- Server config UI ---
// read saved server config from localStorage
function loadServerConfig() {
  const base = localStorage.getItem('API_BASE') || '';
  const key = localStorage.getItem('API_KEY') || '';
  if (base) window.__API_BASE = base;
  if (key) window.__API_KEY = key;
}

function saveServerConfig(base, key) {
  // normalize base: accept full URLs but store only the origin (protocol+host[:port])
  let normalizedBase = '';
  if (base) {
    const raw = (base || '').toString().trim();
    try {
      const u = new URL(raw);
      normalizedBase = u.origin;
    } catch (e) {
      // fallback: extract protocol+host using regex
      const m = raw.match(/^(https?:\/\/[^/]+)/i);
      if (m && m[1]) normalizedBase = m[1];
      else normalizedBase = raw.replace(/\/$/, '');
    }
  }
  if (normalizedBase) localStorage.setItem('API_BASE', normalizedBase); else localStorage.removeItem('API_BASE');
  if (key) localStorage.setItem('API_KEY', key); else localStorage.removeItem('API_KEY');
  window.__API_BASE = normalizedBase || null;
  window.__API_KEY = key || null;
  showToast('Configuración de servidor guardada', 2000, 'success');
  // try to load products from the configured server immediately so the user doesn't have to reload
  if (normalizedBase) {
    (async () => {
      try {
        const remote = await serverLoadProducts();
        if (Array.isArray(remote)) {
          products = remote;
          syncSave(products);
          window.__products = products;
          renderAndBind();
          showToast('Productos cargados desde servidor', 2000, 'success');
        }
      } catch (err) {
        console.warn('Error cargando productos desde server tras guardar config', err);
        showToast('No se pudieron cargar productos desde el servidor (revisa API_BASE/API_KEY)', 3500, 'error');
      }
    })();
  }
}

const serverConfigBtn = document.getElementById('serverConfigBtn');
if (serverConfigBtn) {
  serverConfigBtn.addEventListener('click', () => {
    const currentBase = localStorage.getItem('API_BASE') || '';
    const base = prompt('URL base del servidor (ej. http://mi-servidor:3000)', currentBase || '');
    if (base === null) return; // cancel
    // Auto-apply API key: prefer existing stored key, otherwise use DEFAULT_API_KEY for your personal server
    const existingKey = (localStorage && localStorage.getItem && localStorage.getItem('API_KEY')) || window.__API_KEY || '';
    const autoKey = existingKey || DEFAULT_API_KEY || '';
    try { if (autoKey) localStorage.setItem('API_KEY', autoKey); } catch (e) { console.warn('Could not write API_KEY to localStorage', e); }
    window.__API_KEY = autoKey || null;
    if (autoKey) showToast('API Key aplicada automáticamente', 2200, '');
    else showToast('No se encontró API Key; puedes añadirla manualmente si es necesario', 3000, 'error');
    saveServerConfig(base.trim(), autoKey);
  });
}

// load config on startup
loadServerConfig();

// --- Server history panel ---
function showServerHistoryPanel(triggerBtn) {
  if (!window.__API_BASE) { showToast('Configura el servidor primero', 2500, 'error'); return; }
  const panelId = 'serverHistoryPanel';
  let panel = document.getElementById(panelId);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'history-panel';
    document.body.appendChild(panel);
  }
  panel.innerHTML = `<h3>Historial servidor (últimas 10)</h3><div class="history-loading">Cargando...</div>`;
  // fetch history
  try {
    const base = getApiBaseOrigin(window.__API_BASE);
    if (!base) throw new Error('No API base');
    fetch(base + '/api/history/last?n=10')
      .then(r => r.json())
    .then(list => {
      if (!Array.isArray(list) || list.length === 0) {
        panel.innerHTML = `<h3>Historial servidor (0)</h3><div class="history-empty">No hay entradas</div>`;
        return;
      }
      panel.innerHTML = `<h3>Historial servidor (${list.length})</h3>` + list.map((e, idx) => {
        return `<div class="history-entry" data-idx="${idx}">
          <div>
            <div class="desc">${new Date(e.ts).toLocaleString()} — ${e.type}</div>
            <div class="meta">Antes: ${e.beforeCount} · Después: ${e.afterCount}</div>
          </div>
          <div>
            <button class="entry-btn view-btn" data-idx="${idx}">Ver</button>
            <button class="entry-btn restore-btn" data-idx="${idx}">Restaurar</button>
          </div>
        </div>`;
      }).join('');
      // attach handlers
      panel.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', (ev) => {
        const i = +ev.currentTarget.dataset.idx;
        const entry = list[i];
        // open a simple window with JSON preview
        const w = window.open('', '_blank', 'width=800,height=600');
        w.document.write('<pre>' + JSON.stringify(entry, null, 2) + '</pre>');
      }));
      panel.querySelectorAll('.restore-btn').forEach(b => b.addEventListener('click', async (ev) => {
        const i = +ev.currentTarget.dataset.idx;
        const entry = list[i];
        if (!confirm('Restaurar snapshot anterior en el servidor? Esto reemplazará la lista actual.')) return;
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (window.__API_KEY) headers['x-api-key'] = window.__API_KEY;
          const base = getApiBaseOrigin(window.__API_BASE);
          if (!base) throw new Error('No API base');
          const res = await fetch(base + '/api/products', { method: 'POST', headers, body: JSON.stringify(entry.before || []) });
          if (!res.ok) throw new Error('restore failed');
          // reload products from server
          const remote = await serverLoadProducts();
          products = remote;
          syncSave(products);
          window.__products = products;
          renderAndBind();
          showToast('Restaurado correctamente', 2500, 'success');
        } catch (err) {
          console.error(err);
          showToast('Error restaurando snapshot (comprueba API key)', 3500, 'error');
        }
      }));
    }).catch(err => {
      console.error('history fetch err', err);
      panel.innerHTML = `<h3>Historial servidor</h3><div class="history-empty">Error cargando historial</div>`;
    });
  } catch (err) {
    console.warn('history fetch setup failed', err);
    panel.innerHTML = `<h3>Historial servidor</h3><div class="history-empty">Configura el servidor primero</div>`;
  }

  // position near trigger if provided; center on small screens
  if (window.innerWidth <= 720) {
    panel.style.position = 'fixed';
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = 'calc(100vw - 24px)';
    panel.style.maxHeight = '80vh';
    panel.style.boxSizing = 'border-box';
  } else if (triggerBtn && triggerBtn.getBoundingClientRect) {
    const r = triggerBtn.getBoundingClientRect();
    panel.style.position = 'absolute';
    panel.style.left = `${Math.max(8, r.left + window.scrollX)}px`;
    panel.style.top = `${r.bottom + window.scrollY + 8}px`;
  }
  setTimeout(() => { document.addEventListener('click', serverHistoryOutsideClick); }, 0);
}

function hideServerHistoryPanel() {
  const p = document.getElementById('serverHistoryPanel'); if (!p) return; p.remove(); document.removeEventListener('click', serverHistoryOutsideClick);
}

function serverHistoryOutsideClick(e) {
  const panel = document.getElementById('serverHistoryPanel'); if (!panel) return; if (panel.contains(e.target)) return; const hb = document.getElementById('serverHistoryBtn'); if (hb && (hb === e.target || hb.contains(e.target))) return; hideServerHistoryPanel();
}

const serverHistoryBtn = document.getElementById('serverHistoryBtn');
if (serverHistoryBtn) serverHistoryBtn.addEventListener('click', (e) => { e.stopPropagation(); showServerHistoryPanel(serverHistoryBtn); });

// Load products button: try server first, fallback to localStorage
const loadProductsBtn = document.getElementById('loadProductsBtn');
if (loadProductsBtn) {
  loadProductsBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await loadProductsFromServerPreferRemote();
    if (!ok) showToast('No se pudieron cargar productos desde el servidor', 2500, 'error');
  });
}

// register SW proactively (non-blocking)
registerServiceWorker();

// --- Icon picker implementation ---
function createIconPicker() {
  let picker = document.getElementById('iconPicker');
  if (picker) return picker;
  picker = document.createElement('div');
  picker.id = 'iconPicker';
  picker.className = 'icon-picker';
  picker.innerHTML = `
    <div style="margin-bottom:8px;"><input id="iconPickerSearch" placeholder="Buscar icono..." style="width:100%;padding:6px;border:1px solid #ddd;border-radius:6px"></div>
    <div class="grid"></div>
    <div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:8px;">
      <button id="iconPrevBtn" class="btn btn-outline" type="button">←</button>
      <span id="iconPageInfo" style="font-size:13px;color:#444;"></span>
      <button id="iconNextBtn" class="btn btn-outline" type="button">→</button>
    </div>`;
  document.body.appendChild(picker);
  // click on item
  picker.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = e.target.closest('.item');
    if (!item) return;
    const name = item.dataset.name;
    console.debug('[iconPicker] item click ->', name);
    const input = document.getElementById('pfIcon');
    const preview = document.getElementById('pfIconPreview');
    if (input) input.value = name;
    if (preview) preview.src = `./public/icons/${name}`;
    // keep picker open briefly to let other handlers that check picker.contains work, then close
    setTimeout(() => hideIconPicker(), 0);
  });
  return picker;
}

async function showIconPicker(triggerBtn) {
  const picker = createIconPicker();
  const grid = picker.querySelector('.grid');
  // load icons list
  try {
    // cache-bust icons.json so newly added icons appear without stale cache
    const res = await fetch('./public/icons/icons.json?_=' + Date.now(), { cache: 'no-cache' });
    const list = await res.json();
    // exclude defaults (icon-192/icon-512) from picker list
    const filteredList = (list || []).filter(n => n !== 'icon-192.png' && n !== 'icon-512.png');
    // store on picker element for pagination and search
    picker._icons = filteredList;
    picker._pageSize = 8; // 4 columns * 2 rows
    picker._page = 0;

    // ensure grid has auto height (no internal scroll needed for pagination)
    grid.style.maxHeight = '';
    grid.style.overflowY = '';

    function renderPickerPage() {
      const all = picker._icons || [];
      const searchQ = (picker.querySelector('#iconPickerSearch').value || '').trim().toLowerCase();
      const visible = searchQ ? all.filter(n => n.toLowerCase().includes(searchQ)) : all;
      console.debug('[iconPicker] render page', { total: all.length, visible: visible.length, page: picker._page });
      const total = visible.length;
      const pageSize = picker._pageSize || 8;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (picker._page == null || picker._page < 0) picker._page = 0;
      if (picker._page >= totalPages) picker._page = totalPages - 1;
      const start = picker._page * pageSize;
      const pageItems = visible.slice(start, start + pageSize);
      grid.innerHTML = pageItems.map(n => `
        <div class="item" data-name="${n}">
          <img src="./public/icons/${n}" alt="${n}" loading="eager" onerror="this.src='./public/icons/icon-192.png'">
          <div style="font-size:12px;margin-top:6px;">${n}</div>
        </div>
      `).join('');
      const pageInfo = picker.querySelector('#iconPageInfo');
      if (pageInfo) pageInfo.textContent = `${picker._page + 1} / ${totalPages}`;
      const prevBtn = picker.querySelector('#iconPrevBtn');
      const nextBtn = picker.querySelector('#iconNextBtn');
      if (prevBtn) { prevBtn.disabled = picker._page === 0; prevBtn.style.display = ''; }
      if (nextBtn) { nextBtn.disabled = (picker._page >= totalPages - 1); nextBtn.style.display = ''; }
    }

    // initial render
    renderPickerPage();

    // bind pagination buttons (use assignment to avoid stacking handlers when re-opening picker)
    const prev = picker.querySelector('#iconPrevBtn');
    const next = picker.querySelector('#iconNextBtn');
    if (prev) prev.onclick = (ev) => { ev.stopPropagation(); picker._page = Math.max(0, (picker._page || 0) - 1); renderPickerPage(); };
    if (next) next.onclick = (ev) => { ev.stopPropagation(); picker._page = (picker._page || 0) + 1; renderPickerPage(); };

    // bind search in picker: use assignment to prevent duplicate handlers
    const searchInput = picker.querySelector('#iconPickerSearch');
    if (searchInput) {
      searchInput.oninput = (ev) => {
        picker._page = 0;
        renderPickerPage();
      };
    }
    
  } catch (err) {
    grid.innerHTML = '<div style="padding:8px">No se pudieron cargar iconos</div>';
  }
  // position near triggerBtn using viewport coordinates (getBoundingClientRect)
  const rect = triggerBtn.getBoundingClientRect();
  // On narrow viewports (mobile) center the picker to avoid it being pushed off-screen
  if (window.innerWidth <= 520) {
    picker.style.left = '50%';
    picker.style.top = '50%';
    picker.style.transform = 'translate(-50%, -50%)';
    picker.style.maxWidth = '92%';
  } else {
    // for desktop/tablet keep anchored near the button
    picker.style.transform = '';
    let left = rect.right + 8;
    let top = rect.top;
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
    // adjust if it would overflow viewport after render
    setTimeout(() => {
      const pw = picker.offsetWidth || 0;
      const ph = picker.offsetHeight || 0;
      let placedLeft = false;
      if (left + pw > window.innerWidth) {
        left = Math.max(8, rect.left - pw - 8);
        placedLeft = true;
        picker.style.left = `${left}px`;
      }
      if (top + ph > window.innerHeight) {
        top = Math.max(8, window.innerHeight - ph - 8);
        picker.style.top = `${top}px`;
      }
      // if placed left, we might want to flip arrow or styling (not used for picker)
    }, 0);
  }
  picker.classList.add('visible');
  // mark picker open so modal outside-click ignores clicks inside
  try { window.__iconPickerOpen = true; } catch (e) {}
  // close on outside click
  setTimeout(() => {
    document.addEventListener('click', outsideClick);
  }, 0);
}

function hideIconPicker() {
  const picker = document.getElementById('iconPicker');
  if (!picker) return;
  picker.classList.remove('visible');
  document.removeEventListener('click', outsideClick);
  try { window.__iconPickerOpen = false; } catch(e){}
}

function outsideClick(e) {
  const picker = document.getElementById('iconPicker');
  if (!picker) return;
  const btn = document.getElementById('pfPickIcon');
  if (picker.contains(e.target)) return;
  if (btn && (btn === e.target || btn.contains(e.target))) return;
  hideIconPicker();
}

// bind pick icon button using delegated handler so it still works
// if the modal content is re-rendered or the element is recreated.
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('#pfPickIcon');
  if (!btn) return;
  e.stopPropagation();
  try { showIconPicker(btn); } catch (err) { console.error('showIconPicker error', err); }
});
