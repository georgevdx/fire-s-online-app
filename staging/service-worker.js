const CACHE = 'fire-s-108-75-toets-111';
const PRECACHE = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './fire-s-logo.png',
  './privacy.html',
  './terms.html'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE).catch(() => undefined))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(windows => Promise.all((windows || []).map(client => {
        try {
          if (client && typeof client.navigate === 'function') {
            return client.navigate(client.url);
          }
        } catch (_) {}
        return undefined;
      })))
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  const path = url.pathname || '';
  const isDoc =
    req.mode === 'navigate' ||
    path.endsWith('/') ||
    /\.html$/i.test(path);
  event.respondWith(
    fetch(req, isDoc ? { cache: 'no-store' } : undefined)
      .then(res => {
        if (res && res.ok && !isDoc) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
