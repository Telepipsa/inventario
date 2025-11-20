import { renderTable, bindRowEvents, getSelectedIndexes } from '../src/components/table.js';
import { fillForm, readForm, bindFormActions } from '../src/components/productForm.js';
import { openModal, closeModal, bindModal } from '../src/components/modal.js';
import { loadProducts, saveProducts } from '../src/data/storage.js';
import { isTodayOrPast } from '../src/services/expiry.js';
import { importFile } from '../src/data/import.js';

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

let products = [];

// Attempt to load from a central API if configured (set window.__API_BASE = 'http://host:port')
async function serverLoadProducts() {
  const base = getApiBaseOrigin(window.__API_BASE);
  if (!base) throw new Error('No API base');
  const res = await fetch(base + '/api/products');
  if (!res.ok) throw new Error('Failed to fetch from server');
  return await res.json();
}

async function serverSaveProducts(p) {
  const base = getApiBaseOrigin(window.__API_BASE);
  if (!base) throw new Error('No API base');
  const headers = { 'Content-Type': 'application/json' };
  if (window.__API_KEY) headers['x-api-key'] = window.__API_KEY;
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
  if (window.__API_BASE) {
    serverSaveProducts(p).then(() => console.info('[sync] saved to server')).catch(e => {
      console.warn('[sync] server save failed', e);
      // show user-visible toast for failures; special message when unauthorized
      if (e && e.status === 401) {
        showToast('Sincronización falló: 401 No autorizado — comprueba la API Key en configuración', 6000, 'error');
      } else {
        showToast('Sincronización falló: no se pudieron guardar los productos en el servidor', 5000, 'error');
      }
    });
  }
}

(async function initProducts() {
  // load server config from localStorage if present (and attempt auto-detect)
  try { loadServerConfig(); } catch (e) { console.warn('loadServerConfig failed', e); }

  // If no API_BASE configured, try to auto-detect a server on the same origin
  if (!window.__API_BASE) {
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
      // If no API_BASE configured, probe a known public server once
      try {
        if (!window.__API_BASE) {
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

  // position near trigger if provided
  if (triggerBtn && triggerBtn.getBoundingClientRect) {
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
  renderAndBind();
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
  renderAndBind();
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
    // map to original products array by reference equality
    currentEditIndex = products.findIndex(pr => pr === p);
    fillForm(p);
    // open as popover next to button when available
    openModal({ target: btn });
  }, display);

  // Bind stock change events dispatched from table rows
  document.querySelectorAll('.stock-controls').forEach(el => {
    el.addEventListener('stock-change', (ev) => {
      const delta = ev.detail.delta;
      if (typeof delta !== 'number') return;
      // prefer global index attribute (maps back to window.__products)
      const globalIdxAttr = ev.currentTarget && ev.currentTarget.dataset ? ev.currentTarget.dataset.globalIndex : undefined;
      let gi = (globalIdxAttr !== undefined && globalIdxAttr !== '') ? +globalIdxAttr : null;
      // fallback to event detail index
      if ((gi === null || Number.isNaN(gi)) && ev.detail && typeof ev.detail.index === 'number') gi = ev.detail.index;
      if (gi === null || Number.isNaN(gi)) return;
      const item = products[gi];
      if (!item) return;
      const before = deepClone(item);
      // adjust stock (ensure numeric)
      const cur = Number(item.stock ?? 0);
      const next = Math.max(0, cur + delta);
      products[gi].stock = next;
      const afterState = deepClone(products[gi]);
      pushHistory({ type: 'edit', index: gi, before: before, after: afterState, changes: computeChanges(before, afterState) });
      syncSave(products);
      window.__products = products;
      renderAndBind();
    });
  });
}

// Bind form actions
bindFormActions({
  onSave: () => {
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
    syncSave(products);
    window.__products = products;
    renderAndBind();
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
    renderAndBind();
    closeModal();
  },
  onCancel: () => {
    closeModal();
  }
});

bindModal(() => {
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
  const filtered = q ? products.filter(p => normalizeName(p.producto || '').includes(q)) : products;
  const display = sortForDisplay(filtered);
  renderTable(display);
  bindRowEvents((index, dataset, btn) => {
    const p = dataset[index];
    currentEditIndex = products.findIndex(pr => pr === p);
    fillForm(p);
    openModal({ target: btn });
  }, display);
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
    renderAndBind();
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

// wire enablePush button
const enablePushBtn = document.getElementById('enablePushBtn');
if (enablePushBtn) enablePushBtn.addEventListener('click', () => enablePush());

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
    const currentKey = localStorage.getItem('API_KEY') || '';
    const base = prompt('URL base del servidor (ej. http://mi-servidor:3000)', currentBase || '');
    if (base === null) return; // cancel
    const key = prompt('API Key (opcional, deja vacío si no tienes)', currentKey || '');
    if (key === null) return;
    saveServerConfig(base.trim(), key.trim());
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

  // position near trigger if provided
  if (triggerBtn && triggerBtn.getBoundingClientRect) {
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
    // try to load from server (prefer remote)
    const tryServer = async () => {
      showLoading('Cargando productos desde servidor...');
      try {
        // if no API_BASE is configured, attempt the known public server once
        if (!window.__API_BASE) {
          try {
            const known = 'https://inventario-zrlk.onrender.com';
            const r = await fetch(known.replace(/\/$/, '') + '/api/products', { cache: 'no-cache' });
            if (r.ok) {
              window.__API_BASE = known.replace(/\/$/, '');
              localStorage.setItem('API_BASE', window.__API_BASE);
            }
          } catch (err) { /* ignore, will fallback to local */ }
        }
        if (!window.__API_BASE) throw new Error('No API_BASE');
        const remote = await serverLoadProducts();
        if (!Array.isArray(remote) || remote.length === 0) throw new Error('Empty remote response');
        products = remote;
        // normalize code-like fields
        try { products.forEach(p => { if (p && typeof p === 'object') { if (p.codigo) p.codigo = String(p.codigo).trim(); if (p.predeterminado) p.predeterminado = String(p.predeterminado).trim(); if (p.code) p.code = String(p.code).trim(); } }); } catch (e) {}
        syncSave(products);
        window.__products = products;
        renderAndBind();
        showToast(`Cargados ${products.length} productos desde servidor`, 2000, 'success');
        return true;
      } catch (err) {
        console.warn('server load failed', err);
        return false;
      } finally {
        hideLoading();
      }
    };

    const ok = await tryServer();
    if (ok) return;

    // fallback to local storage
    try {
      const local = loadProducts();
      if (!local || !Array.isArray(local) || local.length === 0) {
        showToast('No hay productos guardados localmente', 2000, 'error');
        return;
      }
      products = local;
      // normalize code-like fields
      try { products.forEach(p => { if (p && typeof p === 'object') { if (p.codigo) p.codigo = String(p.codigo).trim(); if (p.predeterminado) p.predeterminado = String(p.predeterminado).trim(); if (p.code) p.code = String(p.code).trim(); } }); } catch (e) {}
      window.__products = products;
      renderAndBind();
      showToast(`Cargados ${products.length} productos desde local`, 2000, 'success');
    } catch (err) {
      console.error('load local products error', err);
      showToast('Error cargando productos locales', 2500, 'error');
    }
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
  // for fixed positioning we should NOT add window.scrollX/Y (rect is already viewport-relative)
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
