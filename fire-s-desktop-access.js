/* ============================================================
   Fire-S desktop / PC workspace
   Owner and Manager see a site address they can type on a computer.
   ?desktop=1 opens the wide layout and the Management dashboard.
   ============================================================ */
(function fireSDesktopAccess() {
  'use strict';

  const LIVE_URL = 'https://georgevdx.github.io/fire-s-online-app/';
  let openedThisLoad = false;

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
    const form = byId('projectFormSection');
    if (isShown(form)) return true;
    const list = byId('projectListSection');
    if (isShown(list)) return true;
    return false;
  }

  function applyDesktopMode() {
    if (!wantsDesktop()) return false;
    document.documentElement.classList.add('fire-s-desktop-view');
    if (document.body) document.body.classList.add('fire-s-desktop-view');
    return true;
  }

  function maybeOpenDesktopWorkspace() {
    applyDesktopMode();
    if (!wantsDesktop()) return false;
    if (openedThisLoad) return false;
    if (!isManagement()) return false;
    if (accessGateOpen()) return false;
    if (isBusyAwayFromHome()) return false;
    if (typeof window.fireSOpenManagementDashboard !== 'function') return false;
    openedThisLoad = true;
    try {
      window.fireSOpenManagementDashboard();
      return true;
    } catch (_) {
      openedThisLoad = false;
      return false;
    }
  }

  function paint() {
    const box = byId('fireSDesktopAccess');
    const urlEl = byId('fireSDesktopAccessUrl');
    const note = byId('fireSDesktopAccessNote');
    if (!box) return;
    const url = desktopAddress();
    if (urlEl) urlEl.textContent = url;
    box.hidden = !isManagement();
    if (note && !note.dataset.fireSCopied) {
      note.textContent = wantsDesktop()
        ? 'Desktop workspace is on. Owner and Manager land on the Management dashboard.'
        : '';
    }
    maybeOpenDesktopWorkspace();
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

  function watch() {
    try {
      if (document.body) {
        const bodyWatch = new MutationObserver(paint);
        bodyWatch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (_) {}
    try {
      const access = byId('fireSGetStarted');
      if (access) {
        const accessWatch = new MutationObserver(paint);
        accessWatch.observe(access, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      }
    } catch (_) {}
  }

  function boot() {
    applyDesktopMode();
    bind();
    paint();
    watch();
    [250, 800, 1800].forEach(ms => {
      setTimeout(paint, ms);
    });
  }

  window.fireSDesktopAddress = desktopAddress;
  window.fireSRefreshDesktopAccess = paint;
  window.fireSMaybeOpenDesktopWorkspace = maybeOpenDesktopWorkspace;
  window.fireSWantsDesktop = wantsDesktop;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
