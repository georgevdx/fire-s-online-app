/* ============================================================
   Fire-S Gateway filter clear + one overdue count
   Load AFTER app.js and fire-s-dashboard-stats.js.

   Root cause:
   - Clear only set the local currentFilter let. __fireSPendingKpiFilter
     and delayed 136A3 timers put Overdue back, so Clear looked broken.
   - Banner “Overdue Inspections (56 results)” used lastSaved/inspectionDate
     as a due date. Workspace / KPI / Snapshot used fireSIsInspectionOverdue
     (15–16). Those were different questions painted as the same filter.
   ============================================================ */
(function fireSGatewayFilterClear(root) {
  'use strict';

  const FILTER_KEYS = [
    '__fireS136A11ActiveFilter',
    '__fireS136A8ActiveFilter',
    '__fireSAuthoritativeFilter',
    '__fireSAuthoritativeKpiFilter',
    '__fireSActiveKpiFilter',
    '__fireSPendingKpiFilter'
  ];

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function bumpEpoch() {
    root.__fireSGatewayFilterEpoch = (root.__fireSGatewayFilterEpoch || 0) + 1;
    return root.__fireSGatewayFilterEpoch;
  }

  function setAllFilterKeys(key) {
    const next = text(key) || 'all';
    FILTER_KEYS.forEach(function (name) {
      try { root[name] = next; } catch (_) {}
    });
    try { root.currentFilter = next; } catch (_) {}
    try { if (typeof currentFilter !== 'undefined') currentFilter = next; } catch (_) {}
    try { root.currentProjectPage = 1; } catch (_) {}
    try { if (typeof currentProjectPage !== 'undefined') currentProjectPage = 1; } catch (_) {}
    return next;
  }

  function clearSearchAndDates() {
    try {
      const search = root.document.getElementById('projectSearch');
      if (search) search.value = '';
    } catch (_) {}
    try {
      const from = root.document.getElementById('inspectionDateFrom');
      const to = root.document.getElementById('inspectionDateTo');
      if (from) from.value = '';
      if (to) to.value = '';
      root.document.querySelectorAll('[data-date-filter]').forEach(function (button) {
        button.classList.remove('active-date-filter');
      });
      if (typeof root.updateInspectionDateFilterStatus === 'function') {
        root.updateInspectionDateFilterStatus();
      }
    } catch (_) {}
    try {
      if (typeof fireSPremisesDropdownFilter !== 'undefined') fireSPremisesDropdownFilter = '';
      const premisesSelect = root.document.getElementById('premisesQuickSelect');
      if (premisesSelect) premisesSelect.value = '';
    } catch (_) {}
  }

  function hideStuckBanners() {
    try {
      const status = root.document.getElementById('activeFilterStatus');
      if (status) {
        status.style.display = 'none';
        status.innerHTML = '';
      }
    } catch (_) {}
    try {
      const banner = root.document.getElementById('fireSCurrentKpiFilterBanner');
      if (banner) {
        banner.style.display = 'none';
        banner.innerHTML = '';
      }
    } catch (_) {}
  }

  function syncExclusiveClass(key) {
    const on = text(key) && text(key) !== 'all';
    try {
      if (root.document && root.document.body) {
        root.document.body.classList.toggle('fire-s-exclusive-gateway-filter', on);
      }
    } catch (_) {}
  }

  function paintAfterClear() {
    hideStuckBanners();
    syncExclusiveClass('all');
    try {
      if (typeof root.closeFilterPanel === 'function') root.closeFilterPanel();
    } catch (_) {}
    try {
      if (typeof root.fireSApplyMissionFilter136A11 === 'function') {
        root.fireSApplyMissionFilter136A11('all', true);
        return;
      }
    } catch (_) {}
    try {
      if (typeof root.renderProjectsList === 'function') root.renderProjectsList();
    } catch (_) {}
    try {
      if (typeof root.updateDashboardSelection === 'function') root.updateDashboardSelection();
    } catch (_) {}
    try {
      if (typeof root.renderDashboardMetrics === 'function') root.renderDashboardMetrics();
    } catch (_) {}
  }

  function fireSClearAllGatewayFilters(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    bumpEpoch();
    root.__fireSGatewayFiltersCleared = true;
    setAllFilterKeys('all');
    clearSearchAndDates();
    paintAfterClear();
    return false;
  }

  function isClearControl(node) {
    if (!node || !node.closest) return null;
    const btn = node.closest(
      '#activeFilterStatus button, #fireSClearKpiFilterBtn, .active-filter-status button, .fire-s-current-kpi-filter-banner button, .fire-s-136a8-banner button'
    );
    if (!btn) return null;
    const label = text(btn.textContent).toLowerCase();
    if (!label || /clear/.test(label)) return btn;
    return null;
  }

  function install() {
    root.fireSClearAllGatewayFilters = fireSClearAllGatewayFilters;
    root.clearProjectSearchAndFilter = fireSClearAllGatewayFilters;
    try { if (typeof clearProjectSearchAndFilter !== 'undefined') clearProjectSearchAndFilter = fireSClearAllGatewayFilters; } catch (_) {}

    if (!root.__fireSGatewayFilterClearClick) {
      root.__fireSGatewayFilterClearClick = true;
      root.document.addEventListener('click', function (event) {
        const btn = isClearControl(event.target);
        if (!btn) return;
        fireSClearAllGatewayFilters(event);
      }, true);
    }

    const previousSet = root.setFilter;
    if (typeof previousSet === 'function' && !previousSet.__fireSGatewayFilterClearSet) {
      const wrapped = function (filter) {
        const key = text(filter) || 'all';
        bumpEpoch();
        root.__fireSGatewayFiltersCleared = key === 'all';
        setAllFilterKeys(key);
        if (key === 'all') clearSearchAndDates();
        syncExclusiveClass(key);
        return previousSet.apply(this, arguments);
      };
      wrapped.__fireSGatewayFilterClearSet = true;
      root.setFilter = wrapped;
      try { if (typeof setFilter !== 'undefined') setFilter = wrapped; } catch (_) {}
    }
  }

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
  [400, 1200].forEach(function (ms) {
    try { root.setTimeout(install, ms); } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : this);
