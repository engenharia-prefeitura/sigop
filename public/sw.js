const CACHE_NAME = 'sigop-pwa-v2';
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const withBase = path => `${BASE_PATH}${path}`;
const APP_SHELL = [
  withBase('/'),
  withBase('/index.html'),
  withBase('/manifest.webmanifest'),
  withBase('/sigop-icon.svg'),
  withBase('/clear-storage.html')
];

const ASSET_RE = /(?:src|href)=["']([^"']+)["']/g;
const CSS_URL_RE = /url\(["']?([^"')]+)["']?\)/g;

const toScopedPath = rawPath => {
  if (!rawPath || rawPath.startsWith('http') || rawPath.startsWith('data:') || rawPath.startsWith('#')) {
    return null;
  }

  const normalized = rawPath.replace(/^\.\//, '');
  if (normalized.startsWith('/')) return normalized;
  return withBase(`/${normalized}`);
};

const cacheBuiltAssetsFromIndex = async cache => {
  const response = await fetch(withBase('/index.html'), { cache: 'no-store' });
  if (!response.ok) return;

  await cache.put(withBase('/index.html'), response.clone());
  const html = await response.text();
  const assets = Array.from(html.matchAll(ASSET_RE))
    .map(match => toScopedPath(match[1]))
    .filter(path => path && (
      path.includes('/assets/') ||
      path.endsWith('.css') ||
      path.endsWith('.js') ||
      path.endsWith('.woff') ||
      path.endsWith('.woff2') ||
      path.endsWith('.ico')
    ));

  if (assets.length) {
    const uniqueAssets = [...new Set(assets)];
    await cache.addAll(uniqueAssets);

    const cssAssets = uniqueAssets.filter(path => path.endsWith('.css'));
    const cssDependencies = [];
    for (const cssPath of cssAssets) {
      const cssResponse = await cache.match(cssPath);
      if (!cssResponse) continue;

      const css = await cssResponse.text();
      for (const match of css.matchAll(CSS_URL_RE)) {
        const assetPath = toScopedPath(match[1]);
        if (assetPath) cssDependencies.push(assetPath);
      }
    }

    if (cssDependencies.length) {
      await cache.addAll([...new Set(cssDependencies)]);
    }
  }
};

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => caches.open(CACHE_NAME))
      .then(cache => cacheBuiltAssetsFromIndex(cache).catch(() => undefined))
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

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(withBase('/index.html'), copy);
            cacheBuiltAssetsFromIndex(cache).catch(() => undefined);
          });
          return response;
        })
        .catch(() => caches.match(withBase('/index.html')))
    );
    return;
  }

  if (isAppAsset) {
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
