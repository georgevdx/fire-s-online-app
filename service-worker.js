const CACHE_NAME = 'fire-s-rc-1-1-8H-executive-snapshot-filter-fix';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './occupancies.json',
  './requirements.json',
  './checklists.json',
  './templates.json',
  './manifest.json',
  './icon-192.png',
  './supabase-js-v2.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(error => {
        console.warn('Service worker install cache failed:', error);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then(networkResponse => {
            const responseClone = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(request, responseClone);
              })
              .catch(error => {
                console.warn('Runtime cache failed:', error);
              });

            return networkResponse;
          })
          .catch(() => {
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }

            return caches.match(request);
          });
      })
  );
});