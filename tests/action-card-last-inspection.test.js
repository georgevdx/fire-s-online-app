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
const css = read('staging/styles.css');
const fit = read('staging/fire-s-fit-text.css');

assert.ok(
  /window\.fireSLatestInspectionActionCount = latestInspectionActionCount/.test(app),
  'Gateway Actions count must use the latest completed inspection, including History'
);
assert.ok(
  /function actionCount\(p\)\{/.test(app) &&
    /fireSLatestInspectionActionCount/.test(
      app.slice(
        app.indexOf('(function fireS136A11ProjectKpiSingleMatcher(){'),
        app.indexOf('function cardHtml(project){', app.indexOf('(function fireS136A11ProjectKpiSingleMatcher(){'))
      )
    ),
  'Mission Control cards must paint Actions from the last inspection helper'
);
assert.ok(
  /class="fire-s-action-status-label"/.test(app),
  'ACTION cards must mark the status pill so it can stay red with white type'
);
assert.ok(
  /\.fire-s-136a8-card\.action \.fire-s-136a8-card-top span/.test(css) &&
    /background: #b91c1c/.test(css) &&
    /color: #ffffff/.test(css),
  'ACTION label must be red with white text'
);
assert.ok(
  /#projectListSection \.fire-s-136a8-card\.action \.fire-s-136a8-card-top span/.test(fit) &&
    /background: #b91c1c !important/.test(fit) &&
    /-webkit-text-fill-color: #ffffff !important/.test(fit),
  'Dark Mode must keep the ACTION pill red with white type'
);
assert.ok(
  /app\.js\?v=1-3-94-company/.test(html) &&
    /service-worker\.js\?v=108-70-toets-94/.test(html) &&
    /Version 1\.3\.94-toets/.test(html),
  'Toets must cache-bust last-inspection Actions without bumping the displayed version'
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
vm.runInNewContext(app.slice(start, end), context);

const actionCount = context.window.fireSLatestInspectionActionCount;
assert.ok(typeof actionCount === 'function', 'Last-inspection action count must export');

const historyOnly = {
  id: 'tester-1',
  inspectionStatus: 'finalised',
  answers: [],
  actions: [],
  inspectionHistory: [{
    inspectionNumber: 'FS-200',
    completedAt: '2026-07-21T08:00:00.000Z',
    answers: [{ answer: 'Yes' }, { answer: 'No' }, { answer: 'No' }]
  }]
};
assert.strictEqual(
  actionCount(historyOnly),
  2,
  'ACTIONS must count No answers from the last completed inspection after refresh'
);

const currentWorkspace = {
  id: 'saverite',
  completedAt: '2026-08-20T10:00:00.000Z',
  answers: [{ answer: 'Yes' }, { answer: 'No' }]
};
assert.strictEqual(
  actionCount(currentWorkspace),
  1,
  'ACTIONS must still count No answers on a just-finalised inspection'
);

const allClear = {
  id: 'clear',
  inspectionStatus: 'finalised',
  answers: [],
  inspectionHistory: [{
    completedAt: '2026-08-01T08:00:00.000Z',
    answers: [{ answer: 'Yes' }, { answer: 'N/A' }]
  }]
};
assert.strictEqual(
  actionCount(allClear),
  0,
  'A completed all-clear inspection must keep Actions at 0'
);

console.log('action-card-last-inspection.test.js: ok');
