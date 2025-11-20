// /src/data/import.js
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';

export async function importFile(file) {
  if (file.name.toLowerCase().endsWith('.csv')) {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data.map(normalizeRow))
      });
    });
  }
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    return rows.map(normalizeRow);
  }
  return [];
}

function normalizeRow(row) {
  // Build a normalized key -> value map so we can accept CSVs/XLXS with messy headers
  const normKey = (k) => {
    if (k === undefined || k === null) return '';
    try {
      return k.toString().trim()
        .normalize('NFD')
        .replace(/\u0300-\u036f/g, '')
        .replace(/[^0-9a-zA-Z\s]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '');
    } catch (e) { return k.toString().toLowerCase().trim(); }
  };
  const m = {};
  Object.keys(row || {}).forEach(k => {
    const nk = normKey(k);
    m[nk] = row[k];
  });

  const pick = (cands) => {
    for (const c of cands) {
      if (m[c] !== undefined && m[c] !== null && String(m[c]).toString().trim() !== '') return m[c];
    }
    return undefined;
  };

  // possible header names (normalized) for each field
  const codeCandidates = ['codigo', 'cod', 'code', 'codigoproducto', 'codigo_producto', 'predeterminado', 'predeterminadocodigo'];
  const nameCandidates = ['producto', 'product', 'predeterminado', 'descripcion', 'nombre'];
  const stockCandidates = ['stock', 'cantidad', 'qty', 'units', 'unidades'];
  const dateCandidates = ['caducidad', 'fecha', 'vencimiento', 'expiry', 'expiracion'];
  const iconCandidates = ['icon', 'icono'];

  const rawCode = pick(codeCandidates) ?? '';
  const rawName = pick(nameCandidates) ?? '';
  const rawStock = pick(stockCandidates);
  const rawDate = pick(dateCandidates) ?? '';
  const rawIcon = pick(iconCandidates) ?? '';

  // normalize stock to integer
  let stockVal = 0;
  if (rawStock !== undefined && rawStock !== null && String(rawStock).toString().trim() !== '') {
    const n = parseInt(String(rawStock).replace(/[^0-9\-]/g, ''), 10);
    stockVal = Number.isFinite(n) ? n : 0;
  }

  // normalize date
  let dateVal = '';
  if (rawDate instanceof Date) dateVal = rawDate.toISOString().slice(0,10);
  else if (rawDate && String(rawDate).toString().trim() !== '') dateVal = String(rawDate).trim();

  return {
    codigo: rawCode === undefined || rawCode === null ? '' : String(rawCode).toString().trim(),
    producto: rawName === undefined || rawName === null ? '' : String(rawName).toString().trim(),
    stock: stockVal,
    caducidad: dateVal,
    icon: rawIcon === undefined || rawIcon === null ? '' : String(rawIcon).toString().trim()
  };
}
