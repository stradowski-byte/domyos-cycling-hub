const CACHE_NAME = 'domyos-cycling-hub-v2.0.0';
const OTA_LIVE_CACHE = 'domyos-ota-live-shell';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
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
          .filter((key) => key !== CACHE_NAME && key !== OTA_LIVE_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Listen for In-App OTA Update messages from the installed standalone PWA
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'APPLY_OTA_UPDATE' && typeof data.html === 'string' && data.html.length > 500) {
    event.waitUntil(
      (async () => {
        try {
          const headers = {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Domyos-OTA-Version': String(data.version || '2.0.0'),
            'X-Domyos-OTA-Timestamp': new Date().toISOString(),
          };
          const otaCache = await caches.open(OTA_LIVE_CACHE);
          const mainCache = await caches.open(CACHE_NAME);
          const keysToUpdate = ['./', './index.html', '/', '/index.html'];
          if (self.registration && self.registration.scope) {
            keysToUpdate.push(self.registration.scope);
            keysToUpdate.push(self.registration.scope.replace(/\/$/, '') + '/index.html');
          }
          for (const key of keysToUpdate) {
            await otaCache.put(key, new Response(data.html, { status: 200, headers }));
            await mainCache.put(key, new Response(data.html, { status: 200, headers }));
          }
          await self.skipWaiting();
          await self.clients.claim();
          if (event.source && event.source.postMessage) {
            event.source.postMessage({
              type: 'OTA_UPDATE_APPLIED',
              version: data.version || '2.0.0',
            });
          }
        } catch (err) {
          // ignore
        }
      })()
    );
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept API calls (Google Drive, Intervals.icu, GitHub API, Firebase)
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('intervals.icu') ||
    url.hostname.includes('github.com') ||
    url.hostname.includes('githubusercontent.com') ||
    url.hostname.includes('firebase') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Navigation / HTML shell requests:
  // 1) If an In-App OTA shell was explicitly installed into OTA_LIVE_CACHE, try fresh network first (no-store)
  //    and compare or fallback to OTA_LIVE_CACHE -> CACHE_NAME so offline & instant OTA both work seamlessly!
  if (
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html')
  ) {
    event.respondWith(
      (async () => {
        const otaCache = await caches.open(OTA_LIVE_CACHE);
        const otaResponse =
          (await otaCache.match(event.request)) ||
          (await otaCache.match('./index.html')) ||
          (await otaCache.match('./'));

        try {
          const networkResponse = await fetch(event.request, { cache: 'no-store' });
          if (networkResponse && networkResponse.status === 200) {
            // If we have a newer OTA bundle injected directly from GitHub Raw/API before GitHub Pages CDN finished deploying,
            // prefer the OTA bundle if its version tag is newer than the CDN HTML
            if (otaResponse) {
              const otaClone = otaResponse.clone();
              const netClone = networkResponse.clone();
              const [otaText, netText] = await Promise.all([otaClone.text(), netClone.text()]);
              const extractVer = (txt) => {
                const m = txt.match(/CURRENT_APP_VERSION\s*=\s*["']([^"']+)["']/);
                return m ? m[1] : null;
              };
              const otaVer = extractVer(otaText);
              const netVer = extractVer(netText);
              if (otaVer && netVer && otaVer > netVer) {
                return otaResponse;
              }
            }
            const mainCache = await caches.open(CACHE_NAME);
            await mainCache.put(event.request, networkResponse.clone());
            await mainCache.put('./index.html', networkResponse.clone());
            return networkResponse;
          }
        } catch (err) {
          // Offline mode — fall through to cache
        }

        if (otaResponse) return otaResponse;
        const cached =
          (await caches.match(event.request)) ||
          (await caches.match('./index.html')) ||
          (await caches.match('./'));
        return cached || Response.error();
      })()
    );
    return;
  }

  // Static assets: Cache-first, fallback to network and cache
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
