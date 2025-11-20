// /public/service-worker.js
const CACHE = 'inventario-v2';
// Use absolute paths so cached assets match requests regardless of SW location
const ASSETS = [
  '/index.html',
  '/manifest.json',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
  '/public/app.js',
  '/src/styles/main.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE && caches.delete(k))))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// Push opcional (requiere servidor de push)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'Producto caducado';
  event.waitUntil(
    self.registration.showNotification('Inventario', {
      body: data,
      icon: 'icons/icon-192.png'
    })
  );
});
