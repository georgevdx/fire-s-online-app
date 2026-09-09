'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('SUPABASE_dashboard_stats.sql');
const statsJs = read('staging/fire-s-dashboard-stats.js');
const app = read('staging/app.js');
const html = read('staging/index.html');
const css = read('staging/styles.css');
const clearJs = read('staging/fire-s-gateway-filter-clear.js');

assert.ok(
  !/Workspace Filters/.test(app) && !/Workspace Filters/.test(html),
  'Workspace Filters must be removed from the toets Gateway'
);
assert.ok(
  /Equipment Expiry Filters/.test(app) && /expiry-overdue/.test(app),
  'Equipment expiry filters must remain on the Gateway'
);
assert.ok(
  /function fireSMatchesEquipmentExpiryFilter/.test(app) &&
    /window\.fireSMatchesEquipmentExpiryFilter/.test(app),
  'Expiry matching must be one shared function, not lastSaved'
);
assert.ok(
  /function formatDateInputValue\(date\) \{[\s\S]{0,180}getFullYear\(\)/.test(app) &&
    !/function formatDateInputValue\(date\) \{\s*return date\.toISOString/.test(app),
  'Today / This Week must use the local calendar date, not UTC'
);
assert.ok(
  /p_date_from date default null/.test(sql) &&
    /p_date_to date default null/.test(sql) &&
    /fire_s_inspection_activity_date\(s\.d\) >= p_date_from/.test(sql),
  'Server list must apply inspection date from/to together with the KPI filter'
);
assert.ok(
  /fire_s_inspection_has_expiry_status/.test(sql) &&
    /expiry-overdue/.test(sql) &&
    /expiry-missing/.test(sql),
  'Server list must apply equipment expiry filters'
);
assert.ok(
  /args\.p_date_from = dateFrom/.test(statsJs) && /args\.p_date_to = dateTo/.test(statsJs),
  'Toets stats service must send the date range to the list RPC'
);
assert.ok(
  /Inspection date and equipment expiry stay as sub-filters/.test(statsJs) &&
    /Inspection date and equipment expiry stay as sub-filters/.test(app),
  'Choosing Overdue must not wipe the inspection date range'
);
assert.ok(
  /body\.fire-s-exclusive-gateway-filter #inspectionDateFilterPanel/.test(css) &&
    /body\.fire-s-exclusive-gateway-filter #dashboardMetrics/.test(css) &&
    /display: block !important/.test(css),
  'Date panel and expiry chips must stay on screen while a KPI filter is in use'
);
assert.ok(
  /Keep inspection-date sub-filters when switching KPI/.test(clearJs),
  'KPI All must keep the date range; only the full Clear control wipes dates'
);
assert.ok(
  html.indexOf('app.js?v=1-3-64-sub') > 0 &&
    html.indexOf('fire-s-dashboard-stats.js?v=1-0-sub') > 0,
  'Toets cache tags for date and expiry sub-filters'
);

const expiryStart = app.indexOf('function fireSMatchesEquipmentExpiryFilter');
const expiryEnd = app.indexOf('\ntry { window.fireSMatchesEquipmentExpiryFilter', expiryStart);
const expiryFn = app.slice(expiryStart, expiryEnd);
const sandbox = {
  window: {},
  getProjectExpiryCounts(project) {
    return project.exp || { overdue: 0, soon: 0, scheduled: 0, missing: 0 };
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(expiryFn + '\nfireSMatchesEquipmentExpiryFilter;', sandbox);

assert.strictEqual(sandbox.fireSMatchesEquipmentExpiryFilter({ exp: { overdue: 2 } }, 'expiry-overdue'), true);
assert.strictEqual(sandbox.fireSMatchesEquipmentExpiryFilter({ exp: { overdue: 0, soon: 1 } }, 'expiry-overdue'), false);
assert.strictEqual(sandbox.fireSMatchesEquipmentExpiryFilter({ exp: { missing: 1 } }, 'expiry-missing'), true);
assert.strictEqual(sandbox.fireSMatchesEquipmentExpiryFilter({ exp: { overdue: 1 } }, 'overdue'), null);

const statsSandbox = {
  window: {},
  console,
  setTimeout() {},
  clearTimeout() {},
  document: {
    readyState: 'complete',
    addEventListener() {},
    getElementById(id) {
      if (id === 'inspectionDateFrom') return { value: '2026-09-01' };
      if (id === 'inspectionDateTo') return { value: '2026-09-09' };
      return null;
    },
    querySelectorAll() { return []; },
    body: { classList: { toggle() {}, add() {}, remove() {} } }
  },
  localStorage: {
    _data: {},
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  navigator: { onLine: true }
};
statsSandbox.window = statsSandbox;
statsSandbox.global = statsSandbox;
vm.createContext(statsSandbox);
vm.runInContext(statsJs, statsSandbox);

const api = statsSandbox.FireSDashboardStats;
const chrome = api.exclusiveFilterChrome({
  totalPremises: 86,
  premisesWithOpenActions: 21,
  compliantPremises: 83,
  scheduledInspections: 12,
  overdueInspections: 16,
  inspectionsThisMonth: 8
}, 'overdue', '', 4);
assert.ok(/Current filter/.test(chrome) && /Overdue/.test(chrome));
assert.ok(/Inspection dates 2026-09-01 to 2026-09-09/.test(chrome), 'Date range must show as a sub-filter on Overdue');
assert.ok(/data-filter="overdue"/.test(chrome));
assert.ok(!/data-filter="month"/.test(chrome), 'Other KPI chips stay hidden while Overdue is in use');

const dateOnly = api.exclusiveFilterChrome({
  totalPremises: 86,
  overdueInspections: 16
}, 'all', '', 11);
assert.ok(/Inspection dates/.test(dateOnly), 'Date filter must work on its own with no KPI selected');
assert.ok(/data-filter="overdue"/.test(dateOnly) && /data-filter="month"/.test(dateOnly), 'Date-only view keeps the KPI chips');

const from = { value: '2026-09-01' };
const to = { value: '2026-09-09' };
statsSandbox.document.getElementById = function (id) {
  if (id === 'inspectionDateFrom') return from;
  if (id === 'inspectionDateTo') return to;
  return null;
};
statsSandbox.competing = null;
// competingGatewayFiltersOff is not exported; re-apply overdue and confirm dates stay.
api.exclusiveFilterChrome({ overdueInspections: 16 }, 'overdue', '', 4);
assert.equal(from.value, '2026-09-01');
assert.equal(to.value, '2026-09-09');

console.log('gateway-subfilters.test.js: ok');
