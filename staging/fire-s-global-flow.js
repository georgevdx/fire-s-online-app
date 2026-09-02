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

  function assertGatewayLabel() {
    const btn = document.getElementById('cmdInspectionsBtn');
    if (!btn) return;
    const title = btn.querySelector('.command-title, .stat-label, strong');
    if (title && /this month/i.test(title.textContent || '')) {
      title.textContent = 'Inspection Gateway';
    }
    const copy = btn.querySelector('.command-copy');
    if (copy && /this month/i.test(copy.textContent || '')) {
      copy.textContent = 'Open, continue, search and manage inspections.';
    }
    btn.setAttribute('aria-label', 'Inspection Gateway');
    btn.title = 'Inspection Gateway';
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
      if (typeof window.fireSShouldShowAccess === 'function' && window.fireSShouldShowAccess()) {
        openAccessLogin();
      }
    } catch (_) {}
  }

  window.fireSSettleGlobalFlow = settleAfterSplash;

  function boot() {
    wrapShowProjectList();
    assertGatewayLabel();
    document.addEventListener('fire-s:auth-settled', settleAfterSplash, { once: true });
    setTimeout(settleAfterSplash, 900);
    setTimeout(assertGatewayLabel, 1600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
