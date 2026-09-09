'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const liveHtml = read('index.html');
const app = read('staging/app.js');
const liveApp = read('app.js');
const clearJs = read('staging/fire-s-gateway-filter-clear.js');
const liveClearJs = read('fire-s-gateway-filter-clear.js');

function assertClearWired(page, source, label, clearTag) {
  assert.ok(
    new RegExp('fire-s-gateway-filter-clear\\.js\\?v=' + clearTag).test(page),
    label + ' must load the Gateway Clear helper last'
  );
  assert.ok(
    page.lastIndexOf('fire-s-gateway-filter-clear.js') > page.lastIndexOf('fire-s-entitlement.js'),
    label + ': Clear helper must load after other Gateway scripts so it wins setFilter'
  );
  assert.ok(
    /__fireSGatewayFilterEpoch/.test(source) &&
      /__fireSGatewayFiltersCleared/.test(source) &&
      /__fireSGatewayFilterEpoch !== epoch/.test(source),
    label + ': delayed Overdue re-apply timers must stop after Clear'
  );
  assert.ok(
    /__fireSGatewayFiltersCleared/.test(source) &&
      /setProjectFilterState\('all'\)/.test(source),
    label + ': a later render must not restore Overdue after Clear'
  );
  assert.ok(
    /function isOverdueInspection\(project\)\{[\s\S]{0,180}fireSIsInspectionOverdue/.test(source) &&
      /function isOverdue\(project\)\{[\s\S]{0,180}fireSIsInspectionOverdue/.test(source),
    label + ': Workspace and banner Overdue must use fireSIsInspectionOverdue, not lastSaved'
  );
}

assertClearWired(html, app, 'Toets', '1-0-sub');
assertClearWired(liveHtml, liveApp, 'Live', '1-0-clear');
assert.ok(
  /function fireSClearAllGatewayFilters/.test(clearJs) &&
    /__fireSPendingKpiFilter/.test(clearJs) &&
    /#activeFilterStatus button/.test(clearJs) &&
    /function fireSClearAllGatewayFilters/.test(liveClearJs),
  'Clear must reset every filter key and catch the visible Clear button on live and toets'
);

const clicks = [];
const statusEl = {
  id: 'activeFilterStatus',
  style: { display: 'flex' },
  innerHTML: '<span>Filter: Overdue Inspections (56 results)</span><button type="button">Clear</button>',
  closest(sel) { return sel === '#activeFilterStatus button' || sel.includes('activeFilterStatus') ? this : null; }
};
const clearBtn = {
  textContent: 'Clear',
  closest(sel) {
    if (String(sel).includes('activeFilterStatus')) return this;
    return null;
  }
};
statusEl.querySelector = function () { return clearBtn; };

const searchField = { value: 'oliewen' };
const dateFrom = { value: '2026-01-01' };
const dateTo = { value: '2026-01-01' };
const sandbox = {
  window: {},
  document: {
    readyState: 'complete',
    getElementById(id) {
      if (id === 'activeFilterStatus') return statusEl;
      if (id === 'projectSearch') return searchField;
      if (id === 'inspectionDateFrom') return dateFrom;
      if (id === 'inspectionDateTo') return dateTo;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, fn) {
      if (type === 'click') clicks.push(fn);
    },
    body: { classList: { toggle() {}, add() {}, remove() {} } }
  },
  setTimeout() {},
  currentFilter: 'overdue',
  __fireSPendingKpiFilter: 'overdue',
  __fireSActiveKpiFilter: 'overdue',
  __fireS136A11ActiveFilter: 'all',
  fireSApplyMissionFilter136A11(filter) {
    sandbox.applied = filter;
  }
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(clearJs, sandbox);

assert.equal(typeof sandbox.fireSClearAllGatewayFilters, 'function');
assert.ok(clicks.length >= 1, 'Clear must bind a capture click listener');

const event = {
  target: clearBtn,
  preventDefault() {},
  stopPropagation() {},
  stopImmediatePropagation() {}
};
clicks[0](event);

assert.equal(sandbox.currentFilter, 'all');
assert.equal(sandbox.__fireSPendingKpiFilter, 'all');
assert.equal(sandbox.__fireSActiveKpiFilter, 'all');
assert.equal(sandbox.__fireSGatewayFiltersCleared, true);
assert.equal(sandbox.applied, 'all');
assert.equal(statusEl.style.display, 'none');
assert.equal(searchField.value, '');

console.log('gateway-filter-clear.test.js: ok');
