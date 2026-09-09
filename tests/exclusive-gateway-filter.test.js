'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const statsJs = read('staging/fire-s-dashboard-stats.js');
const liveStatsJs = read('fire-s-dashboard-stats.js');
const app = read('staging/app.js');
const liveApp = read('app.js');
const html = read('staging/index.html');
const liveHtml = read('index.html');
const css = read('staging/styles.css');
const liveCss = read('styles.css');

function assertExclusive(stats, source, page, styles, label, appTag, statsTag, keepDateSubfilters) {
  assert.ok(
    /filter: filter/.test(stats) && !/filter: search \? 'all' : filter/.test(stats),
    label + ': search must not drop the KPI filter currently in use'
  );
  assert.ok(
    /function exclusiveFilterChrome/.test(stats) &&
      /Current filter/.test(stats) &&
      /Clear filter/.test(stats),
    label + ': Gateway must show one current filter and a Clear control'
  );
  assert.ok(
    /competingGatewayFiltersOff/.test(stats) && /competingGatewayFiltersOff/.test(source),
    label + ': KPI apply still goes through one exclusive chrome path'
  );
  assert.ok(
    /fire-s-exclusive-gateway-filter/.test(styles) &&
      /display: flex !important/.test(styles),
    label + ': the current-filter banner must stay visible'
  );
  if (keepDateSubfilters) {
    assert.ok(
      /body\.fire-s-exclusive-gateway-filter #inspectionDateFilterPanel/.test(styles) &&
        /body\.fire-s-exclusive-gateway-filter #dashboardMetrics/.test(styles) &&
        /display: block !important/.test(styles),
      label + ': inspection date and expiry sub-filters must stay visible'
    );
  } else {
    assert.ok(
      /#inspectionDateFilterPanel/.test(styles),
      label + ': exclusive CSS still names the date panel'
    );
  }
  assert.ok(/is-exclusive/.test(source) && /is-exclusive/.test(stats), label + ': exclusive chip row');
  assert.ok(
    page.indexOf('fire-s-dashboard-stats.js?v=' + statsTag) > 0 &&
      page.indexOf('app.js?v=' + appTag) > 0,
    label + ': cache tags for exclusive filters'
  );
}

assertExclusive(statsJs, app, html, css, 'Toets', '1-3-64-sub', '1-0-sub', true);
assertExclusive(liveStatsJs, liveApp, liveHtml, liveCss, 'Live', '1-3-58-clear', '1-0-clear', false);

const sandbox = {
  window: {},
  console,
  setTimeout() {},
  clearTimeout() {},
  document: {
    readyState: 'complete',
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; },
    body: { classList: { toggle() {}, add() {}, remove() {} } }
  },
  localStorage: {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, value) { this._data[key] = String(value); },
    removeItem(key) { delete this._data[key]; }
  },
  navigator: { onLine: true }
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(statsJs, sandbox);

const api = sandbox.FireSDashboardStats;
assert.equal(typeof api.exclusiveFilterChrome, 'function');

const stats = {
  totalPremises: 111,
  premisesWithOpenActions: 21,
  compliantPremises: 80,
  scheduledInspections: 12,
  overdueInspections: 16,
  inspectionsThisMonth: 8
};

const allChrome = api.exclusiveFilterChrome(stats, 'all', '', 111);
assert.ok(/data-filter="overdue"/.test(allChrome) && /data-filter="month"/.test(allChrome));
assert.ok(/data-filter="compliant"/.test(allChrome));
assert.ok(!/Clear filter/.test(allChrome), 'All-premises view keeps every filter visible');

const overdue = api.exclusiveFilterChrome(stats, 'overdue', '', 16);
assert.ok(/Current filter/.test(overdue) && /Overdue/.test(overdue));
assert.ok(/Clear filter/.test(overdue));
assert.ok(/data-filter="overdue"/.test(overdue));
assert.ok(
  !/data-filter="month"/.test(overdue) &&
    !/data-filter="compliant"/.test(overdue) &&
    !/data-filter="scheduled-new"/.test(overdue) &&
    !/data-filter="all"/.test(overdue),
  'Overdue must take the other KPI filters away until Clear'
);
assert.ok(/is-exclusive/.test(overdue));

const overdueSearch = api.exclusiveFilterChrome(stats, 'overdue', 'oliewen', 2);
assert.ok(/Search within Overdue/.test(overdueSearch));
assert.ok(/oliewen/.test(overdueSearch));
assert.ok(
  !/data-filter="month"/.test(overdueSearch),
  'Search inside Overdue must not bring This Month back'
);

const searchOnly = api.exclusiveFilterChrome(stats, 'all', 'kirkney', 4);
assert.ok(/Current filter/.test(searchOnly) && /kirkney/.test(searchOnly));
assert.ok(/Clear filter/.test(searchOnly));
assert.ok(
  !/data-filter="overdue"/.test(searchOnly) && !/data-filter="month"/.test(searchOnly),
  'Search as the current filter must hide the KPI chips until it is cleared'
);

console.log('exclusive-gateway-filter.test.js: ok');
