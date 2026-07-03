// Fire-S Manual Sprint 202B
// Service worker disabled for manual deployment mode.
// This prevents stale cached app.js/json files from causing loading errors.
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  return;
});
