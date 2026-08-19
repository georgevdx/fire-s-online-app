/* ============================================================
   Fire-S desktop / PC access address
   Owner and Manager see a site address they can type on a computer.
   ?desktop=1 opens the wide desktop layout.
   ============================================================ */
(function fireSDesktopAccess() {
  'use strict';

  const LIVE_URL = 'https://georgevdx.github.io/fire-s-online-app/';

  function byId(id) {
    return document.getElementById(id);
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

  function applyDesktopMode() {
    if (!wantsDesktop()) return;
    document.documentElement.classList.add('fire-s-desktop-view');
    if (document.body) document.body.classList.add('fire-s-desktop-view');
  }

  function paint() {
    const box = byId('fireSDesktopAccess');
    const urlEl = byId('fireSDesktopAccessUrl');
    const note = byId('fireSDesktopAccessNote');
    if (!box) return;
    const url = desktopAddress();
    if (urlEl) urlEl.textContent = url;
    box.hidden = !isManagement();
    if (note) {
      note.textContent = wantsDesktop()
        ? 'Desktop view is on. Bookmark this address on the computer.'
        : '';
    }
  }

  function copyAddress() {
    const url = desktopAddress();
    const note = byId('fireSDesktopAccessNote');
    const done = function (ok) {
      if (!note) return;
      note.textContent = ok
        ? 'Address copied. Open it in Chrome on a computer.'
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

  function boot() {
    applyDesktopMode();
    bind();
    paint();
    try {
      const observer = new MutationObserver(paint);
      if (document.body) {
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (_) {}
  }

  window.fireSDesktopAddress = desktopAddress;
  window.fireSRefreshDesktopAccess = paint;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
