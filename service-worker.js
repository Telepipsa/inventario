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
  const req = e.request;
  const url = new URL(req.url);

  // Heuristics: treat navigations and HTML accepts as navigation
  const isNavigation = req.mode === 'navigate' || (req.headers && (req.headers.get('accept') || '').includes('text/html'));
  // treat supabase and typical REST paths as API requests
  const isSupabase = url.hostname && url.hostname.includes('supabase.co');
  const isApi = url.pathname && (url.pathname.startsWith('/api') || url.pathname.startsWith('/rest') || url.pathname.startsWith('/api/'));

  // Network-first for navigation and API calls (prefer fresh data)
  if (isNavigation || isSupabase || isApi) {
    e.respondWith(
      fetch(req).then(networkRes => {
        // Optionally update cache for navigation responses here if desired
        return networkRes;
      }).catch(() => {
        // If offline or network fails, fall back to cache if present
        return caches.match(req).then(cached => cached || new Response('', { status: 503, statusText: 'Service Unavailable' }));
      })
    );
    return;
  }

  // Default: cache-first for static assets (fast load)
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(net => {
        // Optionally cache fetched assets here
        return net;
      }).catch(() => cached);
    })
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
