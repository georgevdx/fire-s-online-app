/* =====================================================
   FIRE-S RC 1.1.20B - MODULE 02: NAVIGATION MANAGER
   Purpose:
   - Start centralising screen navigation without replacing legacy app.js.
   - Prevent Home / Executive Dashboard renders while Premises or Inspection
     screens are active.
   - Preserve scroll positions when moving between main screens.
   - Expose a small FireSModules.navigation API for future modules.
   ===================================================== */
(function fireSNavigationManagerModule() {
  'use strict';

  if (window.__fireSNavigationManagerModule120B) return;
  window.__fireSNavigationManagerModule120B = true;

  const VERSION = 'RC 1.1.20B - Module 02 Navigation Manager';

  const SCREEN_SECTIONS = {
    home: ['homeSection'],
    premises: ['projectListSection'],
    inspection: ['projectFormSection'],
    services: ['servicesSection'],
    report: ['reportSection']
  };

  const ALL_SECTION_IDS = Array.from(
    new Set(Object.values(SCREEN_SECTIONS).flat())
  );

  const state = {
    activeScreen: null,
    previousScreen: null,
    scrollPositions: {},
    lastNavigationAt: 0
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function getCurrentScroll() {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  function saveScroll(screen) {
    if (!screen) return;
    state.scrollPositions[screen] = getCurrentScroll();
  }

  function restoreScroll(screen) {
    const y = state.scrollPositions[screen];
    if (typeof y !== 'number') return;

    window.requestAnimationFrame(() => {
      try { window.scrollTo({ top: y, left: 0, behavior: 'auto' }); }
      catch (_) { window.scrollTo(0, y); }
    });
  }

  function inferActiveScreenFromDom() {
    if (isVisible(byId('projectFormSection'))) return 'inspection';
    if (isVisible(byId('projectListSection'))) return 'premises';
    if (isVisible(byId('reportSection'))) return 'report';
    if (isVisible(byId('servicesSection'))) return 'services';
    if (isVisible(byId('homeSection'))) return 'home';
    return state.activeScreen || 'home';
  }

  function applyBodyClass(screen) {
    document.body.classList.remove(
      'fire-s-screen-home',
      'fire-s-screen-premises',
      'fire-s-screen-inspection',
      'fire-s-screen-services',
      'fire-s-screen-report'
    );
    document.body.classList.add(`fire-s-screen-${screen}`);
  }

  function hideHomeCommandIfNotHome(screen) {
    const home = byId('homeSection');
    const command = byId('mainCommandCentre');

    if (screen === 'home') {
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
      return;
    }

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

  function setActiveScreen(screen, options = {}) {
    if (!SCREEN_SECTIONS[screen]) screen = 'home';

    const previous = state.activeScreen || inferActiveScreenFromDom();
    if (previous && previous !== screen) saveScroll(previous);

    state.previousScreen = previous;
    state.activeScreen = screen;
    state.lastNavigationAt = Date.now();

    applyBodyClass(screen);
    hideHomeCommandIfNotHome(screen);

    if (options.manageDisplay) {
      const visibleIds = new Set(SCREEN_SECTIONS[screen]);
      ALL_SECTION_IDS.forEach(id => {
        const el = byId(id);
        if (!el) return;
        el.style.display = visibleIds.has(id) ? 'block' : 'none';
      });
    }

    if (options.restoreScroll) restoreScroll(screen);

    document.dispatchEvent(new CustomEvent('fire-s:navigation:changed', {
      detail: {
        screen,
        previousScreen: previous,
        version: VERSION
      }
    }));

    return screen;
  }

  function shouldBlockHomeRender() {
    const screen = state.activeScreen || inferActiveScreenFromDom();
    return screen && screen !== 'home';
  }

  function wrapGlobalFunction(name, wrapperFactory) {
    const original = window[name];
    if (typeof original !== 'function' || original.__fireSNavigationManaged) return;

    const wrapped = wrapperFactory(original);
    wrapped.__fireSNavigationManaged = true;
    window[name] = wrapped;

    try { window.eval(`${name} = window.${name};`); } catch (_) {}
  }

  function installFunctionGuards() {
    wrapGlobalFunction('renderHomeCommandCentre', original => function renderHomeCommandCentreNavigationManaged() {
      if (shouldBlockHomeRender()) {
        hideHomeCommandIfNotHome(state.activeScreen || inferActiveScreenFromDom());
        return;
      }
      return original.apply(this, arguments);
    });

    wrapGlobalFunction('showHome', original => function showHomeNavigationManaged() {
      setActiveScreen('home');
      const result = original.apply(this, arguments);
      setActiveScreen('home', { restoreScroll: true });
      return result;
    });

    wrapGlobalFunction('showProjectList', original => function showProjectListNavigationManaged() {
      setActiveScreen('premises');
      const result = original.apply(this, arguments);
      setActiveScreen('premises', { restoreScroll: true });
      return result;
    });

    wrapGlobalFunction('showProjectForm', original => function showProjectFormNavigationManaged() {
      setActiveScreen('inspection');
      const result = original.apply(this, arguments);
      setActiveScreen('inspection');
      return result;
    });

    wrapGlobalFunction('showServices', original => function showServicesNavigationManaged() {
      setActiveScreen('services');
      const result = original.apply(this, arguments);
      setActiveScreen('services');
      return result;
    });

    wrapGlobalFunction('showReport', original => function showReportNavigationManaged() {
      setActiveScreen('report');
      const result = original.apply(this, arguments);
      setActiveScreen('report');
      return result;
    });
  }

  function installCssGuard() {
    if (byId('fire-s-navigation-manager-css')) return;

    const style = document.createElement('style');
    style.id = 'fire-s-navigation-manager-css';
    style.textContent = `
      body:not(.fire-s-screen-home) #homeSection,
      body:not(.fire-s-screen-home) #mainCommandCentre,
      body:not(.fire-s-screen-home) .executive-dashboard,
      body:not(.fire-s-screen-home) .executive-snapshot,
      body:not(.fire-s-screen-home) .dashboard-command-centre {
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      body.fire-s-screen-premises #projectListSection,
      body.fire-s-screen-inspection #projectFormSection,
      body.fire-s-screen-services #servicesSection,
      body.fire-s-screen-report #reportSection {
        visibility: visible !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function installDomSync() {
    let pending = false;

    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(() => {
        pending = false;
        const inferred = inferActiveScreenFromDom();
        if (inferred !== state.activeScreen) {
          state.activeScreen = inferred;
          applyBodyClass(inferred);
        }
        hideHomeCommandIfNotHome(state.activeScreen || inferred);
      });
    });

    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['style', 'class']
    });

    window.__fireSNavigationManagerObserver = observer;
  }

  function setVersionLabel() {
    const versionEl = byId('appVersion');
    if (versionEl) versionEl.textContent = VERSION;
  }

  function boot() {
    installCssGuard();
    installFunctionGuards();
    setActiveScreen(inferActiveScreenFromDom());
    installDomSync();
    setVersionLabel();

    window.FireSModules = window.FireSModules || {};
    window.FireSModules.navigation = {
      version: VERSION,
      get activeScreen() { return state.activeScreen; },
      get previousScreen() { return state.previousScreen; },
      setActiveScreen,
      inferActiveScreenFromDom,
      saveScroll,
      restoreScroll
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
