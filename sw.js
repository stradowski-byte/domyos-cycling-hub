const CACHE_NAME = 'domyos-cycling-hub-v1.9.1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        CORE_ASSETS.map((assetUrl) =>
          fetch(assetUrl, { cache: 'no-store' })
            .then((res) => {
              if (res && res.ok) {
                return cache.put(assetUrl, res);
              }
            })
            .catch(() => {})
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(async (keys) => {
        const oldKeys = keys.filter((k) => k !== CACHE_NAME);
        await Promise.all(oldKeys.map((k) => caches.delete(k)));
        await self.clients.claim();
        if (oldKeys.length > 0) {
          const windowClients = await self.clients.matchAll({ type: 'window' });
          for (const client of windowClients) {
            try {
              client.postMessage({ type: 'SW_CACHE_UPDATED', version: CACHE_NAME });
              if ('navigate' in client) {
                await client.navigate(client.url);
              }
            } catch {
              // ignore navigation error
            }
          }
        }
      })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Cache Google Fonts so typography works offline without WiFi
  if (
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request)
            .then((res) => {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
              return res;
            })
            .catch(() => cached)
      )
    );
    return;
  }

  // Same-origin app shell & JS/CSS bundles: Network-first (bypassing stale disk cache) with instant Offline Cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(event.request)
            .then((cached) => cached || caches.match('./index.html') || caches.match('./'))
        )
    );
  }
});
