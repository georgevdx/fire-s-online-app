/* ============================================================
   Fire-S Startup Stability
   - Hide multi-page flicker while modules fight on boot
   - Keep the Fire-S logo splash until Access (signed out) or Home (signed in)
   - Show the same splash again from the Login tap until Home opens
   - Keep full sync in the background after first paint
   ============================================================ */
(function fireSStartupStability() {
  'use strict';

  const BOOT_MIN_MS = 2200;
  const BOOT_MAX_MS = 4000;
  const BOOT_SESSION_MAX_MS = 12000;
  const SPLASH_HOLD_MS = 2200;
  let revealed = false;
  let revealTimer = null;
  let hardStopTimer = null;
  let splashGen = 0;
  let splashShownAt = 0;
  const startedAt = Date.now();

  function byId(id) {
    return document.getElementById(id);
  }

  function setSplashCopy(message) {
    const line = byId('fireSBootStatus') || document.querySelector('#fireSBootScreen p');
    if (line && message) line.textContent = message;
  }

  function sessionStillRestoring() {
    try {
      if (window.__fireSLoggingIn) return true;
      // Cover the gap before getSession returns: neither pending nor settled yet.
      if (!window.__fireSAuthSettled) return true;
      // A previous login is restoring Home — keep the logo up until reveal('home').
      if (window.__fireSSessionPending) return true;
    } catch (_) {}
    return false;
  }

  function showSplash(message) {
    splashGen += 1;
    splashShownAt = Date.now();
    revealed = false;
    document.documentElement.classList.add('fire-s-booting');
    document.documentElement.classList.remove('fire-s-ready');
    const boot = byId('fireSBootScreen');
    if (boot) {
      boot.classList.add('is-on');
      boot.hidden = false;
      boot.removeAttribute('hidden');
      boot.style.setProperty('display', 'flex', 'important');
      boot.style.setProperty('z-index', '200000', 'important');
      boot.style.setProperty('opacity', '1', 'important');
      boot.style.setProperty('visibility', 'visible', 'important');
      try {
        document.body.appendChild(boot);
      } catch (_) {}
    }
    setSplashCopy(message || 'Loading…');
    const app = document.querySelector('.app');
    if (app) {
      app.style.opacity = '0';
      app.style.pointerEvents = 'none';
    }
  }

  function hideSplashNow() {
    revealed = true;
    document.documentElement.classList.remove('fire-s-booting');
    document.documentElement.classList.add('fire-s-ready');
    const boot = byId('fireSBootScreen');
    if (boot) {
      boot.classList.remove('is-on');
      boot.style.setProperty('display', 'none', 'important');
    }
    const app = document.querySelector('.app');
    if (app) {
      app.style.opacity = '1';
      app.style.pointerEvents = '';
    }
  }

  function hideSplash() {
    const gen = splashGen;
    const shown = splashShownAt ? Date.now() - splashShownAt : SPLASH_HOLD_MS;
    const wait = Math.max(0, SPLASH_HOLD_MS - shown);
    if (wait > 0) {
      setTimeout(function () {
        if (gen !== splashGen) return;
        hideSplashNow();
      }, wait);
      return;
    }
    hideSplashNow();
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

  function revealApp(reason) {
    if (revealed) return;
    if (sessionStillRestoring() && reason !== 'home') {
      scheduleReveal(reason || 'wait', 400);
      return;
    }
    const elapsed = Date.now() - startedAt;
    const authReady = !!window.__fireSAuthSettled;
    if (reason !== 'timeout' && reason !== 'auth-settled' && reason !== 'home' && !authReady) {
      return;
    }
    if (elapsed < BOOT_MIN_MS && reason !== 'timeout' && reason !== 'home') {
      scheduleReveal(reason || 'min', BOOT_MIN_MS - elapsed);
      return;
    }
    try {
      if (reason === 'home') window.__fireSSessionPending = false;
    } catch (_) {}
    revealed = true;
    clearTimeout(revealTimer);
    clearTimeout(hardStopTimer);

    try {
      forceHomeOnly();
      if (typeof window.fireSApplyCleanHomeRoles === 'function') {
        window.fireSApplyCleanHomeRoles();
      }
      if (typeof window.fireSInspectorV4 === 'function') {
        window.fireSInspectorV4();
      }
      if (
        reason !== 'home' &&
        !sessionStillRestoring() &&
        typeof window.fireSShouldShowAccess === 'function' &&
        window.fireSShouldShowAccess() &&
        typeof window.fireSOpenAccess === 'function'
      ) {
        window.fireSOpenAccess('login');
      }
    } catch (_) {}

    hideSplash();

    try {
      document.documentElement.dataset.fireSBootReason = String(reason || 'ready');
    } catch (_) {}
  }

  function scheduleReveal(reason, delay) {
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => revealApp(reason), delay || 0);
  }

  function hardStop() {
    if (sessionStillRestoring() && Date.now() - startedAt < BOOT_SESSION_MAX_MS) {
      hardStopTimer = setTimeout(hardStop, 400);
      return;
    }
    revealApp('timeout');
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
      if (window.__fireSLoggingIn) return result;
      try { window.__fireSSessionPending = false; } catch (_) {}
      scheduleReveal('home', 180);
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
    showSplash(window.__fireSLoggingIn ? 'Signing in…' : 'Loading…');

    try {
      document.addEventListener(
        'fire-s:auth-settled',
        function () {
          scheduleReveal('auth-settled', 80);
        },
        { once: true }
      );
    } catch (_) {}

    hardStopTimer = setTimeout(hardStop, BOOT_MAX_MS);

    // Prefer reveal after role home settles — only if auth already knows.
    setTimeout(() => {
      try {
        if (typeof window.fireSApplyCleanHomeRoles === 'function') {
          window.fireSApplyCleanHomeRoles();
        }
      } catch (_) {}
      if (window.__fireSAuthSettled && !sessionStillRestoring()) {
        scheduleReveal('settled', 120);
      }
    }, 700);

    if (window.__fireSAuthSettled && !sessionStillRestoring()) {
      scheduleReveal('auth-settled', 80);
    }
  }

  window.fireSRevealApp = revealApp;
  window.fireSShowSplash = showSplash;
  window.fireSHideSplash = hideSplash;

  try {
    showSplash('Loading…');
  } catch (_) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
