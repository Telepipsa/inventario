// /src/components/table.js
import { isTodayOrPast } from '../services/expiry.js';

let lastDataset = [];

function formatExpiry(val) {
  if (!val) return '-';
  // accept ISO or other formats; try to build a Date
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return val;
  const day = d.getDate();
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const mon = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} de ${mon} ${year}`;
}

export function renderTable(products) {
  lastDataset = products;
  const table = document.getElementById('productTable');
  // helper to safely obtain a trimmed code value from a product
  function displayCode(p) {
    const raw = (p && (p.codigo || p.predeterminado || p.code || p.Codigo || p.CODIGO || p.codigoProducto || p.Code)) || '';
    try { return raw.toString().trim(); } catch (e) { return '';} 
  }
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:36px;"><input type="checkbox" id="selectAll"></th>
        <th style="width:80px;">Código</th>
        <th>Producto</th>
        <th>Stock</th>
        <th>Caducidad</th>
        <th style="width:90px;text-align:center;">Acciones</th>
      </tr>
    </thead>
    <tbody>
      ${products.map((p, i) => `
        <tr data-index="${i}" data-global-index="${window.__products && Array.isArray(window.__products) ? window.__products.findIndex(q => q === p) : i}" class="${p.__highlight ? 'row-'+p.__highlight : ''}">
          <td><input type="checkbox" class="row-check" data-index="${i}" data-global-index="${window.__products && Array.isArray(window.__products) ? window.__products.findIndex(q => q === p) : i}"></td>
          <td style="font-family:monospace;width:80px;">${displayCode(p)}</td>
          <td class="product-cell">
            <img src="./public/icons/${p.icon || 'icon-192.png'}" alt="${p.producto}" onerror="this.src='./public/icons/icon-192.png'">
            <div>
              <div style="font-weight:600;">${p.producto}</div>
            </div>
          </td>
          <td>
            <div class="stock-controls" data-index="${i}" data-global-index="${window.__products && Array.isArray(window.__products) ? window.__products.findIndex(q => q === p) : i}">
              <button class="btn btn-outline btn-stock-minus" data-index="${i}">-</button>
              <span class="stock-value">${p.stock ?? 0}</span>
              <button class="btn btn-outline btn-stock-plus" data-index="${i}">+</button>
            </div>
          </td>
          <td style="${isTodayOrPast(p.caducidad) ? 'color:#d32f2f;font-weight:600;' : ''}">
            ${formatExpiry(p.caducidad)}
          </td>
          <td style="text-align:center;width:90px;">
            <button class="btn btn-outline btn-edit" data-index="${i}">Editar</button>
          </td>
        </tr>`).join('')}
    </tbody>
  `;
}

export function bindRowEvents(onEdit, dataset = lastDataset) {
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = +e.currentTarget.dataset.index;
      // pass the button element so caller can position popover
      onEdit(index, dataset, e.currentTarget);
    });
  });
  // stock +/- buttons
  document.querySelectorAll('.btn-stock-plus').forEach(b => {
    b.addEventListener('click', (e) => {
      const i = +e.currentTarget.dataset.index;
      const ev = new CustomEvent('stock-change', { detail: { index: i, delta: 1 }, bubbles: true });
      e.currentTarget.dispatchEvent(ev);
    });
  });
  document.querySelectorAll('.btn-stock-minus').forEach(b => {
    b.addEventListener('click', (e) => {
      const i = +e.currentTarget.dataset.index;
      const ev = new CustomEvent('stock-change', { detail: { index: i, delta: -1 }, bubbles: true });
      e.currentTarget.dispatchEvent(ev);
    });
  });
  const selectAll = document.getElementById('selectAll');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      document.querySelectorAll('.row-check').forEach(ch => ch.checked = e.target.checked);
    });
  }
}

export function getSelectedIndexes() {
  const checks = [...document.querySelectorAll('.row-check')].filter(ch => ch.checked);
  return checks.map(ch => {
    // prefer global index attribute when available
    const gi = ch.dataset.globalIndex !== undefined ? +ch.dataset.globalIndex : null;
    if (gi !== null && !Number.isNaN(gi)) return gi;
    const i = +ch.dataset.index;
    const row = document.querySelector(`tr[data-index="${i}"]`);
    if (!row) return -1;
    const item = lastDataset[i];
    if (window.__products && Array.isArray(window.__products)) {
      const idx = window.__products.findIndex(p => p === item);
      return idx >= 0 ? idx : i;
    }
    return i;
  }).filter(i => i >= 0);
}
