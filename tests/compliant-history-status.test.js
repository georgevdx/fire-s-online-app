'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');
const html = read('staging/index.html');
const liveApp = read('app.js');

assert.ok(
  /A premises stays Compliant when the latest completed cycle is all-clear/.test(app),
  'Toets must keep Compliant from the latest completed cycle, including History'
);
assert.ok(
  /function latestCompletedCycle\(p\)\{/.test(app) &&
    /window\.fireSProductionIsCompliant = isCompliant/.test(app),
  'Home and Gateway Compliant counts must use the History-aware matcher'
);
assert.ok(
  /app\.js\?v=1-3-78-toets-comment/.test(html) &&
    /Version 1\.3\.78-toets/.test(html),
  'Toets must cache-bust Compliant + report overlay without bumping the displayed version'
);
assert.ok(
  /hasAnsweredChecklist\(p\) && isCompleted\(p\) && !hasOpenActions\(p\)/.test(liveApp) === false &&
    /function latestCompletedCycle\(p\)\{/.test(liveApp) &&
    /window\.fireSProductionIsCompliant = isCompliant/.test(liveApp),
  'Live Compliant matcher must keep completed all-clear premises Compliant after refresh'
);

const start = app.indexOf('(function fireS136A10StableVisibleKpis(){');
const end = app.indexOf('(function fireS136A11ProjectKpiSingleMatcher(){', start);
assert.ok(start > 0 && end > start, '136A10 KPI matcher must exist');

const windowObj = {
  __fireS136A10Installed: false,
  setTimeout() { return 0; },
  setInterval() { return 0; },
  addEventListener() {},
  MutationObserver: class { observe() {} requestAnimationFrame() {} }
};
const documentObj = {
  readyState: 'complete',
  body: {},
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {}
};
const context = {
  window: windowObj,
  document: documentObj,
  MutationObserver: class { observe() {} },
  requestAnimationFrame(fn) { fn(); },
  getComputedStyle() { return { display: 'none' }; },
  setTimeout() { return 0; },
  setInterval() { return 0; },
  console,
  Date,
  Math,
  Number,
  String,
  Array,
  Object,
  Boolean,
  JSON
};
context.window = Object.assign(windowObj, context);
vm.runInNewContext(app.slice(start, end), context);

const isCompliant = context.window.fireSProductionIsCompliant;
assert.ok(typeof isCompliant === 'function', 'Compliant helper must export');

const historyOnly = {
  id: 'alpha',
  inspectionStatus: 'finalised',
  answers: [],
  inspectionHistory: [{
    inspectionNumber: 'FS-100',
    completedAt: '2026-09-14T08:00:00.000Z',
    answers: [{ answer: 'Yes' }, { answer: 'Yes' }]
  }]
};
assert.strictEqual(
  isCompliant(historyOnly),
  true,
  'A completed all-clear inspection must stay Compliant after refresh when answers sit in History'
);

const historyFindings = {
  id: 'beta',
  inspectionStatus: 'finalised',
  answers: [],
  inspectionHistory: [{
    inspectionNumber: 'FS-101',
    completedAt: '2026-09-14T09:00:00.000Z',
    answers: [{ answer: 'Yes' }, { answer: 'No' }]
  }]
};
assert.strictEqual(
  isCompliant(historyFindings),
  false,
  'Completed History with a No answer must not count as Compliant'
);

const liveCompleted = {
  id: 'gamma',
  completedAt: '2026-09-14T10:00:00.000Z',
  answers: [{ answer: 'Yes' }]
};
assert.strictEqual(
  isCompliant(liveCompleted),
  true,
  'A just-finalised all-clear inspection must count as Compliant before refresh'
);

console.log('compliant-history-status.test.js: ok');
