const CACHE_NAME = 'sigop-pwa-v1';
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const withBase = path => `${BASE_PATH}${path}`;
const APP_SHELL = [
  withBase('/'),
  withBase('/index.html'),
  withBase('/manifest.webmanifest'),
  withBase('/sigop-icon.svg'),
  withBase('/clear-storage.html')
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';
  const isAppAsset = url.origin === self.location.origin;
  const isCacheableExternal =
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('cdnjs.cloudflare.com');

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(withBase('/index.html'), copy));
          return response;
        })
        .catch(() => caches.match(withBase('/index.html')))
    );
    return;
  }

  if (isAppAsset || isCacheableExternal) {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request)
          .then(response => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);

        return cached || network;
      })
    );
  }
});
