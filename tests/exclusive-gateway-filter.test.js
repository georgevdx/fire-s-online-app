'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const statsJs = read('staging/fire-s-dashboard-stats.js');
const app = read('staging/app.js');
const html = read('staging/index.html');
const css = read('staging/styles.css');
const liveApp = read('app.js');

assert.ok(
  /filter: filter/.test(statsJs) && !/filter: search \? 'all' : filter/.test(statsJs),
  'Search must not drop the KPI filter currently in use'
);
assert.ok(
  /function exclusiveFilterChrome/.test(statsJs) &&
    /Current filter/.test(statsJs) &&
    /Clear filter/.test(statsJs),
  'Gateway must show one current filter and a Clear control'
);
assert.ok(
  /competingGatewayFiltersOff/.test(statsJs) && /competingGatewayFiltersOff/.test(app),
  'Choosing a KPI filter must take the date panel and extra filters away'
);
assert.ok(
  /fire-s-exclusive-gateway-filter/.test(css) &&
    /#inspectionDateFilterPanel/.test(css) &&
    /display: flex !important/.test(css),
  'The current-filter banner must be visible and other filter UI must hide'
);
assert.ok(/is-exclusive/.test(app) && /is-exclusive/.test(statsJs));
assert.ok(
  html.indexOf('fire-s-dashboard-stats.js?v=1-0-filter') > 0 &&
    html.indexOf('app.js?v=1-3-64-filter') > 0,
  'Toets cache tags for exclusive filters'
);
assert.ok(
  !/function exclusiveFilterChrome/.test(liveApp),
  'Exclusive Gateway filters stay on the toets-blad until sit live'
);

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
