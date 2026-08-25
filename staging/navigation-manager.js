/* =====================================================
   FIRE-S RC 1.1.20A - MODULE 01: RENDER STABILIZER
   Purpose:
   - Start safe modularisation without breaking the legacy app.js flow.
   - Prevent Home / Executive Snapshot rendering behind Premises.
   - Stop ghost dashboard bleed-through and bounce during Premises navigation.
   - Keep this module removable by deleting this script include.
   ===================================================== */
(function fireSRenderStabilizerModule() {
  'use strict';

  if (window.__fireSRenderStabilizerModule120A) return;
  window.__fireSRenderStabilizerModule120A = true;

  const VERSION = 'RC 1.1.20A - Module 01 Render Stabilizer';

  function byId(id) {
    return document.getElementById(id);
  }

  function computedVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function isPremisesScreenActive() {
    const list = byId('projectListSection');
    const form = byId('projectFormSection');
    const report = byId('reportSection');

    return computedVisible(list) || computedVisible(form) || computedVisible(report);
  }

  function lockHomeLayer() {
    const home = byId('homeSection');
    const command = byId('mainCommandCentre');

    document.body.classList.add('fire-s-premises-render-lock');

    if (home) {
      home.style.display = 'none';
      home.style.visibility = 'hidden';
      home.style.opacity = '0';
      home.style.pointerEvents = 'none';
      home.setAttribute('aria-hidden', 'true');
    }

    if (command) {
      command.style.visibility = 'hidden';
      command.style.opacity = '0';
      command.style.pointerEvents = 'none';
      command.setAttribute('aria-hidden', 'true');
    }
  }

  function unlockHomeLayer() {
    const home = byId('homeSection');
    const command = byId('mainCommandCentre');

    document.body.classList.remove('fire-s-premises-render-lock');

    if (home) {
      home.style.visibility = '';
      home.style.opacity = '';
      home.style.pointerEvents = '';
      home.removeAttribute('aria-hidden');
    }

    if (command) {
      command.style.visibility = '';
      command.style.opacity = '';
      command.style.pointerEvents = '';
      command.removeAttribute('aria-hidden');
    }
  }

  function syncLayerState() {
    if (isPremisesScreenActive()) lockHomeLayer();
  }

  function installCssGuard() {
    if (byId('fire-s-render-stabilizer-css')) return;

    const style = document.createElement('style');
    style.id = 'fire-s-render-stabilizer-css';
    style.textContent = `
      body.fire-s-premises-render-lock #homeSection,
      body.fire-s-premises-render-lock #mainCommandCentre,
      body.fire-s-premises-render-lock .executive-dashboard,
      body.fire-s-premises-render-lock .executive-snapshot,
      body.fire-s-premises-render-lock .dashboard-command-centre {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      body.fire-s-premises-render-lock #projectListSection,
      body.fire-s-premises-render-lock #projectFormSection,
      body.fire-s-premises-render-lock #reportSection {
        opacity: 1 !important;
        visibility: visible !important;
      }
    `;
    document.head.appendChild(style);
  }

  function wrapGlobalFunction(name, wrapperFactory) {
    const original = window[name];
    if (typeof original !== 'function' || original.__fireSRenderStabilized) return;

    const wrapped = wrapperFactory(original);
    wrapped.__fireSRenderStabilized = true;
    window[name] = wrapped;

    // Top-level function declarations are also available as bare identifiers in
    // this legacy app. eval keeps compatibility where older code calls showHome()
    // directly instead of window.showHome().
    try { window.eval(`${name} = window.${name};`); } catch (_) {}
  }

  function installFunctionGuards() {
    wrapGlobalFunction('renderHomeCommandCentre', original => function renderHomeCommandCentreStabilized() {
      if (isPremisesScreenActive()) {
        lockHomeLayer();
        return;
      }
      return original.apply(this, arguments);
    });

    wrapGlobalFunction('showProjectList', original => function showProjectListStabilized() {
      lockHomeLayer();
      const result = original.apply(this, arguments);
      lockHomeLayer();
      window.requestAnimationFrame(lockHomeLayer);
      setTimeout(lockHomeLayer, 80);
      return result;
    });

    wrapGlobalFunction('showProjectForm', original => function showProjectFormStabilized() {
      lockHomeLayer();
      const result = original.apply(this, arguments);
      lockHomeLayer();
      return result;
    });

    wrapGlobalFunction('showHome', original => function showHomeStabilized() {
      unlockHomeLayer();
      const result = original.apply(this, arguments);
      unlockHomeLayer();
      return result;
    });
  }

  function installDomObserver() {
    const observer = new MutationObserver(() => {
      if (isPremisesScreenActive()) lockHomeLayer();
    });

    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['style', 'class']
    });

    window.__fireSRenderStabilizerObserver = observer;
  }

  function setVersionLabel() {
    const versionEl = byId('appVersion');
    if (versionEl) versionEl.textContent = VERSION;
  }

  function boot() {
    installCssGuard();
    installFunctionGuards();
    installDomObserver();
    syncLayerState();
    setVersionLabel();

    window.FireSModules = window.FireSModules || {};
    window.FireSModules.renderStabilizer = {
      version: VERSION,
      lockHomeLayer,
      unlockHomeLayer,
      syncLayerState
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
