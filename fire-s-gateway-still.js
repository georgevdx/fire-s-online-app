/* Fire-S: keep the Inspection Gateway still while sync and KPI layers re-call render. */
(function fireSGatewayStill() {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function isShown(el) {
    if (!el || el.hidden) return false;
    if (el.style && el.style.display === 'none') return false;
    try {
      const style = window.getComputedStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    } catch (_) {}
    return true;
  }

  function gatewayOpen() {
    return isShown(byId('projectListSection')) && !isShown(byId('projectFormSection'));
  }

  function listAlreadyPainted() {
    const list = byId('projectsList');
    if (!list) return false;
    return !!(
      list.dataset.fireSGatewayPaint ||
      list.querySelector('[data-project-id], .fire-s-136a8-card, .project-card, .empty-state')
    );
  }

  function userIsTypingSearch() {
    const active = document.activeElement;
    return !!(active && (active.id === 'projectSearch' || active.id === 'premisesQuickSelect'));
  }

  function readFilterSig() {
    const search = byId('projectSearch');
    const premises = byId('premisesQuickSelect');
    return [
      search ? String(search.value || '') : '',
      premises ? String(premises.value || '') : '',
      window.fireSPremisesDropdownFilter || '',
      window.currentFilter || '',
      window.__fireS136A8ActiveFilter || '',
      window.currentProjectPage || 1
    ].join('\u0001');
  }

  function wrapRender() {
    const previous = window.renderProjectsList;
    if (typeof previous !== 'function' || previous.__fireSGatewayStill) return;
    const wrapped = function fireSGatewayStillRender(options) {
      const force = !!(options && (options.force === true || options.forcePaint === true));
      const typing = userIsTypingSearch();
      const sig = readFilterSig();
      const filterChanged = fireSGatewayStill._filterSig != null && sig !== fireSGatewayStill._filterSig;
      if (!force && !typing && !filterChanged && gatewayOpen() && listAlreadyPainted()) {
        fireSGatewayStill._filterSig = sig;
        return;
      }
      fireSGatewayStill._filterSig = sig;
      return previous.apply(this, arguments);
    };
    wrapped.__fireSGatewayStill = true;
    window.renderProjectsList = wrapped;
    try {
      renderProjectsList = wrapped;
    } catch (_) {}
  }

  function wrapKpiRefresh() {
    const previous = window.fireSRefreshKpiAndMission136A8;
    if (typeof previous !== 'function' || previous.__fireSGatewayStill) return;
    const wrapped = function fireSGatewayStillKpiRefresh() {
      if (gatewayOpen() && listAlreadyPainted()) {
        return;
      }
      return previous.apply(this, arguments);
    };
    wrapped.__fireSGatewayStill = true;
    window.fireSRefreshKpiAndMission136A8 = wrapped;
  }

  function install() {
    wrapRender();
    wrapKpiRefresh();
  }

  install();
  [0, 250, 800, 1600, 3200, 5000].forEach(function (ms) {
    setTimeout(install, ms);
  });
  setInterval(install, 2500);
  window.fireSKeepGatewayStill = install;
})();
