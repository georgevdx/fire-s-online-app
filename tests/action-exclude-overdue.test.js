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

assert.ok(
  /Same exclusive bucket as the card pill/.test(app) &&
    /Same exclusive bucket as the card pill/.test(read('app.js')),
  'Action Required must not also count an Overdue premises on toets or live'
);
assert.ok(
  /app\.js\?v=1-3-102-pay/.test(html) &&
    /Version 1\.3\.102-toets/.test(html),
  'Toets must cache-bust exclusive Action vs Overdue without bumping the displayed version'
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
const context = {
  window: windowObj,
  document: {
    readyState: 'complete',
    body: {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  },
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

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 3);
const overdueDay = yesterday.toISOString().slice(0, 10);

context.window.fireSIsInspectionOverdue = function (project) {
  const day = String(project && (project.scheduledDate || project.followUpDate) || '').slice(0, 10);
  return Boolean(day && day < new Date().toISOString().slice(0, 10));
};

vm.runInNewContext(app.slice(start, end), context);

const matches = context.window.fireSProductionKpiMatches;
assert.ok(typeof matches === 'function', 'KPI matcher must export');

const actionOnly = {
  id: 'tester-1',
  inspectionStatus: 'finalised',
  answers: [],
  inspectionHistory: [{
    completedAt: '2026-07-21T08:00:00.000Z',
    answers: [{ answer: 'No' }, { answer: 'No' }]
  }]
};
assert.strictEqual(matches(actionOnly, 'inspection-attention'), true, 'History Nos stay Action Required');
assert.strictEqual(matches(actionOnly, 'overdue'), false, 'No next date stays off Overdue');

const overdueWithNos = {
  id: 'late-site',
  inspectionStatus: 'finalised',
  scheduledDate: overdueDay,
  answers: [],
  inspectionHistory: [{
    completedAt: '2026-08-01T08:00:00.000Z',
    answers: [{ answer: 'No' }]
  }]
};
assert.strictEqual(matches(overdueWithNos, 'overdue'), true, 'Past next date is Overdue');
assert.strictEqual(
  matches(overdueWithNos, 'inspection-attention'),
  false,
  'The same overdue premises must not also inflate Action Required on laptop vs phone'
);

console.log('action-exclude-overdue.test.js: ok');
