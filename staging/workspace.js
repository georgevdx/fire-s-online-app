/* Fire-S v2 Gateway Module - Professional Command Bar v1.0 */
(function () {
  window.FireS = window.FireS || {};

  function ready(callback) {
    if (window.FireS.ready) return window.FireS.ready(callback);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback);
    else callback();
  }

  function getActiveFilterCount() {
    let count = 0;

    if (typeof currentFilter !== 'undefined' && currentFilter && currentFilter !== 'all') count += 1;
    if (typeof currentInspectionDateFilter !== 'undefined' && currentInspectionDateFilter && currentInspectionDateFilter !== 'all') count += 1;

    const search = document.getElementById('projectSearch');
    if (search && search.value.trim()) count += 1;

    const premises = document.getElementById('premisesQuickSelect');
    if (premises && premises.value) count += 1;

    return count;
  }

  function updateFilterButtonLabel() {
    const btn = document.getElementById('fireSFilterDrawerToggle');
    if (!btn) return;

    const count = getActiveFilterCount();
    btn.textContent = count > 0 ? `⚙ Filters (${count})` : '⚙ Filters';
  }

  function closeDrawer() {
    const panel = document.getElementById('fireSFilterDrawer');
    const btn = document.getElementById('fireSFilterDrawerToggle');

    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleDrawer() {
    const panel = document.getElementById('fireSFilterDrawer');
    const btn = document.getElementById('fireSFilterDrawerToggle');

    if (!panel || !btn) return;

    const isHidden = panel.hidden;
    panel.hidden = !isHidden;
    btn.setAttribute('aria-expanded', String(isHidden));
  }

  function setGatewayFilter(filter) {
    if (typeof currentFilter !== 'undefined') currentFilter = filter;
    if (typeof currentProjectPage !== 'undefined') currentProjectPage = 1;

    if (typeof renderProjectsList === 'function') renderProjectsList();
    if (typeof updateDashboardSelection === 'function') updateDashboardSelection();

    updateFilterButtonLabel();
  }

  function setDateFilter(filter) {
    if (typeof currentInspectionDateFilter !== 'undefined') {
      currentInspectionDateFilter = filter;
    } else {
      window.currentInspectionDateFilter = filter;
    }

    if (typeof currentProjectPage !== 'undefined') currentProjectPage = 1;

    if (typeof renderProjectsList === 'function') renderProjectsList();
    if (typeof updateDashboardSelection === 'function') updateDashboardSelection();

    updateFilterButtonLabel();
  }

  function resetGatewayFilters() {
    if (typeof currentFilter !== 'undefined') currentFilter = 'all';
    if (typeof currentInspectionDateFilter !== 'undefined') currentInspectionDateFilter = 'all';
    else window.currentInspectionDateFilter = 'all';

    const search = document.getElementById('projectSearch');
    if (search) search.value = '';

    const premises = document.getElementById('premisesQuickSelect');
    if (premises) premises.value = '';

    if (typeof fireSPremisesDropdownFilter !== 'undefined') {
      fireSPremisesDropdownFilter = '';
    }

    if (typeof currentProjectPage !== 'undefined') currentProjectPage = 1;

    if (typeof renderProjectsList === 'function') renderProjectsList();
    if (typeof updateDashboardSelection === 'function') updateDashboardSelection();

    updateFilterButtonLabel();
    closeDrawer();
  }

  function ensureCommandBar() {
    const projectListSection = document.getElementById('projectListSection');
    const search = document.getElementById('projectSearch');

    if (!projectListSection || !search) return;
    if (document.getElementById('fireSGatewayCommandBar')) {
      updateFilterButtonLabel();
      return;
    }

    const commandBar = document.createElement('div');
    commandBar.id = 'fireSGatewayCommandBar';
    commandBar.className = 'fire-s-command-bar';

    commandBar.innerHTML = `
      <div class="fire-s-command-row fire-s-command-row-search"></div>

      <div class="fire-s-command-row fire-s-command-row-actions">
        <button type="button" id="fireSFilterDrawerToggle" class="fire-s-command-btn" aria-expanded="false">
          ⚙ Filters
        </button>

        <button type="button" class="fire-s-command-btn fire-s-command-new" onclick="showProjectForm && showProjectForm()">
          ➕ New
        </button>
      </div>

      <div id="fireSFilterDrawer" class="fire-s-filter-drawer" hidden>
        <div class="fire-s-filter-section">
          <strong>Status</strong>
          <button type="button" onclick="window.FireS.gatewayV2.setGatewayFilter('all')">All</button>
          <button type="button" onclick="window.FireS.gatewayV2.setGatewayFilter('compliant')">Compliant</button>
          <button type="button" onclick="window.FireS.gatewayV2.setGatewayFilter('inspection-attention')">Action Required</button>
          <button type="button" onclick="window.FireS.gatewayV2.setGatewayFilter('overdue')">Overdue</button>
        </div>

        <div class="fire-s-filter-section">
          <strong>Inspection Date</strong>
          <button type="button" onclick="window.FireS.gatewayV2.setDateFilter('all')">All Dates</button>
          <button type="button" onclick="window.FireS.gatewayV2.setDateFilter('today')">Today</button>
          <button type="button" onclick="window.FireS.gatewayV2.setDateFilter('week')">This Week</button>
          <button type="button" onclick="window.FireS.gatewayV2.setDateFilter('month')">This Month</button>
          <button type="button" onclick="window.FireS.gatewayV2.setDateFilter('year')">This Year</button>
        </div>

        <div class="fire-s-filter-footer">
          <button type="button" class="fire-s-filter-reset" onclick="window.FireS.gatewayV2.resetGatewayFilters()">Reset Filters</button>
          <button type="button" class="fire-s-filter-apply" onclick="window.FireS.gatewayV2.closeDrawer()">Apply</button>
        </div>
      </div>
    `;

    search.insertAdjacentElement('beforebegin', commandBar);

    const searchRow = commandBar.querySelector('.fire-s-command-row-search');
    searchRow.appendChild(search);

    const premisesWrapper = document.getElementById('premisesSearchWrapper');
    if (premisesWrapper) {
      commandBar.querySelector('.fire-s-command-row-actions').insertBefore(
        premisesWrapper,
        document.getElementById('fireSFilterDrawerToggle')
      );
    }

    document.getElementById('fireSFilterDrawerToggle').addEventListener('click', toggleDrawer);

    search.addEventListener('input', updateFilterButtonLabel);

    updateFilterButtonLabel();
  }

  function relocatePremisesDropdownWhenCreated() {
    const commandBar = document.getElementById('fireSGatewayCommandBar');
    const premisesWrapper = document.getElementById('premisesSearchWrapper');

    if (!commandBar || !premisesWrapper || premisesWrapper.closest('#fireSGatewayCommandBar')) return;

    const actions = commandBar.querySelector('.fire-s-command-row-actions');
    const filterBtn = document.getElementById('fireSFilterDrawerToggle');

    if (actions && filterBtn) actions.insertBefore(premisesWrapper, filterBtn);
  }

  function init(core) {
    window.FireS.gatewayV2 = {
      ensureCommandBar,
      setGatewayFilter,
      setDateFilter,
      resetGatewayFilters,
      closeDrawer,
      updateFilterButtonLabel
    };

    ready(function () {
      setTimeout(() => {
        ensureCommandBar();
        relocatePremisesDropdownWhenCreated();
      }, 500);

      setInterval(() => {
        ensureCommandBar();
        relocatePremisesDropdownWhenCreated();
        updateFilterButtonLabel();
      }, 1200);
    });
  }

  if (window.FireS.registerModule) {
    window.FireS.registerModule('gateway-command-bar', { init });
  } else {
    ready(init);
  }
})();
