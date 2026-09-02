/* ============================================================
   Fire-S desktop / PC workspace
   Owner and Manager see a site address they can type on a computer.
   ?desktop=1 opens the wide layout and the Management dashboard
   after Access is closed and the boot screen is gone.
   ============================================================ */
(function fireSDesktopAccess() {
  'use strict';

  const LIVE_URL = 'https://georgevdx.github.io/fire-s-online-app/';
  let leftByUser = false;
  let painting = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function isShown(el) {
    if (!el) return false;
    if (el.hidden) return false;
    const inline = String(el.style && el.style.display || '').toLowerCase();
    if (inline === 'none') return false;
    try {
      const cs = window.getComputedStyle(el);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    } catch (_) {}
    return true;
  }

  function isBooting() {
    try {
      return document.documentElement.classList.contains('fire-s-booting');
    } catch (_) {}
    return false;
  }

  function isManagement() {
    const body = document.body;
    if (!body) return false;
    if (body.classList.contains('fire-s-role-inspector')) return false;
    return (
      body.classList.contains('fire-s-role-owner') ||
      body.classList.contains('fire-s-role-manager') ||
      body.classList.contains('fire-s-role-management')
    );
  }

  function wantsDesktop() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('desktop') === '1' || params.get('view') === 'desktop') {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function desktopAddress() {
    try {
      const loc = window.location;
      if (loc.protocol === 'http:' || loc.protocol === 'https:') {
        const path = String(loc.pathname || '/').replace(/index\.html$/i, '');
        const base = loc.origin + (path.endsWith('/') ? path : `${path}/`);
        return `${base}?desktop=1`;
      }
    } catch (_) {}
    return `${LIVE_URL}?desktop=1`;
  }

  function accessGateOpen() {
    return isShown(byId('fireSGetStarted'));
  }

  function isBusyAwayFromHome() {
    const body = document.body;
    if (!body) return false;
    if (body.classList.contains('fire-s-filling-inspection')) return true;
    if (isShown(byId('projectFormSection'))) return true;
    if (isShown(byId('projectListSection'))) return true;
    return false;
  }

  function applyDesktopMode() {
    if (!wantsDesktop()) return false;
    const html = document.documentElement;
    if (html && !html.classList.contains('fire-s-desktop-view')) {
      html.classList.add('fire-s-desktop-view');
    }
    if (document.body && !document.body.classList.contains('fire-s-desktop-view')) {
      document.body.classList.add('fire-s-desktop-view');
    }
    return true;
  }

  function landingShouldHold() {
    if (!wantsDesktop()) return false;
    if (leftByUser) return false;
    if (!isManagement()) return false;
    if (accessGateOpen()) return false;
    if (isBusyAwayFromHome()) return false;
    return true;
  }

  function maybeOpenDesktopWorkspace() {
    applyDesktopMode();
    if (isBooting()) return false;
    if (!landingShouldHold()) return false;
    if (typeof window.fireSOpenManagementDashboard !== 'function') return false;
    const section = byId('managementDashboardSection');
    if (isShown(section)) return true;
    try {
      window.fireSOpenManagementDashboard();
      return true;
    } catch (_) {
      return false;
    }
  }

  function leaveDesktopDashboard() {
    leftByUser = true;
  }

  function wrapShowHome() {
    const previous = window.showHome;
    if (typeof previous !== 'function' || previous.__fireSDesktopShowHome) return;
    const wrapped = function fireSDesktopShowHome() {
      const result = previous.apply(this, arguments);
      if (!leftByUser) maybeOpenDesktopWorkspace();
      return result;
    };
    wrapped.__fireSDesktopShowHome = true;
    window.showHome = wrapped;
    try {
      showHome = wrapped;
    } catch (_) {}
  }

  function paint() {
    if (painting) return;
    painting = true;
    try {
      applyDesktopMode();
      const box = byId('fireSDesktopAccess');
      const urlEl = byId('fireSDesktopAccessUrl');
      const note = byId('fireSDesktopAccessNote');
      if (box) {
        const url = desktopAddress();
        if (urlEl && urlEl.textContent !== url) urlEl.textContent = url;
        const hide = !isManagement();
        if (box.hidden !== hide) box.hidden = hide;
        if (note && !note.dataset.fireSCopied) {
          const next = wantsDesktop()
            ? 'Desktop workspace is on. Owner and Manager land on the Management dashboard.'
            : '';
          if (note.textContent !== next) note.textContent = next;
        }
      }
      maybeOpenDesktopWorkspace();
    } finally {
      painting = false;
    }
  }

  function copyAddress() {
    const url = desktopAddress();
    const note = byId('fireSDesktopAccessNote');
    const done = function (ok) {
      if (!note) return;
      note.dataset.fireSCopied = ok ? '1' : '';
      note.textContent = ok
        ? 'Address copied. Open it in Chrome on a computer. It opens the Management dashboard.'
        : 'Could not copy. Long-press the address and copy it.';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => done(true)).catch(() => done(false));
      return;
    }
    try {
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', 'readonly');
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand('copy');
      field.remove();
      done(ok);
    } catch (_) {
      done(false);
    }
  }

  function bind() {
    const copyBtn = byId('fireSDesktopAccessCopyBtn');
    if (copyBtn && !copyBtn.__fireSBound) {
      copyBtn.__fireSBound = true;
      copyBtn.addEventListener('click', copyAddress);
    }
  }

  function wrapReveal() {
    const previous = window.fireSRevealApp;
    if (typeof previous !== 'function' || previous.__fireSDesktopWrapped) return;
    const wrapped = function fireSDesktopRevealApp() {
      const result = previous.apply(this, arguments);
      paint();
      return result;
    };
    wrapped.__fireSDesktopWrapped = true;
    window.fireSRevealApp = wrapped;
  }

  function watch() {
    try {
      const access = byId('fireSGetStarted');
      if (access) {
        const accessWatch = new MutationObserver(paint);
        accessWatch.observe(access, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      }
    } catch (_) {}
    try {
      const htmlWatch = new MutationObserver(() => {
        if (!isBooting()) paint();
      });
      htmlWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
    try {
      if (document.body) {
        const bodyWatch = new MutationObserver(paint);
        bodyWatch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (_) {}
  }

  function boot() {
    applyDesktopMode();
    bind();
    wrapReveal();
    wrapShowHome();
    paint();
    watch();
    [400, 900, 2000, 3200, 5000].forEach(ms => {
      setTimeout(function () {
        wrapShowHome();
        paint();
      }, ms);
    });
  }

  window.fireSDesktopAddress = desktopAddress;
  window.fireSRefreshDesktopAccess = paint;
  window.fireSMaybeOpenDesktopWorkspace = maybeOpenDesktopWorkspace;
  window.fireSDesktopLandingActive = landingShouldHold;
  window.fireSLeaveDesktopDashboard = leaveDesktopDashboard;
  window.fireSWantsDesktop = wantsDesktop;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
