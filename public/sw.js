// v3: pages are never cached any more. Older versions cached the login page
// ("/") and served it whenever the server was unreachable (e.g. while the
// service restarts), which looked exactly like being logged out.
const CACHE_NAME = 'cam-lms-v3';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Shown instead of the login page when the server can't be reached.
// It retries on its own, and the session cookie is untouched.
const OFFLINE_HTML = `<!doctype html><html lang="km"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>កំពុងភ្ជាប់ឡើងវិញ…</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f1f5f9;color:#0f172a;text-align:center;padding:16px}
@media (prefers-color-scheme:dark){body{background:#000;color:#e2e8f0}}
p{color:#64748b;margin:.5rem 0}</style></head><body><div>
<h2>ប្រព័ន្ធកំពុងចាប់ផ្ដើមឡើងវិញ…</h2>
<p>The system is restarting or you are offline. Reconnecting automatically.</p>
<p>អ្នកមិនចាំបាច់ Login ម្ដងទៀតទេ។</p></div>
<script>setTimeout(function(){location.reload()},5000)</script></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Deletes the old caches, including cached personal pages from v1/v2
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

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?|webmanifest)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  const url = new URL(req.url);

  // API calls: always network, never cached
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ error: 'You are offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Pages: always network (they contain personal data). If the server is
  // unreachable, show the "reconnecting" page — never a cached login page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(OFFLINE_HTML, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      )
    );
    return;
  }

  // Static assets (hashed JS/CSS, icons): cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'LMS App', {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
  });
});