const CACHE_NAME = 'fireyesa-cache-v90-offline-safe';

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './occupancies.json',
  './requirements.json',
  './checklists.json',
  './templates.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        for (const file of APP_SHELL) {
          try {
            await cache.add(file);
          } catch (error) {
            console.warn('Could not cache:', file, error);
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then(response => {
        const responseClone = response.clone();

        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(request, responseClone);
          })
          .catch(error => {
            console.warn('Cache put failed:', error);
          });

        return response;
      })
      .catch(() => {
        return caches.match(request)
          .then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }

            return new Response('', {
              status: 503,
              statusText: 'Offline and not cached'
            });
          });
      })
  );
});