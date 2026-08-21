/* ============================================================
   Fire-S phone Back button
   The phone Back key must move inside the app (Home / previous
   screen). It must not close Fire-S so the user has to start again.
   ============================================================ */
(function fireSPhoneBack() {
  'use strict';

  if (window.__fireSPhoneBack) return;
  window.__fireSPhoneBack = true;

  let armed = false;
  let handling = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function isShown(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.style && el.style.display === 'none') return false;
    try {
      const style = window.getComputedStyle(el);
      if (!style) return true;
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    } catch (_) {}
    return true;
  }

  function holdHistory() {
    try {
      history.pushState({ fireS: true, t: Date.now() }, '', location.href);
    } catch (_) {}
  }

  function closeOverlayIfOpen() {
    if (document.fullscreenElement) {
      try {
        document.exitFullscreen();
      } catch (_) {}
      return true;
    }

    const camera = byId('cameraCaptureModal');
    if (camera && !camera.classList.contains('hidden')) {
      try {
        if (typeof closeDeviceCamera === 'function') closeDeviceCamera();
      } catch (_) {}
      return true;
    }

    const cloud = byId('cloudDropdown');
    if (cloud && isShown(cloud)) {
      cloud.style.display = 'none';
      return true;
    }

    return false;
  }

  function hideReportIfOpen() {
    const report = byId('reportSection');
    if (!isShown(report)) return false;
    report.style.display = 'none';
    return true;
  }

  function leaveInspectionQuietly() {
    try {
      if (typeof showProjectList === 'function') {
        showProjectList();
        return;
      }
    } catch (_) {}
    goHome();
  }

  function goHome() {
    try {
      if (typeof window.showHome === 'function') {
        window.showHome();
        return;
      }
    } catch (_) {}
    const home = byId('homeSection');
    if (home) home.style.display = 'block';
  }

  function handleBack() {
    if (closeOverlayIfOpen()) return;

    try {
      if (typeof window.fireSGetStartedPhoneBack === 'function' && window.fireSGetStartedPhoneBack()) {
        return;
      }
    } catch (_) {}

    if (hideReportIfOpen() && isShown(byId('projectFormSection'))) return;

    if (isShown(byId('projectFormSection'))) {
      leaveInspectionQuietly();
      return;
    }

    if (
      isShown(byId('projectListSection')) ||
      isShown(byId('servicesSection')) ||
      isShown(byId('findingsCentreSection')) ||
      isShown(byId('testSamplesSection')) ||
      isShown(byId('userManualSection')) ||
      isShown(byId('managementDashboardSection')) ||
      isShown(byId('companyLetterheadSection')) ||
      isShown(byId('companyTeamSection')) ||
      isShown(byId('inspectorBoardSection')) ||
      isShown(byId('reportSection'))
    ) {
      goHome();
      return;
    }

    if (!isShown(byId('homeSection')) || !isShown(byId('mainCommandCentre'))) {
      goHome();
    }
  }

  function onPopState() {
    if (handling) return;
    handling = true;
    try {
      handleBack();
    } catch (_) {}
    holdHistory();
    handling = false;
  }

  function arm() {
    if (armed) {
      holdHistory();
      return;
    }
    armed = true;
    try {
      history.replaceState({ fireS: true, t: Date.now() }, '', location.href);
    } catch (_) {}
    holdHistory();
    window.addEventListener('popstate', onPopState);
  }

  function boot() {
    arm();
    ['pointerdown', 'touchstart', 'keydown'].forEach(type => {
      document.addEventListener(type, arm, { once: true, capture: true });
    });
    window.addEventListener('pageshow', arm);
  }

  window.fireSPhoneBackGo = handleBack;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
