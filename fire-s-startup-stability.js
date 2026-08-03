/* ============================================================
   Fire-S Startup Stability
   - Hide multi-page flicker while modules fight on boot
   - Reveal one stable Home view
   - Keep full sync in the background after first paint
   ============================================================ */
(function fireSStartupStability() {
  'use strict';

  const BOOT_MAX_MS = 2500;
  let revealed = false;
  let revealTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function forceHomeOnly() {
    const show = new Set(['homeSection']);
    [
      'homeSection',
      'companyTeamSection',
      'servicesSection',
      'projectListSection',
      'projectFormSection',
      'findingsCentreSection',
      'reportSection'
    ].forEach(id => {
      const el = byId(id);
      if (!el) return;
      el.style.display = show.has(id) ? 'block' : 'none';
    });
  }

  function revealApp(reason) {
    if (revealed) return;
    revealed = true;
    clearTimeout(revealTimer);

    try {
      forceHomeOnly();
      if (typeof window.fireSApplyCleanHomeRoles === 'function') {
        window.fireSApplyCleanHomeRoles();
      }
      if (typeof window.fireSInspectorV4 === 'function') {
        window.fireSInspectorV4();
      }
    } catch (_) {}

    document.documentElement.classList.remove('fire-s-booting');
    document.documentElement.classList.add('fire-s-ready');
    const boot = byId('fireSBootScreen');
    if (boot) boot.style.display = 'none';

    const app = document.querySelector('.app');
    if (app) {
      app.style.opacity = '1';
      app.style.pointerEvents = '';
    }

    try {
      document.documentElement.dataset.fireSBootReason = String(reason || 'ready');
    } catch (_) {}
  }

  function scheduleReveal(reason, delay) {
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => revealApp(reason), delay || 0);
  }

  // Background sync should never block first paint.
  function deferStartupSync() {
    if (typeof window.refreshSyncData !== 'function') return;
    if (window.refreshSyncData.__fireSStartupWrapped) return;

    const original = window.refreshSyncData;
    const wrapped = function fireSStartupAwareRefreshSyncData() {
      if (document.documentElement.classList.contains('fire-s-booting')) {
        setTimeout(() => {
          try {
            original.apply(this, arguments);
          } catch (_) {}
        }, 1800);
        return Promise.resolve();
      }
      return original.apply(this, arguments);
    };
    wrapped.__fireSStartupWrapped = true;
    window.refreshSyncData = wrapped;
    try {
      refreshSyncData = wrapped;
    } catch (_) {}
  }

  function wrapShowHome() {
    if (typeof window.showHome !== 'function') return;
    if (window.showHome.__fireSStartupWrapped) return;
    const previous = window.showHome;
    const wrapped = function fireSStartupShowHome() {
      const result = previous.apply(this, arguments);
      forceHomeOnly();
      scheduleReveal('showHome', 180);
      return result;
    };
    wrapped.__fireSStartupWrapped = true;
    window.showHome = wrapped;
    try {
      showHome = wrapped;
    } catch (_) {}
  }

  function init() {
    deferStartupSync();
    wrapShowHome();
    forceHomeOnly();

    // Hard stop: never keep the splash longer than this.
    setTimeout(() => revealApp('timeout'), BOOT_MAX_MS);

    // Prefer reveal after role home settles.
    setTimeout(() => {
      try {
        if (typeof window.fireSApplyCleanHomeRoles === 'function') {
          window.fireSApplyCleanHomeRoles();
        }
      } catch (_) {}
      scheduleReveal('settled', 120);
    }, 700);
  }

  window.fireSRevealApp = revealApp;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
