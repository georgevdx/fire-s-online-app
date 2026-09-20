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
  /function fireSPaintLeftoverCommandSubtitle\(el, text\)/.test(app) &&
    /if \(window\.__fireS136A10Installed\) return/.test(app) &&
    /function hideOwnerCountLine\(\)\{/.test(app) &&
    /window\.fireSPaintOwnerCommandSubtitle = hideOwnerCountLine/.test(app) &&
    /A short phone pull must not become the finished Home count/.test(app) &&
    /__fireSCloudPullSettled === false/.test(app),
  'Owner Home must hide the duplicate count line and wait for a complete cloud pull'
);

const leftoverNames = [
  'FIRE-S RC 1.3.6A.6',
  'FIRE-S RC 1.3.6A.7',
  'FIRE-S RC 1.3.6A.8',
  'FIRE-S RC 1.3.6A.9'
];
leftoverNames.forEach((name, idx) => {
  const start = app.indexOf(name);
  const end = idx < leftoverNames.length - 1
    ? app.indexOf(leftoverNames[idx + 1], start)
    : app.indexOf('FIRE-S RC 1.3.6A.10', start);
  const slice = app.slice(start, end);
  assert.ok(start > 0 && end > start, name + ' must exist');
  assert.ok(
    /fireSPaintLeftoverCommandSubtitle\(/.test(slice),
    name + ' must yield the count line to 136A10'
  );
  assert.ok(
    !/subtitle\.textContent = `\$\{/.test(slice),
    name + ' must not write mainCommandSubtitle itself'
  );
});

assert.ok(
  /Version 1\.3\.102-toets/.test(html) &&
    /app\.js\?v=1-3-102-pay/.test(html),
  'Toets must cache-bust the hidden Command Centre summary and stable Home counts'
);

const start = app.indexOf('(function fireS136A10StableVisibleKpis(){');
const end = app.indexOf('(function fireS136A11ProjectKpiSingleMatcher(){', start);
assert.ok(start > 0 && end > start, '136A10 KPI matcher must exist');

const subtitle = {
  textContent: 'Showing 6 inspections available in this workspace.',
  hidden: false,
  style: { display: '', setProperty(name, value) { this[name] = value; }, removeProperty() {} },
  setAttribute() {},
  removeAttribute() {}
};
const row = {
  hidden: false,
  style: { display: '', setProperty() {} },
  classList: { add() {} },
  getAttribute() { return ''; },
  setAttribute() {},
  removeAttribute() {},
  querySelector() { return { textContent: '4' }; },
  innerHTML: ''
};
const body = { classList: { contains() { return false; } } };
const nodes = {
  mainCommandSubtitle: subtitle,
  fireSOwnerKpiRow: row,
  mainCommandCentre: { querySelector() { return null; }, insertBefore() {}, appendChild() {} },
  homeSection: { style: { display: 'block' } },
  projectListSection: { style: { display: 'none' } }
};

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 3);
const overdueDay = yesterday.toISOString().slice(0, 10);
const thisMonth = new Date().toISOString().slice(0, 10);

const projects = [
  {
    id: 'action-only',
    inspectionStatus: 'finalised',
    completedAt: thisMonth + 'T08:00:00.000Z',
    answers: [{ answer: 'No' }]
  },
  {
    id: 'late-site',
    inspectionStatus: 'finalised',
    scheduledDate: overdueDay,
    answers: [{ answer: 'No' }]
  },
  {
    id: 'clear-site',
    inspectionStatus: 'finalised',
    completedAt: thisMonth + 'T08:00:00.000Z',
    answers: [{ answer: 'Yes' }]
  },
  {
    id: 'history-clear',
    status: 'open',
    inspectionHistory: [{
      completedAt: '2026-07-21T08:00:00.000Z',
      answers: [{ answer: 'Yes' }]
    }]
  }
];

const windowObj = {
  __fireS136A10Installed: false,
  setTimeout() { return 0; },
  setInterval() { return 0; },
  addEventListener() {},
  getProjects() { return projects; },
  getVisibleProjectsForCurrentUser(list) { return list; },
  fireSIsInspectionOverdue(project) {
    const day = String(project && (project.scheduledDate || project.followUpDate) || '').slice(0, 10);
    return Boolean(day && day < new Date().toISOString().slice(0, 10));
  },
  MutationObserver: class { observe() {} }
};

const context = {
  window: windowObj,
  document: {
    readyState: 'complete',
    body,
    getElementById(id) { return nodes[id] || null; },
    querySelector(sel) {
      if (sel === '.main-command-top p') return subtitle;
      if (sel === '#mainCommandCentre .main-command-stats') return null;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() { return row; }
  },
  MutationObserver: class { observe() {} },
  requestAnimationFrame(fn) { fn(); },
  getComputedStyle(el) {
    return { display: el && el.style && el.style.display ? el.style.display : 'block' };
  },
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
const helperStart = app.indexOf('function fireSPaintLeftoverCommandSubtitle');
const helperEnd = app.indexOf('// FIRE-S RC 1.3.1', helperStart);
const leftoverStart = app.indexOf('(function fireS136A9CompliantFinalAlignment(){');
assert.ok(helperStart > 0 && helperEnd > helperStart, 'leftover subtitle helper must exist');
assert.ok(leftoverStart > 0 && leftoverStart < start, '136A9 leftover sync must exist');
vm.runInNewContext(
  app.slice(helperStart, helperEnd) + app.slice(leftoverStart, start) + app.slice(start, end),
  context
);

const productionCounts = { action: 1, overdue: 1, scheduled: 0, compliant: 2, month: 3 };
const counts = context.window.fireSProductionKpiCounts();
assert.deepStrictEqual(
  {
    action: counts.action,
    overdue: counts.overdue,
    scheduled: counts.scheduled,
    compliant: counts.compliant,
    month: counts.month
  },
  productionCounts,
  'KPI cards must use the same exclusive Action vs Overdue buckets on laptop and phone'
);
assert.strictEqual(subtitle.hidden, true, 'Owner Home must hide the duplicate count line');
assert.strictEqual(subtitle.textContent, '', 'Owner count line must be empty once the cards are shown');

assert.ok(typeof context.window.fireS136A9SyncKpis === 'function', '136A9 sync must export');
context.window.fireS136A9SyncKpis();
context.window.fireS136A9SyncKpis();
context.window.fireS136A9SyncKpis();
assert.strictEqual(subtitle.hidden, true, 'Leftover 136A9 must not bring the duplicate count line back');
assert.strictEqual(subtitle.textContent, '', 'Leftover 136A9 must not rewrite the hidden count line');

const leftover = '2 premises require action · 1 overdue · 0 scheduled · 1 compliant · 3 this month.';
context.window.fireSPaintLeftoverCommandSubtitle(subtitle, leftover);
assert.strictEqual(subtitle.textContent, '', 'Leftover KPI layers must not flip counts after 136A10 is installed');

context.window.fireSPaintOwnerCommandSubtitle();
assert.strictEqual(subtitle.hidden, true, 'Hiding the owner count line again must keep it hidden');

subtitle.textContent = leftover;
subtitle.hidden = false;
context.window.fireSProductionRenderKpis();
assert.strictEqual(subtitle.hidden, true, '136A10 must hide the count line if a leftover write slips through');
assert.strictEqual(subtitle.textContent, '', '136A10 must clear leftover count text');

console.log('stable-command-counts.test.js: ok');
