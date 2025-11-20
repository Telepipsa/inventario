const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'products_server.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const API_KEY = process.env.API_KEY || null; // if set, POST endpoints require this key via header 'x-api-key'

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch (e) { console.error('readData error', e); return []; }
}

function writeData(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error('writeData error', e); }
}

function readHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch (e) { console.error('readHistory error', e); return []; }
}

function writeHistory(hist) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(hist, null, 2), 'utf8');
  } catch (e) { console.error('writeHistory error', e); }
}

function pushHistoryEntry(entry) {
  const hist = readHistory();
  hist.push(entry);
  // keep only last 10
  const tail = hist.slice(-10);
  writeHistory(tail);
}

// Serve static site (project root) so you can open the app via this server
const siteRoot = path.join(__dirname, '..');
app.use('/', express.static(siteRoot));

// API endpoints
app.get('/api/products', (req, res) => {
  const items = readData();
  res.json(items);
});

// health check for platform (Render) monitoring
app.get('/healthz', (req, res) => {
  try {
    res.status(200).json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// Replace entire list (write-protected if API_KEY is set)
app.post('/api/products', (req, res) => {
  if (API_KEY) {
    const provided = (req.headers['x-api-key'] || '').toString();
    if (!provided || provided !== API_KEY) return res.status(401).json({ error: 'Missing or invalid API key' });
  }
  const body = req.body;
  if (!Array.isArray(body)) return res.status(400).json({ error: 'Expected array' });
  const before = readData();
  writeData(body);
  const after = body;
  // create history entry
  const entry = {
    id: Date.now(),
    ts: new Date().toISOString(),
    type: 'replace',
    beforeCount: Array.isArray(before) ? before.length : 0,
    afterCount: Array.isArray(after) ? after.length : 0,
    before: before,
    after: after
  };
  pushHistoryEntry(entry);
  res.json({ ok: true, count: body.length });
});

// history endpoints
app.get('/api/history', (req, res) => {
  const hist = readHistory();
  res.json(hist);
});

app.get('/api/history/last', (req, res) => {
  const n = Math.min(50, Math.max(1, parseInt(req.query.n || '10', 10)));
  const hist = readHistory();
  res.json(hist.slice(-n).reverse());
});

// optional: append/merge could be added

app.listen(PORT, () => {
  console.log(`Inventario sync server listening on http://localhost:${PORT}`);
  console.log(`Serving site from ${siteRoot}`);
});
