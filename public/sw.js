const CACHE_NAME = 'cam-lms-v3'; // bumped to v3

const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET' || url.startsWith('chrome-extension')) return;

  // Skip Telegram widget scripts — never cache third-party auth scripts
  if (url.includes('telegram.org')) return;

  // ── API calls: network-first, offline fallback ────────────────────────────
  if (url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'You are offline' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // ── .well-known/assetlinks.json: always network, never cache ─────────────
  // Android reads this file to decide whether to open links in the PWA.
  // Serving a stale cached copy can break PWA deep linking from Telegram.
  if (url.includes('/.well-known/')) {
    event.respondWith(fetch(request));
    return;
  }

  // ── Everything else: network-first, cache fallback ────────────────────────
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match('/');
          return new Response('Offline', { status: 503 });
        })
      )
  );
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'LMS App', {
    body:  data.body  || '',
    icon:  '/icon-192x192.png',
    badge: '/icon-192x192.png',
  });
});

// ── Notification click: open PWA at the notified URL ─────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If PWA window already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new PWA window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});