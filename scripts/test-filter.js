// scripts/test-filter.js
// Quick unit test for filter logic used in public/app.js

function matchesTagForTest(p, active) {
  const activeCount = (active.seco ? 1 : 0) + (active.congelado ? 1 : 0) + (active.fresco ? 1 : 0);
  const tipos = Array.isArray(p && p.tipo) ? p.tipo.map(x => (x||'').toString().toLowerCase())
    : (p && typeof p.tipo === 'string' && p.tipo.trim() !== '') ? [p.tipo.toLowerCase()]
    : (Array.isArray(p.tags) ? p.tags.map(x => (x||'').toString().toLowerCase()) : []);
  if (!tipos || tipos.length === 0) {
    if (activeCount === 0 || activeCount === 3) return true;
    return false;
  }
  if (active.seco && tipos.includes('seco')) return true;
  if (active.congelado && tipos.includes('congelado')) return true;
  if (active.fresco && tipos.includes('fresco')) return true;
  return false;
}

const products = [
  { id: 1, producto: 'A', tipo: ['seco'] },
  { id: 2, producto: 'B', tipo: [] },
  { id: 3, producto: 'C' },
  { id: 4, producto: 'D', tags: ['seco'] },
  { id: 5, producto: 'E', tags: [] },
  { id: 6, producto: 'F', tipo: ['congelado'] },
  { id: 7, producto: 'G', tags: ['fresco'] }
];

const scenarios = [
  { name: 'Only Seco', active: { seco: true, congelado: false, fresco: false } },
  { name: 'Seco + Fresco', active: { seco: true, congelado: false, fresco: true } },
  { name: 'All', active: { seco: true, congelado: true, fresco: true } },
  { name: 'Only Congelado', active: { seco: false, congelado: true, fresco: false } },
  { name: 'None (all true fallback)', active: { seco: false, congelado: false, fresco: false } }
];

for (const s of scenarios) {
  console.log('---', s.name, '---');
  const shown = products.filter(p => matchesTagForTest(p, s.active)).map(p => `${p.id}:${p.producto}${p.tipo ? ' (tipo:'+p.tipo+')' : (p.tags ? ' (tags:'+JSON.stringify(p.tags)+')' : '')}`);
  console.log('Shown:', shown.join(', '));
}
