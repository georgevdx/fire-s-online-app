/* =====================================================
   FIRE-S RC 1.1.20D - MODULE 04: RENDER QUEUE
   Purpose:
   - Coalesce repeated renders into one safe frame.
   - Prevent Home / Executive Snapshot renders while Premises or Inspection
     screens are active.
   - Reduce visual bounce caused by overlapping legacy render calls.
   - Provide FireSModules.renderQueue API for future modules.
   ===================================================== */
(function fireSRenderQueueModule() {
  'use strict';

  if (window.__fireSRenderQueueModule120D) return;
  window.__fireSRenderQueueModule120D = true;

  const VERSION = 'RC 1.1.20D - Module 04 Render Queue';

  const queues = new Map();
  const stats = {
    enqueued: 0,
    executed: 0,
    skippedHomeRenders: 0,
    lastRenderAt: null,
    lastRenderKey: null
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function inferActiveScreen() {
    if (window.FireSModules && window.FireSModules.navigation) {
      try { return window.FireSModules.navigation.activeScreen || window.FireSModules.navigation.inferActiveScreenFromDom(); }
      catch (_) {}
    }

    if (isVisible(document.getElementById('projectFormSection'))) return 'inspection';
    if (isVisible(document.getElementById('projectListSection'))) return 'premises';
    if (isVisible(document.getElementById('reportSection'))) return 'report';
    if (isVisible(document.getElementById('servicesSection'))) return 'services';
    return 'home';
  }

  function shouldBlockHomeRender() {
    const screen = inferActiveScreen();
    return screen && screen !== 'home';
  }

  function hideHomeGhostLayer() {
    const home = document.getElementById('homeSection');
    const command = document.getElementById('mainCommandCentre');

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

  function dispatch(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail: Object.assign({ version: VERSION }, detail || {}) }));
    } catch (_) {}
  }

  function enqueue(key, fn, args, context, options = {}) {
    if (typeof fn !== 'function') return undefined;

    stats.enqueued += 1;

    const existing = queues.get(key) || {};
    existing.fn = fn;
    existing.args = args || [];
    existing.context = context || window;
    existing.options = options;

    if (existing.frame) {
      queues.set(key, existing);
      return undefined;
    }

    existing.frame = window.requestAnimationFrame(() => {
      const job = queues.get(key);
      queues.delete(key);

      if (!job || typeof job.fn !== 'function') return;

      if (job.options.blockWhenHomeHidden && shouldBlockHomeRender()) {
        stats.skippedHomeRenders += 1;
        hideHomeGhostLayer();
        dispatch('fire-s:render:skipped', { key, reason: 'home-render-blocked', screen: inferActiveScreen() });
        return;
      }

      try {
        const result = job.fn.apply(job.context, job.args);
        stats.executed += 1;
        stats.lastRenderAt = nowIso();
        stats.lastRenderKey = key;
        dispatch('fire-s:render:executed', { key, screen: inferActiveScreen() });
        return result;
      } catch (err) {
        console.error('[Fire-S Render Queue] render failed:', key, err);
        dispatch('fire-s:render:error', { key, message: err && err.message ? err.message : String(err) });
      }
    });

    queues.set(key, existing);
    dispatch('fire-s:render:queued', { key, screen: inferActiveScreen() });
    return undefined;
  }

  function flush(key) {
    if (key) {
      const job = queues.get(key);
      if (!job) return;
      window.cancelAnimationFrame(job.frame);
      queues.delete(key);
      try { return job.fn.apply(job.context, job.args); }
      catch (err) { console.error('[Fire-S Render Queue] flush failed:', key, err); }
      return;
    }

    Array.from(queues.keys()).forEach(flush);
  }

  function wrapGlobalFunction(name, options = {}) {
    const original = window[name];
    if (typeof original !== 'function' || original.__fireSRenderQueued) return;

    const wrapped = function fireSRenderQueuedWrapper() {
      return enqueue(name, original, Array.from(arguments), this, options);
    };

    wrapped.__fireSRenderQueued = true;
    wrapped.__fireSOriginal = original;
    window[name] = wrapped;

    try { window.eval(`${name} = window.${name};`); } catch (_) {}
  }

  function installFunctionGuards() {
    // High-risk ghost source: Executive/Home snapshot render while another screen is active.
    wrapGlobalFunction('renderHomeCommandCentre', { blockWhenHomeHidden: true });

    // High-frequency renders. These are coalesced to one animation frame.
    wrapGlobalFunction('renderProjectsList');
    wrapGlobalFunction('renderDashboard');
    wrapGlobalFunction('renderDashboardMetrics');
    wrapGlobalFunction('renderFindingsCentre');
  }

  function installStyleGuard() {
    if (document.getElementById('fire-s-render-queue-style')) return;
    const style = document.createElement('style');
    style.id = 'fire-s-render-queue-style';
    style.textContent = `
      body.fire-s-screen-premises #homeSection,
      body.fire-s-screen-inspection #homeSection,
      body.fire-s-screen-premises #mainCommandCentre,
      body.fire-s-screen-inspection #mainCommandCentre {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function getStats() {
    return Object.assign({ pending: Array.from(queues.keys()) }, stats);
  }

  window.FireSModules = window.FireSModules || {};
  window.FireSModules.renderQueue = {
    version: VERSION,
    enqueue,
    flush,
    getStats,
    inferActiveScreen
  };

  installStyleGuard();
  installFunctionGuards();

  window.addEventListener('beforeunload', () => flush());

  window.addEventListener('load', () => {
    const appVersion = document.getElementById('appVersion');
    if (appVersion) appVersion.textContent = `Version ${VERSION}`;
  });
})();
