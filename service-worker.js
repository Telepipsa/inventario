// Service worker placed at site root so it can control the whole app
// Bumped to v3 to ensure clients fetch latest CSS/JS after deploy
const CACHE = 'inventario-app-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/public/manifest.json',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
  '/public/app.js',
  '/src/styles/main.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(err => console.error('SW install cache error', err)).then(() => {
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

// Simple push handler: notification payload will be shown when a push arrives
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'Producto caducado';
  const title = 'Inventario';
  const options = {
    body: data,
    icon: '/public/icons/icon-192.png',
    badge: '/public/icons/icon-192.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  ev.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    if (list.length > 0) return list[0].focus();
    return clients.openWindow('/');
  }));
});
