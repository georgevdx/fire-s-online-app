const CACHE_NAME = 'fire-s-rc-1-1-7-building-health-index';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './dashboard.css',
  './workspace.css',
  './app.js',
  './sprint-111-6-conditional-sections.js',
  './sprint-111-7-building-health-index.js',
  './occupancies.json',
  './requirements.json',
  './checklists.json',
  './templates.json',
  './rules.json',
  './manifest.json',
  './supabase-js-v2.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(error => console.warn('Service worker install cache failed:', error))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

function isAppShellRequest(request) {
  const url = new URL(request.url);
  return request.mode === 'navigate' ||
    /\/(index\.html|app\.js|styles\.css|service-worker\.js)$/.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (isAppShellRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
      return response;
    }))
  );
});
