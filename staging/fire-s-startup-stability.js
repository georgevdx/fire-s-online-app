/* ============================================================
   Fire-S Startup Stability
   - Hide multi-page flicker while modules fight on boot
   - Reveal one stable Home view
   - Keep full sync in the background after first paint
   - Keep the Fire-S splash up from Login tap until the session is fully in
   ============================================================ */
(function fireSStartupStability() {
  'use strict';

  const BOOT_MIN_MS = 1100;
  const BOOT_MAX_MS = 2800;
  let revealed = false;
  let revealTimer = null;
  const startedAt = Date.now();

  function byId(id) {
    return document.getElementById(id);
  }

  function loginHoldsBoot() {
    try {
      return !!window.__fireSLoggingIn;
    } catch (_) {
      return false;
    }
  }

  function forceHomeOnly() {
    const keepDash =
      typeof window.fireSDesktopLandingActive === 'function' &&
      window.fireSDesktopLandingActive();
    const show = new Set(keepDash ? ['managementDashboardSection'] : ['homeSection']);
    [
      'homeSection',
      'testSamplesSection',
      'userManualSection',
      'fireSSubscribeSection',
      'managementDashboardSection',
      'companyLetterheadSection',
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

  function setBootCopy(text) {
    const boot = byId('fireSBootScreen');
    const copy = boot && boot.querySelector('p');
    if (copy && text) copy.textContent = text;
  }

  function holdBootForLogin() {
    revealed = false;
    clearTimeout(revealTimer);
    try {
      document.documentElement.classList.add('fire-s-booting');
      document.documentElement.classList.remove('fire-s-ready');
    } catch (_) {}
    const boot = byId('fireSBootScreen');
    if (boot) boot.style.display = '';
    setBootCopy('Signing in…');
    const app = document.querySelector('.app');
    if (app) {
      app.style.opacity = '0';
      app.style.pointerEvents = 'none';
    }
  }

  function hideSplashOverlay(reason) {
    document.documentElement.classList.remove('fire-s-booting');
    document.documentElement.classList.add('fire-s-ready');
    const boot = byId('fireSBootScreen');
    if (boot) boot.style.display = 'none';
    setBootCopy('Loading…');

    const app = document.querySelector('.app');
    if (app) {
      app.style.opacity = '1';
      app.style.pointerEvents = '';
    }

    try {
      document.documentElement.dataset.fireSBootReason = String(reason || 'ready');
    } catch (_) {}
  }

  function revealApp(reason) {
    if (loginHoldsBoot() && reason !== 'login-done') return;
    if (revealed && reason !== 'login-done') return;
    if (reason === 'login-done') {
      revealed = true;
      clearTimeout(revealTimer);
      hideSplashOverlay('login-done');
      return;
    }
    const elapsed = Date.now() - startedAt;
    const authReady = !!window.__fireSAuthSettled;
    if (reason !== 'timeout' && reason !== 'auth-settled' && !authReady) {
      return;
    }
    if (elapsed < BOOT_MIN_MS && reason !== 'timeout') {
      scheduleReveal(reason || 'min', BOOT_MIN_MS - elapsed);
      return;
    }
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
      if (
        typeof window.fireSShouldShowAccess === 'function' &&
        window.fireSShouldShowAccess() &&
        typeof window.fireSOpenAccess === 'function'
      ) {
        window.fireSOpenAccess('login');
      }
    } catch (_) {}

    hideSplashOverlay(reason);
  }

  function scheduleReveal(reason, delay) {
    if (loginHoldsBoot()) return;
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => revealApp(reason), delay || 0);
  }

  // Background sync should never block first paint — except during Login,
  // when the splash stays up until the cloud inspections have arrived.
  function deferStartupSync() {
    if (typeof window.refreshSyncData !== 'function') return;
    if (window.refreshSyncData.__fireSStartupWrapped) return;

    const original = window.refreshSyncData;
    const wrapped = function fireSStartupAwareRefreshSyncData() {
      if (document.documentElement.classList.contains('fire-s-booting') && !loginHoldsBoot()) {
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
      if (!loginHoldsBoot()) scheduleReveal('showHome', 180);
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

    try {
      document.addEventListener(
        'fire-s:auth-settled',
        function () {
          if (loginHoldsBoot()) return;
          scheduleReveal('auth-settled', 80);
        },
        { once: true }
      );
    } catch (_) {}

    // Hard stop for cold start only. Login keeps the splash until the session is in.
    setTimeout(() => {
      if (loginHoldsBoot()) return;
      revealApp('timeout');
    }, BOOT_MAX_MS);

    // Prefer reveal after role home settles — only if auth already knows.
    setTimeout(() => {
      try {
        if (typeof window.fireSApplyCleanHomeRoles === 'function') {
          window.fireSApplyCleanHomeRoles();
        }
      } catch (_) {}
      if (window.__fireSAuthSettled && !loginHoldsBoot()) scheduleReveal('settled', 120);
    }, 700);

    if (window.__fireSAuthSettled && !loginHoldsBoot()) scheduleReveal('auth-settled', 80);
  }

  window.fireSRevealApp = revealApp;
  window.fireSHoldBoot = holdBootForLogin;
  window.fireSSetBootCopy = setBootCopy;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
