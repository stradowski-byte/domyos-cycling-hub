const CACHE_NAME = 'domyos-cycling-hub-v2.1.0';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './apple-touch-icon.png',
  './pwa-192x192.png',
  './pwa-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept external API calls (Firebase, Google Fit, Intervals.icu, Google OAuth)
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('intervals.icu') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('gstatic.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Navigation / HTML shell requests: Network-first with no-store so new GitHub Actions deployments
  // are picked up immediately on app startup, falling back to cache when offline!
  if (
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html')
  ) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request, { cache: 'no-store' });
          if (networkResponse && networkResponse.status === 200) {
            const mainCache = await caches.open(CACHE_NAME);
            await mainCache.put(event.request, networkResponse.clone());
            await mainCache.put('./index.html', networkResponse.clone());
            return networkResponse;
          }
        } catch {
          // Offline mode — fall through to cache
        }

        const cached =
          (await caches.match(event.request)) ||
          (await caches.match('./index.html')) ||
          (await caches.match('./'));
        return cached || Response.error();
      })()
    );
    return;
  }

  // Static JS/CSS/font assets: Stale-while-revalidate for fast startup + background refresh
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
