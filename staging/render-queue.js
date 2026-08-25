/* =====================================================
   FIRE-S RC 1.1.20C - MODULE 03: STATE MANAGER
   Purpose:
   - Start centralising volatile UI state without replacing legacy app.js.
   - Persist screen/filter/page context safely between renders.
   - Provide a single FireSModules.state API for upcoming Render Queue.
   - Emit state-change events so modules no longer need to guess DOM state.
   ===================================================== */
(function fireSStateManagerModule() {
  'use strict';

  if (window.__fireSStateManagerModule120C) return;
  window.__fireSStateManagerModule120C = true;

  const VERSION = 'RC 1.1.20C - Module 03 State Manager';
  const STORAGE_KEY = 'fire-s-ui-state-v1';

  const DEFAULT_STATE = {
    activeScreen: 'home',
    previousScreen: null,
    projectFilter: 'all',
    projectPage: 1,
    currentProjectId: null,
    lastProjectListScroll: 0,
    lastInspectionScroll: 0,
    lastUpdatedAt: null
  };

  let subscribers = [];
  let state = loadState();

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return Object.assign({}, value); }
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_STATE, parsed || {});
    } catch (_) {
      return Object.assign({}, DEFAULT_STATE);
    }
  }

  function saveState() {
    const payload = JSON.stringify(state);
    try { sessionStorage.setItem(STORAGE_KEY, payload); } catch (_) {}
    try { localStorage.setItem(STORAGE_KEY, payload); } catch (_) {}
  }

  function notify(changes, previous) {
    const detail = {
      version: VERSION,
      state: clone(state),
      changes: clone(changes),
      previous: clone(previous)
    };

    document.dispatchEvent(new CustomEvent('fire-s:state:changed', { detail }));

    subscribers.slice().forEach(fn => {
      try { fn(detail.state, detail.changes, detail.previous); }
      catch (err) { console.warn('[Fire-S State] subscriber failed', err); }
    });
  }

  function set(partial, options = {}) {
    if (!partial || typeof partial !== 'object') return get();

    const previous = clone(state);
    const changes = {};

    Object.keys(partial).forEach(key => {
      if (!(key in DEFAULT_STATE)) return;
      const value = partial[key];
      if (state[key] === value) return;
      state[key] = value;
      changes[key] = value;
    });

    if (!Object.keys(changes).length) return get();

    state.lastUpdatedAt = new Date().toISOString();
    changes.lastUpdatedAt = state.lastUpdatedAt;

    if (!options.silent) {
      saveState();
      notify(changes, previous);
    } else {
      saveState();
    }

    return get();
  }

  function get(key) {
    if (key) return state[key];
    return clone(state);
  }

  function reset(keys) {
    if (Array.isArray(keys) && keys.length) {
      const patch = {};
      keys.forEach(key => { if (key in DEFAULT_STATE) patch[key] = DEFAULT_STATE[key]; });
      return set(patch);
    }

    const previous = clone(state);
    state = Object.assign({}, DEFAULT_STATE, { lastUpdatedAt: new Date().toISOString() });
    saveState();
    notify(clone(state), previous);
    return get();
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function noop() {};
    subscribers.push(fn);
    return function unsubscribe() {
      subscribers = subscribers.filter(item => item !== fn);
    };
  }

  function currentScrollY() {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  function saveScrollForActiveScreen() {
    const screen = state.activeScreen || inferScreen();
    if (screen === 'premises') set({ lastProjectListScroll: currentScrollY() }, { silent: true });
    if (screen === 'inspection') set({ lastInspectionScroll: currentScrollY() }, { silent: true });
  }

  function restoreScrollForScreen(screen) {
    const y = screen === 'inspection' ? state.lastInspectionScroll : state.lastProjectListScroll;
    if (!Number.isFinite(y) || y < 1) return;
    window.requestAnimationFrame(() => {
      try { window.scrollTo({ top: y, left: 0, behavior: 'auto' }); }
      catch (_) { window.scrollTo(0, y); }
    });
  }

  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function inferScreen() {
    if (window.FireSModules && window.FireSModules.navigation) {
      return window.FireSModules.navigation.activeScreen || window.FireSModules.navigation.inferActiveScreenFromDom();
    }

    if (isVisible(document.getElementById('projectFormSection'))) return 'inspection';
    if (isVisible(document.getElementById('projectListSection'))) return 'premises';
    if (isVisible(document.getElementById('reportSection'))) return 'report';
    if (isVisible(document.getElementById('servicesSection'))) return 'services';
    return 'home';
  }

  function wrapGlobalFunction(name, wrapperFactory) {
    const original = window[name];
    if (typeof original !== 'function' || original.__fireSStateManaged) return;

    const wrapped = wrapperFactory(original);
    wrapped.__fireSStateManaged = true;
    window[name] = wrapped;

    try { window.eval(`${name} = window.${name};`); } catch (_) {}
  }

  function installFunctionStateGuards() {
    wrapGlobalFunction('setFilter', original => function setFilterStateManaged(filter) {
      set({ projectFilter: filter || 'all', projectPage: 1 }, { silent: true });
      return original.apply(this, arguments);
    });

    wrapGlobalFunction('showHome', original => function showHomeStateManaged() {
      saveScrollForActiveScreen();
      set({ previousScreen: state.activeScreen, activeScreen: 'home' });
      return original.apply(this, arguments);
    });

    wrapGlobalFunction('showProjectList', original => function showProjectListStateManaged() {
      saveScrollForActiveScreen();
      set({ previousScreen: state.activeScreen, activeScreen: 'premises' });
      const result = original.apply(this, arguments);
      restoreScrollForScreen('premises');
      return result;
    });

    wrapGlobalFunction('showProjectForm', original => function showProjectFormStateManaged() {
      saveScrollForActiveScreen();
      set({ previousScreen: state.activeScreen, activeScreen: 'inspection' });
      return original.apply(this, arguments);
    });

    wrapGlobalFunction('openProject', original => function openProjectStateManaged(projectId) {
      set({ currentProjectId: projectId || null, previousScreen: state.activeScreen, activeScreen: 'inspection' });
      return original.apply(this, arguments);
    });

    wrapGlobalFunction('renderProjectsList', original => function renderProjectsListStateManaged() {
      const before = currentScrollY();
      const result = original.apply(this, arguments);

      if ((state.activeScreen || inferScreen()) === 'premises') {
        set({ lastProjectListScroll: before }, { silent: true });
        restoreScrollForScreen('premises');
      }

      return result;
    });
  }

  function installNavigationSync() {
    document.addEventListener('fire-s:navigation:changed', event => {
      const detail = event.detail || {};
      set({
        previousScreen: detail.previousScreen || state.activeScreen,
        activeScreen: detail.screen || inferScreen()
      }, { silent: false });
    });
  }

  function installVisibilitySync() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveScrollForActiveScreen();
    });
    window.addEventListener('beforeunload', saveScrollForActiveScreen);
  }

  function setVersionLabel() {
    const versionEl = document.getElementById('appVersion');
    if (versionEl) versionEl.textContent = VERSION;
  }

  function boot() {
    set({ activeScreen: inferScreen() }, { silent: true });
    installNavigationSync();
    installFunctionStateGuards();
    installVisibilitySync();
    setVersionLabel();

    window.FireSModules = window.FireSModules || {};
    window.FireSModules.state = {
      version: VERSION,
      get,
      set,
      reset,
      subscribe,
      inferScreen,
      saveScrollForActiveScreen,
      restoreScrollForScreen
    };

    document.dispatchEvent(new CustomEvent('fire-s:state:ready', {
      detail: { version: VERSION, state: get() }
    }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
