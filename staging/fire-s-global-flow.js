/* ============================================================
   Fire-S global process
   One practical path after splash:
   Access (if not signed in) → Home → Inspection Gateway (all) → form → back.
   ============================================================ */
(function fireSGlobalFlow() {
  'use strict';

  if (window.__fireSGlobalFlow) return;
  window.__fireSGlobalFlow = true;

  function isLocalFallback(profile) {
    const p = profile || window.currentUserProfile;
    if (!p || !p.id) return true;
    if (p.id === 'local-user') return true;
    return String(p.email || '').toLowerCase() === 'local@fire-s.app';
  }

  function openAccessLogin() {
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
    try {
      if (typeof window.fireSOpenAccess === 'function') window.fireSOpenAccess('login');
    } catch (_) {}
  }

  const GATEWAY_COPY = 'Open, continue, search and manage inspections.';

  function assertGatewayLabel() {
    const btn = document.getElementById('cmdInspectionsBtn');
    if (!btn) return;
    const title = btn.querySelector('.command-title, .stat-label, strong');
    if (title && /this month/i.test(title.textContent || '')) {
      title.textContent = 'Inspection Gateway';
    }
    const copy = btn.querySelector('.command-copy');
    if (copy) {
      const text = String(copy.textContent || '').trim();
      if (/this month/i.test(text) || /^Search, open/i.test(text)) {
        copy.textContent = GATEWAY_COPY;
      }
    }
    const currentLabel = typeof btn.getAttribute === 'function' ? btn.getAttribute('aria-label') : '';
    if (currentLabel !== 'Inspection Gateway') btn.setAttribute('aria-label', 'Inspection Gateway');
    if (btn.title !== 'Inspection Gateway') btn.title = 'Inspection Gateway';
  }

  function wrapShowProjectList() {
    const previous = window.showProjectList;
    if (typeof previous !== 'function' || previous.__fireSGlobalFlow) return;
    const wrapped = function fireSGlobalShowProjectList() {
      if (isLocalFallback()) {
        openAccessLogin();
        return;
      }
      return previous.apply(this, arguments);
    };
    wrapped.__fireSGlobalFlow = true;
    window.showProjectList = wrapped;
    try {
      showProjectList = wrapped;
    } catch (_) {}
  }

  function settleAfterSplash() {
    wrapShowProjectList();
    assertGatewayLabel();
    try {
      if (!window.__fireSAuthSettled) return;
      if (window.__fireSSessionPending || window.__fireSLoggingIn) return;
      if (typeof window.fireSShouldShowAccess === 'function' && window.fireSShouldShowAccess()) {
        openAccessLogin();
      }
    } catch (_) {}
  }

  function pinGatewayAfter(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__fireSGatewayPin) return;
    const wrapped = function fireSGatewayPinAfter() {
      const result = original.apply(this, arguments);
      assertGatewayLabel();
      return result;
    };
    wrapped.__fireSGatewayPin = true;
    window[name] = wrapped;
    try {
      window.eval(name + ' = window.' + name + ';');
    } catch (_) {}
  }

  window.fireSSettleGlobalFlow = settleAfterSplash;

  function boot() {
    wrapShowProjectList();
    pinGatewayAfter('showHome');
    pinGatewayAfter('renderHomeCommandCentre');
    assertGatewayLabel();
    document.addEventListener('fire-s:auth-settled', settleAfterSplash);
    settleAfterSplash();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(assertGatewayLabel);
    } else {
      setTimeout(assertGatewayLabel, 0);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
