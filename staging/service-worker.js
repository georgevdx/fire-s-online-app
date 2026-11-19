const CACHE = 'fire-s-108-84-toets-130';
const SHELL = [
  './index.html',
  './index.html?toets=130',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './fire-s-logo.png',
  './privacy.html',
  './terms.html',
  './checklists.json',
  './occupancies.json',
  './requirements.json',
  './templates.json',
  './rules.json',
  './styles.css?v=1-3-124-pdf',
  './inspector-v4.css?v=4-7-priority',
  './fire-s-clean-home-roles.css?v=1-26-hide-access',
  './fire-s-owner-lists.css?v=1-3-home-lookup',
  './fire-s-simple-cloud-sync.css?v=1-1-menu-on-screen',
  './fire-s-company-team.css?v=1-8-isolate',
  './fire-s-inspector-board.css?v=1-1',
  './fire-s-get-started.css?v=2-23-howto-ink',
  './fire-s-subscribe.css?v=1-17-cancelled-banner',
  './fire-s-fit-text.css?v=1-19-actovd',
  './fire-s-company-letterhead.css?v=1-2-isolate',
  './fire-s-test-samples.css?v=1-0',
  './fire-s-user-manual.css?v=1-0',
  './fire-s-management-dashboard.css?v=1-13-laptop-fit',
  './fire-s-desktop-access.css?v=1-3-fit-layout',
  './fire-s-screen-lock.css?v=1-2-blank-click',
  './fire-s-entitlement.css?v=1-3-114-hide-pw',
  './fire-s-dark-type.css?v=1-13-howto-ink',
  './fire-s-hira.css?v=1-0-hira',
  './fire-s-env.js?v=1-3-130-toets',
  './fire-s-password-reset.js?v=1-3-open-link',
  './supabase-js-v2.js?v=1',
  './fire-s-one-instrument.js?v=1-1-login-once',
  './action-engine.js?v=103-5-action-dashboard',
  './action-register.js?v=103-5-action-dashboard',
  './building-passport.js?v=104-5-hide-during-fill',
  './building-passport-assets.js',
  './passport-consolidation.js?v=104-5-hide-during-fill',
  './premises-workspace.js?v=105-1-hide-during-fill',
  './action-sync-fix.js?v=105-1-action-sync-fix',
  './action-register-live-fix.js?v=105-2-action-register-live-fix',
  './action-register-hard-fix.js?v=105-3-action-register-hard-fix',
  './new-inspection-flow.js?v=106-1-hide-during-fill',
  './fire-s-service-requests.js?v=1-2-archive',
  './app.js?v=1-3-130-toets',
  './inspection-lifecycle-engine.js?v=1-2-save-notice',
  './inspector-v4.js?v=4-10-open-card',
  './fire-s-clean-home-roles.js?v=2-55-calm',
  './fire-s-owner-lists.js?v=1-3-130-toets',
  './fire-s-simple-cloud-sync.js?v=2-3-calm',
  './fire-s-subscribe-notify.js?v=1-6-svc-req',
  './fire-s-company-team.js?v=2-24-isolate',
  './fire-s-schedule-assign.js?v=1-4-date-picker',
  './fire-s-company-letterhead.js?v=1-6-isolate',
  './fire-s-test-samples.js?v=1-4-subscribe',
  './fire-s-subscriptions.js?v=1-21-paid-days',
  './fire-s-md5.js?v=2-19-0',
  './fire-s-payfast.js?v=1-16-stop-payfast',
  './fire-s-subscribe.js?v=1-46-cancelled-banner',
  './fire-s-user-manual.js?v=1-50-same-cancel',
  './fire-s-management-dashboard.js?v=1-21-action-label',
  './fire-s-inspector-board.js?v=1-5-calm',
  './fire-s-get-started.js?v=2-62-once',
  './fire-s-change-password.js?v=1-0-temp-pw',
  './fire-s-startup-stability.js?v=1-16-ready',
  './fire-s-hira.js?v=1-0-hira',
  './fire-s-screen-lock.js?v=1-8-still',
  './fire-s-phone-back.js?v=1-5-fullscreen-fit',
  './fire-s-global-flow.js?v=1-2-calm',
  './fire-s-desktop-access.js?v=1-5-calm',
  './fire-s-gateway-still.js?v=1-0-sync',
  './fire-s-qa-gates.js?v=1-1-single-action',
  './fire-s-finish-unlock.js?v=1-1-qaexpand',
  './fire-s-entitlement.js?v=1-3-127-calm'
];

function stableUrl(url) {
  const stable = new URL(url.href);
  if (/\.json$/i.test(stable.pathname)) stable.search = '';
  return stable.href;
}

async function storeResponse(cache, req, res, url, isAppDoc) {
  if (!res || !res.ok) return;
  const copy = res.clone();
  cache.put(req, copy).catch(() => undefined);
  const stable = stableUrl(url);
  if (stable !== req.url) {
    cache.put(stable, res.clone()).catch(() => undefined);
  }
  if (isAppDoc) {
    cache.put('./index.html?toets=130', res.clone()).catch(() => undefined);
    cache.put('./index.html', res.clone()).catch(() => undefined);
  }
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => Promise.all(SHELL.map(url =>
      fetch(url, { cache: 'no-store' })
        .then(res => {
          if (res && res.ok) return cache.put(url, res);
          return undefined;
        })
        .catch(() => undefined)
    )))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
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
  const isAppDoc = isDoc && (/\/index\.html$/i.test(path) || path.endsWith('/'));
  const fresh = isDoc || /\.css$/i.test(path) || /\.js$/i.test(path);
  event.respondWith(
    fetch(req, fresh ? { cache: 'no-store' } : undefined)
      .then(res => {
        caches.open(CACHE)
          .then(cache => storeResponse(cache, req, res, url, isAppDoc))
          .catch(() => undefined);
        return res;
      })
      .catch(() => caches.open(CACHE).then(async cache => {
        const stable = stableUrl(url);
        const hit = await cache.match(req) || await cache.match(stable);
        if (hit) return hit;
        if (/\.json$/i.test(path)) {
          const name = path.slice(path.lastIndexOf('/') + 1);
          return (await cache.match('./' + name)) || new Response('', { status: 504, statusText: 'Offline' });
        }
        if (!isDoc) return new Response('', { status: 504, statusText: 'Offline' });
        return (await cache.match('./index.html?toets=130'))
          || (await cache.match('./index.html'))
          || new Response('', { status: 504, statusText: 'Offline' });
      }))
  );
});
