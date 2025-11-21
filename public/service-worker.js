// /public/service-worker.js
// Bump cache name when changing assets so clients fetch latest files
const CACHE = 'inventario-app-v3';
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
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(err => {
      console.error('SW install cache error', err);
    }).then(() => {
      // Force the waiting service worker to become the active one
      try { self.skipWaiting(); } catch (err) { /* ignore */ }
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE) ? caches.delete(k) : Promise.resolve()))).then(() => {
      try { self.clients.claim(); } catch (err) { /* ignore */ }
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request)).catch(() => fetch(e.request))
  );
});

// Push opcional (requiere servidor de push)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'Producto caducado';
  event.waitUntil(
    self.registration.showNotification('Inventario', {
      body: data,
      icon: '/public/icons/icon-192.png',
      badge: '/public/icons/icon-192.png'
    })
  );
});
