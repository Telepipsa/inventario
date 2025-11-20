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
  return {
    // keep original product code (various possible column names)
    codigo: (row.codigo ?? row.Codigo ?? row.CODIGO ?? row.code ?? row.Code ?? row.CodigoProducto ?? '').toString().trim(),
    producto: (row.producto ?? row.Producto ?? '').toString().trim(),
    stock: (function() {
      const s = row.stock ?? row.Stock ?? 0;
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : 0;
    })(),
    caducidad: (function() {
      const v = row.caducidad ?? row.Caducidad ?? row.fecha ?? '';
      if (!v) return '';
      if (v instanceof Date) return v.toISOString().slice(0,10);
      return v.toString().trim();
    })(),
    // no public 'code' field per request
    icon: (row.icon ?? row.Icon ?? '').toString().trim()
  };
}
